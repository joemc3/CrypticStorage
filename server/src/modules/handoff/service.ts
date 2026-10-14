import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { logger } from '../../lib/logger';
import { sendMail } from '../../lib/mail';
import { recipientNotice, ruleRevoked } from '../../mail/templates';
import { toFileDto } from '../dto';
import { assertFileOwnership } from '../files/service';
import { assertFolderOwnership, collectSubtree } from '../folders/service';
import { RELEASED_STATES_FOR_ACCESS } from './access';
import { ruleCoverageGaps } from './coverage';
import { WARNING_FRACTIONS } from './thresholds';
import type { addItemsSchema, createRuleSchema, replaceSharesSchema } from './schema';

type Tx = Prisma.TransactionClient;
type ShareInput = z.infer<typeof replaceSharesSchema>['shares'][number];
type ItemInput = z.infer<typeof addItemsSchema>['items'][number];

const MIN_PERIOD_DAYS = 7;
const MAX_PERIOD_DAYS = 3650;
const DAY_MS = 24 * 60 * 60 * 1000;

const fail = (code: string, message: string): BadRequestError => new BadRequestError(message, undefined, code);

const personSelect = { id: true, email: true, displayName: true } as const;

/** When the rule releases unless the owner is seen first. The timer job and the DTOs both read it from here. */
export function nextCheckInAt(lastActivityAt: Date, periodDays: number): Date {
  return new Date(lastActivityAt.getTime() + periodDays * DAY_MS);
}

/** When the first reminder goes out: 75 % of the period after the last activity. */
export function warningAt(lastActivityAt: Date, periodDays: number): Date {
  return new Date(lastActivityAt.getTime() + periodDays * DAY_MS * WARNING_FRACTIONS[75]);
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

type RuleRow = Prisma.HandoffRuleGetPayload<{ include: { recipients: { include: { user: { select: typeof personSelect } } } } }>;

function toRuleDto(row: RuleRow, ownerLastActivityAt: Date, gaps: number) {
  const open = row.state === 'active' || row.state === 'warning';
  return {
    id: row.id,
    fileId: row.fileId ?? undefined,
    folderId: row.folderId ?? undefined,
    periodDays: row.periodDays,
    state: row.state,
    createdAt: row.createdAt.toISOString(),
    nextCheckInAt: open ? nextCheckInAt(ownerLastActivityAt, row.periodDays).toISOString() : null,
    warningAt: open ? warningAt(ownerLastActivityAt, row.periodDays).toISOString() : null,
    sharesStale: row.sharesStale,
    coverageGaps: open ? gaps : 0,
    recipients: row.recipients
      .map((r) => ({
        userId: r.userId,
        email: r.user.email,
        displayName: r.user.displayName,
        notifiedAt: r.notifiedAt ? r.notifiedAt.toISOString() : null,
      }))
      .sort((a, b) => a.email.localeCompare(b.email)),
    releasedAt: row.releasedAt?.toISOString(),
    revokedAt: row.revokedAt?.toISOString(),
  };
}

const ruleInclude = { recipients: { include: { user: { select: personSelect } } } } as const;

async function dtosFor(ownerId: string, rows: RuleRow[]) {
  if (rows.length === 0) return [];
  const [owner, gaps] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: { lastActivityAt: true } }),
    ruleCoverageGaps(
      ownerId,
      rows.filter((r) => r.state === 'active' || r.state === 'warning')
    ),
  ]);
  return rows.map((r) => toRuleDto(r, owner.lastActivityAt, gaps.get(r.id) ?? 0));
}

async function findOwnedRule(ownerId: string, id: string): Promise<RuleRow> {
  const row = await prisma.handoffRule.findFirst({ where: { id, ownerId }, include: ruleInclude });
  if (!row) throw new NotFoundError('Rule not found');
  return row;
}

async function detail(ownerId: string, id: string) {
  const row = await findOwnedRule(ownerId, id);
  const [dto] = await dtosFor(ownerId, [row]);
  const items = await prisma.handoffRuleItem.findMany({ where: { ruleId: id }, select: { fileId: true }, orderBy: { fileId: 'asc' } });
  return { ...dto!, items, wrappedReleaseKeyOwner: row.wrappedReleaseKeyOwner };
}

// ---------------------------------------------------------------------------
// Checks shared by create and repair
// ---------------------------------------------------------------------------

function assertPeriod(periodDays: number): void {
  // The presets 30, 90, 365, 1825 and 3650 all fall inside the custom range.
  if (periodDays < MIN_PERIOD_DAYS || periodDays > MAX_PERIOD_DAYS) {
    throw fail('PERIOD', `The period must be between ${MIN_PERIOD_DAYS} and ${MAX_PERIOD_DAYS} days`);
  }
}

/** The owner's accepted witnesses, if the set is big enough for the threshold. */
async function readyWitnessIds(ownerId: string): Promise<string[]> {
  const [user, accepted] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: { witnessThreshold: true } }),
    prisma.witness.findMany({ where: { ownerId, status: 'accepted' }, select: { witnessUserId: true } }),
  ]);
  if (accepted.length < env.WITNESS_MIN_N || accepted.length < 2 || user.witnessThreshold > accepted.length) {
    throw fail('WITNESSES_NOT_READY', 'Your witnesses must have accepted, and be at least as many as the threshold');
  }
  return accepted.map((w) => w.witnessUserId);
}

function assertShares(witnessIds: string[], shares: ShareInput[]): void {
  const given = new Set(shares.map((s) => s.witnessUserId));
  const exact = shares.length === witnessIds.length && given.size === witnessIds.length && witnessIds.every((id) => given.has(id));
  if (!exact) throw fail('COVERAGE_SHARES', 'Shares must cover exactly your accepted witnesses, one each');
  const indexes = new Set(shares.map((s) => s.shareIndex));
  if (indexes.size !== shares.length || shares.some((s) => s.shareIndex < 1 || s.shareIndex > shares.length)) {
    throw fail('SHARE_INDEX', 'Share indexes must be distinct and between 1 and the number of witnesses');
  }
}

async function assertWitnessNotRecipient(witnessIds: string[], recipientIds: string[]): Promise<void> {
  if (env.WITNESS_MAY_BE_RECIPIENT) return;
  const overlap = recipientIds.some((id) => witnessIds.includes(id));
  if (overlap) throw fail('WITNESS_IS_RECIPIENT', 'This server does not allow a witness to also be a recipient');
}

/** Ready files a rule on this target covers. A folder covers its whole subtree. */
async function coveredFileIds(ownerId: string, target: { fileId: string | null; folderId: string | null }): Promise<string[]> {
  if (target.fileId) return [target.fileId];
  const folders = await collectSubtree(ownerId, target.folderId!);
  const files = await prisma.file.findMany({ where: { userId: ownerId, status: 'READY', folderId: { in: folders } }, select: { id: true } });
  return files.map((f) => f.id);
}

function assertItemCoverage(expected: string[], items: ItemInput[]): void {
  const given = new Set(items.map((i) => i.fileId));
  const exact = items.length === expected.length && given.size === expected.length && expected.every((id) => given.has(id));
  if (!exact) throw fail('COVERAGE_ITEMS', 'Items must cover every file under the target, one wrapped key each');
}

/** Lock a rule row and require it still be active or warning, so a concurrent revoke or release cannot interleave. */
async function lockOpenRule(tx: Tx, ruleId: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM handoff_rules WHERE id = ${ruleId} AND state IN ('active', 'warning') FOR UPDATE`;
  if (rows.length === 0) throw new ConflictError('This rule is no longer active');
}

function assertOpen(state: string): void {
  if (state !== 'active' && state !== 'warning') throw new ConflictError('This rule is no longer active');
}

function ownerName(owner: { email: string; displayName: string | null }): string {
  return owner.displayName ?? owner.email;
}

// ---------------------------------------------------------------------------
// Owner endpoints
// ---------------------------------------------------------------------------

export async function createRule(ownerId: string, input: z.infer<typeof createRuleSchema>, req: Request) {
  if (Boolean(input.fileId) === Boolean(input.folderId)) throw fail('TARGET', 'Name exactly one of fileId and folderId');
  if (input.fileId) await assertFileOwnership(ownerId, input.fileId);
  else await assertFolderOwnership(ownerId, input.folderId!);
  assertPeriod(input.periodDays);

  // Recipients
  if (input.recipients.length === 0) throw fail('NO_RECIPIENTS', 'Name at least one recipient');
  const recipientIds = input.recipients.map((r) => r.userId);
  if (new Set(recipientIds).size !== recipientIds.length) throw fail('RECIPIENT_DUPLICATE', 'A recipient is listed twice');
  if (recipientIds.includes(ownerId)) throw fail('RECIPIENT_IS_OWNER', 'You cannot name yourself as a recipient');
  const found = await prisma.user.findMany({ where: { id: { in: recipientIds }, emailVerifiedAt: { not: null } }, select: personSelect });
  if (found.length !== recipientIds.length) throw fail('RECIPIENT_NOT_FOUND', 'Every recipient must be a verified account');

  // Witnesses and shares
  const witnessIds = await readyWitnessIds(ownerId);
  assertShares(witnessIds, input.shares);
  await assertWitnessNotRecipient(witnessIds, recipientIds);

  // Items
  const target = { fileId: input.fileId ?? null, folderId: input.folderId ?? null };
  assertItemCoverage(await coveredFileIds(ownerId, target), input.items);

  const rule = await prisma.$transaction(async (tx) => {
    const created = await tx.handoffRule.create({
      data: { ownerId, ...target, periodDays: input.periodDays, wrappedReleaseKeyOwner: input.wrappedReleaseKeyOwner },
    });
    await tx.handoffRuleRecipient.createMany({
      data: input.recipients.map((r) => ({ ruleId: created.id, userId: r.userId, wrappedReleaseKey: r.wrappedReleaseKey })),
    });
    await tx.handoffRuleItem.createMany({
      data: input.items.map((i) => ({ ruleId: created.id, fileId: i.fileId, wrappedFileKey: i.wrappedFileKey })),
    });
    await tx.handoffRuleShare.createMany({
      data: input.shares.map((s) => ({ ruleId: created.id, witnessUserId: s.witnessUserId, shareIndex: s.shareIndex, wrappedShare: s.wrappedShare })),
    });
    return created;
  });

  // Mail after the commit. A recipient whose mail failed keeps notifiedAt null; the rule stands.
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: personSelect });
  const link = `${env.APP_URL}/dashboard`;
  const notified: string[] = [];
  for (const recipient of found) {
    try {
      await sendMail({ to: recipient.email, ...recipientNotice(ownerName(owner), link) });
      notified.push(recipient.id);
    } catch (err) {
      logger.warn({ err, ruleId: rule.id }, 'recipient notice not sent');
    }
  }
  if (notified.length) {
    await prisma.handoffRuleRecipient.updateMany({ where: { ruleId: rule.id, userId: { in: notified } }, data: { notifiedAt: new Date() } });
  }
  audit(req, {
    userId: ownerId,
    action: 'handoff.rule.create',
    resourceType: 'handoff_rule',
    resourceId: rule.id,
    metadata: { periodDays: input.periodDays, recipients: recipientIds.length, items: input.items.length, witnesses: witnessIds.length },
  });
  return detail(ownerId, rule.id);
}

export async function listRules(ownerId: string) {
  const rows = await prisma.handoffRule.findMany({ where: { ownerId }, include: ruleInclude, orderBy: { createdAt: 'desc' } });
  return dtosFor(ownerId, rows);
}

export function getRule(ownerId: string, id: string) {
  return detail(ownerId, id);
}

export async function revokeRule(ownerId: string, id: string, req: Request) {
  const rule = await findOwnedRule(ownerId, id);
  assertOpen(rule.state);
  await prisma.$transaction(async (tx) => {
    await lockOpenRule(tx, id);
    await tx.handoffRule.update({ where: { id }, data: { state: 'revoked', revokedAt: new Date(), wrappedReleaseKeyOwner: '' } });
    await tx.handoffRuleRecipient.deleteMany({ where: { ruleId: id } });
    await tx.handoffRuleItem.deleteMany({ where: { ruleId: id } });
    await tx.handoffRuleShare.deleteMany({ where: { ruleId: id } });
  });

  const owner = await prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: personSelect });
  const link = `${env.APP_URL}/dashboard`;
  for (const r of rule.recipients) {
    try {
      await sendMail({ to: r.user.email, ...ruleRevoked(ownerName(owner), link) });
    } catch (err) {
      logger.warn({ err, ruleId: id }, 'revoke notice not sent');
    }
  }
  audit(req, { userId: ownerId, action: 'handoff.rule.revoke', resourceType: 'handoff_rule', resourceId: id, metadata: { recipients: rule.recipients.length } });
  const [dto] = await dtosFor(ownerId, [await findOwnedRule(ownerId, id)]);
  return dto!;
}

export async function replaceShares(ownerId: string, id: string, shares: ShareInput[], req: Request) {
  const rule = await findOwnedRule(ownerId, id);
  assertOpen(rule.state);
  const witnessIds = await readyWitnessIds(ownerId);
  assertShares(witnessIds, shares);
  await assertWitnessNotRecipient(
    witnessIds,
    rule.recipients.map((r) => r.userId)
  );
  await prisma.$transaction(async (tx) => {
    await lockOpenRule(tx, id);
    await tx.handoffRuleShare.deleteMany({ where: { ruleId: id } });
    await tx.handoffRuleShare.createMany({
      data: shares.map((s) => ({ ruleId: id, witnessUserId: s.witnessUserId, shareIndex: s.shareIndex, wrappedShare: s.wrappedShare })),
    });
    await tx.handoffRule.update({ where: { id }, data: { sharesStale: false } });
  });
  audit(req, { userId: ownerId, action: 'handoff.rule.shares', resourceType: 'handoff_rule', resourceId: id, metadata: { witnesses: shares.length } });
  return detail(ownerId, id);
}

export async function addItems(ownerId: string, id: string, items: ItemInput[], req: Request) {
  const rule = await findOwnedRule(ownerId, id);
  assertOpen(rule.state);
  const covered = new Set(await coveredFileIds(ownerId, rule));
  if (items.some((i) => !covered.has(i.fileId))) throw fail('ITEM_NOT_UNDER_TARGET', 'Every item must be a ready file under the rule target');

  const present = new Set((await prisma.handoffRuleItem.findMany({ where: { ruleId: id }, select: { fileId: true } })).map((i) => i.fileId));
  const fresh = new Map<string, ItemInput>();
  for (const item of items) if (!present.has(item.fileId) && !fresh.has(item.fileId)) fresh.set(item.fileId, item);

  await prisma.$transaction(async (tx) => {
    await lockOpenRule(tx, id);
    await tx.handoffRuleItem.createMany({
      data: [...fresh.values()].map((i) => ({ ruleId: id, fileId: i.fileId, wrappedFileKey: i.wrappedFileKey })),
      skipDuplicates: true,
    });
  });
  if (fresh.size) audit(req, { userId: ownerId, action: 'handoff.rule.items', resourceType: 'handoff_rule', resourceId: id, metadata: { added: fresh.size } });
  return detail(ownerId, id);
}

// ---------------------------------------------------------------------------
// Recipient views
// ---------------------------------------------------------------------------

const RELEASED_STATES = RELEASED_STATES_FOR_ACCESS;

function releasedBy(state: string): 'timer' | 'quorum' | undefined {
  return state === 'released_timer' ? 'timer' : state === 'released_quorum' ? 'quorum' : undefined;
}

/** The owner's own wrapping of the file key means nothing to a recipient and is never sent to one. */
function fileForRecipient(file: Parameters<typeof toFileDto>[0]) {
  return { ...toFileDto(file), encryptedFileKey: '', fileKeyIV: '' };
}

/**
 * The shares re-wrapped for `userId` by the request that released each quorum rule, keyed by rule id. Shares left by
 * requests that did not complete are never served.
 */
async function voteSharesFor(userId: string, ruleIds: string[]): Promise<Map<string, Array<{ witnessUserId: string; wrappedShare: string }>>> {
  const out = new Map<string, Array<{ witnessUserId: string; wrappedShare: string }>>();
  if (ruleIds.length === 0) return out;
  const rows = await prisma.releaseVoteShare.findMany({
    where: { recipientUserId: userId, ruleId: { in: ruleIds }, request: { state: 'completed' } },
    orderBy: [{ ruleId: 'asc' }, { witnessUserId: 'asc' }],
  });
  for (const r of rows) out.set(r.ruleId, [...(out.get(r.ruleId) ?? []), { witnessUserId: r.witnessUserId, wrappedShare: r.wrappedShare }]);
  return out;
}

export async function forMe(userId: string) {
  const rows = await prisma.handoffRule.findMany({
    where: { recipients: { some: { userId } } },
    include: { owner: { select: personSelect }, recipients: { where: { userId } } },
    orderBy: { createdAt: 'desc' },
  });
  const releasedIds = rows.filter((r) => releasedBy(r.state)).map((r) => r.id);
  const [items, voteShares] = await Promise.all([
    releasedIds.length
      ? prisma.handoffRuleItem.findMany({ where: { ruleId: { in: releasedIds }, file: { status: 'READY' } }, include: { file: true }, orderBy: { fileId: 'asc' } })
      : [],
    voteSharesFor(
      userId,
      rows.filter((r) => r.state === 'released_quorum').map((r) => r.id)
    ),
  ]);
  return rows.map((rule) => {
    const base = {
      id: rule.id,
      owner: rule.owner,
      state: rule.state,
      createdAt: rule.createdAt.toISOString(),
      releasedAt: rule.releasedAt?.toISOString(),
      releasedBy: releasedBy(rule.state),
    };
    // Before release the recipient learns only that the rule exists.
    if (!releasedBy(rule.state)) return base;
    return {
      ...base,
      // After a timer release the key is here; after a quorum release it is recombined from the witnesses' shares.
      wrappedReleaseKey: rule.state === 'released_timer' ? rule.recipients[0]?.wrappedReleaseKey : undefined,
      voteShares: rule.state === 'released_quorum' ? (voteShares.get(rule.id) ?? []) : undefined,
      items: items.filter((i) => i.ruleId === rule.id).map((i) => ({ fileId: i.fileId, wrappedFileKey: i.wrappedFileKey, file: fileForRecipient(i.file) })),
    };
  });
}

/** Files that reached `userId` through a released rule, in the shape of Shared-with-me rows. */
export async function releasedItemsFor(userId: string) {
  const rows = await prisma.handoffRuleItem.findMany({
    where: { file: { status: 'READY' }, rule: { state: { in: [...RELEASED_STATES] }, recipients: { some: { userId } } } },
    include: {
      file: true,
      rule: { include: { owner: { select: personSelect }, recipients: { where: { userId } } } },
    },
    orderBy: [{ rule: { releasedAt: 'desc' } }, { fileId: 'asc' }],
  });
  const voteShares = await voteSharesFor(
    userId,
    [...new Set(rows.filter((r) => r.rule.state === 'released_quorum').map((r) => r.ruleId))]
  );
  return rows.map((row) => {
    const by = releasedBy(row.rule.state)!;
    return {
      ...fileForRecipient(row.file),
      shareId: `handoff:${row.ruleId}:${row.fileId}`,
      permissions: 'read',
      expiresAt: undefined,
      sharedBy: { id: row.rule.owner.id, email: row.rule.owner.email },
      handoff: {
        ruleId: row.ruleId,
        from: row.rule.owner,
        releasedAt: (row.rule.releasedAt ?? row.rule.createdAt).toISOString(),
        by,
        // After a quorum release the key comes from the witnesses' votes, not from here.
        wrappedReleaseKey: by === 'timer' ? row.rule.recipients[0]?.wrappedReleaseKey : undefined,
        voteShares: by === 'quorum' ? (voteShares.get(row.ruleId) ?? []) : undefined,
        wrappedFileKey: row.wrappedFileKey,
      },
    };
  });
}
