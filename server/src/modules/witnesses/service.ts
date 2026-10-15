import type { Request } from 'express';
import type { Prisma, Witness } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError, BadRequestError, ConflictError, NotFoundError } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { spkiFingerprint } from '../../lib/crypto';
import { logger } from '../../lib/logger';
import { sendMail } from '../../lib/mail';
import { witnessInvitation } from '../../mail/templates';
import { announceCancelled, cancelOpenRequestsTx, dropOpenVoteShares, lockOpenRequestsTx, lockOwnerTx } from '../handoff/requests';

type Tx = Prisma.TransactionClient;

interface ActiveRuleRef {
  id: string;
  sharesStale: boolean;
}

/**
 * Change the owner's witness set or threshold, and in the same transaction flag every open rule's shares as stale
 * (they no longer match the set) and drop the vote shares re-wrapped from the old split. The owner's client re-splits
 * each release key at next unlock and replaces the shares.
 *
 * Lock order, the same on every path that touches an owner's rules: open request rows (by id), then the owner's users
 * row, then the open rule rows (by id). `change` runs between the user lock and the rule locks.
 */
async function changeSet<T>(ownerId: string, cancelRequests: boolean, change: (tx: Tx) => Promise<T>): Promise<{ result: T; rules: ActiveRuleRef[] }> {
  const { result, rules, cancelled } = await prisma.$transaction(async (tx) => {
    // The request lock comes first, so no vote can complete on the old split once the rules read as stale.
    let cancelled: string[] = [];
    if (cancelRequests) cancelled = await cancelOpenRequestsTx(tx, ownerId, 'owner_change');
    else await lockOpenRequestsTx(tx, ownerId);
    // Then the owner's row, which a rule create or re-split holds while it checks its k against the threshold.
    await lockOwnerTx(tx, ownerId);
    const result = await change(tx);
    // Then the rules, in byte order of id: a completing vote claims them in that order while holding the request.
    await tx.$queryRaw`SELECT id FROM handoff_rules WHERE owner_id = ${ownerId} AND state IN ('active', 'warning') ORDER BY id COLLATE "C" FOR NO KEY UPDATE`;
    await tx.handoffRule.updateMany({ where: { ownerId, state: { in: ['active', 'warning'] } }, data: { sharesStale: true } });
    const rules = await tx.handoffRule.findMany({
      where: { ownerId, state: { in: ['active', 'warning'] } },
      select: { id: true, sharesStale: true },
      orderBy: { createdAt: 'asc' },
    });
    // Shares re-wrapped from the old split must not combine with shares from the new one.
    await dropOpenVoteShares(
      rules.map((r) => r.id),
      tx
    );
    return { result, rules, cancelled };
  });
  await announceCancelled(ownerId, cancelled, 'owner_change');
  return { result, rules };
}

const MIN_K = 2;

interface Person {
  id: string;
  email: string;
  displayName: string | null;
}

const personSelect = { id: true, email: true, displayName: true } as const;

type RowWithWitness = Witness & { witness: Person & { publicKey: string } };
type RowWithOwner = Witness & { owner: Person };

function entry(row: RowWithWitness) {
  const { witness } = row;
  return {
    id: row.id,
    user: {
      id: witness.id,
      email: witness.email,
      displayName: witness.displayName,
      publicKey: witness.publicKey,
      fingerprint: spkiFingerprint(witness.publicKey),
    },
    status: row.status,
    invitedAt: row.invitedAt.toISOString(),
    respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
  };
}

function invitation(row: RowWithOwner) {
  return {
    id: row.id,
    owner: { id: row.owner.id, email: row.owner.email, displayName: row.owner.displayName },
    status: row.status,
    invitedAt: row.invitedAt.toISOString(),
    respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
  };
}

/** The size n of the set: only invited and accepted witnesses hold a slot. */
function setSize(ownerId: string, db: Tx | typeof prisma = prisma): Promise<number> {
  return db.witness.count({ where: { ownerId, status: { in: ['invited', 'accepted'] } } });
}

/** Fit k to the current set, but never below 2. With fewer than 2 left the set is simply incomplete. Under the owner's lock. */
async function refitThresholdTx(tx: Tx, ownerId: string): Promise<number> {
  const [n, threshold] = await Promise.all([setSize(ownerId, tx), thresholdOf(ownerId, tx)]);
  const next = Math.max(MIN_K, Math.min(threshold, n));
  if (next !== threshold) await tx.user.update({ where: { id: ownerId }, data: { witnessThreshold: next } });
  return next;
}

const withWitness = { witness: { select: { ...personSelect, publicKey: true } } } as const;

async function thresholdOf(ownerId: string, db: Tx | typeof prisma = prisma): Promise<number> {
  const user = await db.user.findUnique({ where: { id: ownerId }, select: { witnessThreshold: true } });
  if (!user) throw new NotFoundError('User not found');
  return user.witnessThreshold;
}

export async function getSet(ownerId: string) {
  const [threshold, rows] = await Promise.all([
    thresholdOf(ownerId),
    prisma.witness.findMany({
      where: { ownerId, status: { not: 'removed' } },
      include: withWitness,
      orderBy: { invitedAt: 'asc' },
    }),
  ]);
  return { threshold, minN: env.WITNESS_MIN_N, maxN: env.WITNESS_MAX_N, witnesses: rows.map(entry) };
}

export async function setThreshold(ownerId: string, k: number, req: Request) {
  // The new k and the stale flag land together, so no split can be accepted against a k that is about to change.
  const { result: n, rules: activeRules } = await changeSet(ownerId, true, async (tx) => {
    const n = await setSize(ownerId, tx);
    const upper = Math.min(n, env.WITNESS_MAX_N);
    if (k < MIN_K || k > upper) {
      throw new BadRequestError(`The threshold must be between ${MIN_K} and the number of witnesses (${n}), at most ${env.WITNESS_MAX_N}`);
    }
    await tx.user.update({ where: { id: ownerId }, data: { witnessThreshold: k } });
    return n;
  });
  audit(req, { userId: ownerId, action: 'witness.threshold', metadata: { k, n } });
  return { ...(await getSet(ownerId)), activeRules };
}

export async function invite(ownerId: string, rawEmail: string, req: Request) {
  const target = await prisma.user.findUnique({ where: { email: rawEmail } });
  // Same answer for "no account" and "not verified", so nothing is learned beyond what sharing already shows.
  if (!target || !target.emailVerifiedAt) throw new AppError(404, 'No verified account with that email', 'NO_ACCOUNT');
  if (target.id === ownerId) throw new BadRequestError('You cannot be your own witness');

  const existing = await prisma.witness.findUnique({
    where: { ownerId_witnessUserId: { ownerId, witnessUserId: target.id } },
  });
  if (existing && (existing.status === 'invited' || existing.status === 'accepted')) {
    throw new ConflictError('This person is already one of your witnesses');
  }
  const active = await setSize(ownerId);
  if (active >= env.WITNESS_MAX_N) throw new BadRequestError(`You can have at most ${env.WITNESS_MAX_N} witnesses`);

  const now = new Date();
  const { row, cancelled } = await prisma.$transaction(async (tx) => {
    // The set is changing, so any open request goes first, under the request lock; its mails follow the commit.
    const cancelled = await cancelOpenRequestsTx(tx, ownerId);
    const row = existing
      ? await tx.witness.update({ where: { id: existing.id }, data: { status: 'invited', invitedAt: now, respondedAt: null }, include: withWitness })
      : await tx.witness.create({ data: { ownerId, witnessUserId: target.id, invitedAt: now }, include: withWitness });
    return { row, cancelled };
  });
  await announceCancelled(ownerId, cancelled, 'owner_change');

  await sendInvitation(ownerId, row.id, target.email);
  audit(req, { userId: ownerId, action: 'witness.invite', resourceType: 'witness', resourceId: row.id });
  return entry(row);
}

/**
 * Mail the invitation. The row is already committed, so a failed send is logged and the answer stays a success; the
 * owner can send it again with `resend`.
 */
async function sendInvitation(ownerId: string, witnessId: string, to: string): Promise<boolean> {
  try {
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: personSelect });
    await sendMail({ to, ...witnessInvitation(owner.displayName ?? owner.email, `${env.APP_URL}/witness/${witnessId}`) });
    return true;
  } catch (err) {
    logger.warn({ err, witnessId }, 'witness invitation not sent');
    return false;
  }
}

/** Send an invited witness their invitation again. Owner only; invited rows only. */
export async function resend(ownerId: string, id: string, req: Request) {
  const row = await prisma.witness.findFirst({ where: { id, ownerId }, include: withWitness });
  if (!row || row.status === 'removed') throw new NotFoundError('Witness not found');
  if (row.status !== 'invited') throw new ConflictError('Only a pending invitation can be sent again');
  if (!(await sendInvitation(ownerId, row.id, row.witness.email))) {
    throw new AppError(502, 'The invitation could not be sent. Try again later.', 'MAIL_FAILED');
  }
  audit(req, { userId: ownerId, action: 'witness.resend', resourceType: 'witness', resourceId: row.id });
  return entry(row);
}

export async function remove(ownerId: string, id: string, req: Request) {
  const row = await prisma.witness.findFirst({ where: { id, ownerId, status: { not: 'removed' } } });
  if (!row) throw new NotFoundError('Witness not found');
  // The removal, the refit k and the stale flag commit together.
  const { result: next, rules: activeRules } = await changeSet(ownerId, true, async (tx) => {
    const res = await tx.witness.updateMany({ where: { id, ownerId, status: { not: 'removed' } }, data: { status: 'removed', respondedAt: new Date() } });
    if (res.count === 0) throw new NotFoundError('Witness not found');
    return refitThresholdTx(tx, ownerId);
  });
  audit(req, { userId: ownerId, action: 'witness.remove', resourceType: 'witness', resourceId: id });
  return { threshold: next, activeRules };
}

/**
 * Ruling R42: `userId` is deleting their account. For every owner they serve as an accepted witness, cancel any open
 * request, drop the witness's vote shares, take them out of the set, refit k and flag the open rules stale, before
 * the account delete cascades the rows away. Remaining witnesses hear about a cancelled request as usual.
 */
export async function withdrawFromAllSets(userId: string): Promise<void> {
  const served = await prisma.witness.findMany({ where: { witnessUserId: userId, status: 'accepted' }, select: { ownerId: true } });
  for (const { ownerId } of served) {
    await changeSet(ownerId, true, async (tx) => {
      await tx.releaseVoteShare.deleteMany({ where: { witnessUserId: userId, request: { ownerId } } });
      await tx.witness.deleteMany({ where: { ownerId, witnessUserId: userId } });
      await refitThresholdTx(tx, ownerId);
    });
    audit(undefined, { userId: ownerId, action: 'witness.account_deleted', metadata: { witnessUserId: userId } });
  }
}

export async function myInvitations(userId: string) {
  const rows = await prisma.witness.findMany({
    where: { witnessUserId: userId, status: { in: ['invited', 'accepted'] } },
    include: { owner: { select: personSelect } },
    orderBy: { invitedAt: 'asc' },
  });
  return {
    invitations: rows
      .filter((r) => r.status === 'invited')
      .map((r) => ({ id: r.id, owner: invitation(r).owner, invitedAt: r.invitedAt.toISOString() })),
    serving: rows
      .filter((r) => r.status === 'accepted')
      .map((r) => ({ id: r.id, owner: invitation(r).owner, respondedAt: r.respondedAt ? r.respondedAt.toISOString() : null })),
  };
}

export async function respond(userId: string, id: string, decision: 'accepted' | 'declined', req: Request) {
  const row = await prisma.witness.findFirst({ where: { id, witnessUserId: userId }, include: { owner: { select: personSelect } } });
  if (!row || row.status === 'removed') throw new NotFoundError('Invitation not found');
  // The answer, a refit k and the stale flag commit together.
  await changeSet(row.ownerId, false, async (tx) => {
    // Conditional update so two concurrent answers cannot both win.
    const claimed = await tx.witness.updateMany({
      where: { id, status: 'invited' },
      data: { status: decision, respondedAt: new Date() },
    });
    if (claimed.count === 0) throw new ConflictError('This invitation has already been answered');
    if (decision === 'declined') await refitThresholdTx(tx, row.ownerId);
  });
  audit(req, {
    userId,
    action: decision === 'accepted' ? 'witness.accept' : 'witness.decline',
    resourceType: 'witness',
    resourceId: id,
    metadata: { ownerId: row.ownerId },
  });
  return invitation(await prisma.witness.findUniqueOrThrow({ where: { id }, include: { owner: { select: personSelect } } }));
}
