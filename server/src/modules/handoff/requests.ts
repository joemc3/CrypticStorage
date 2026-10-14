import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError, BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { logger } from '../../lib/logger';
import { sendMail } from '../../lib/mail';
import { mailTime, releaseCompleted, releasedRecipient, requestCancelled, requestOpenedOwner, requestOpenedWitness, voteAdded } from '../../mail/templates';
import type { voteSchema } from './schema';

/**
 * Release by quorum. The server stores re-wrapped shares it cannot read and counts votes; it never holds
 * a release key or a share in clear. Every state change is a conditional write, so two racing requests
 * cannot both win.
 */

const OPEN_RULE_STATES = ['active', 'warning'] as const;
const LIST_CAP = 50;
const person = { id: true, email: true, displayName: true } as const;
const name = (p: { email: string; displayName: string | null }) => p.displayName ?? p.email;

const conflict = (message: string, code: string) => new AppError(409, message, code);
const notAWitness = () => new ForbiddenError('You are not a witness for this person', 'NOT_A_WITNESS');
const nothingToRelease = () => new BadRequestError('There is nothing to release', undefined, 'NOTHING_TO_RELEASE');

/** Mail never throws into the request path. */
async function tryMail(to: string, mail: { subject: string; text: string }, context: Record<string, unknown>): Promise<void> {
  try {
    await sendMail({ to, ...mail });
  } catch (err) {
    logger.warn({ err, ...context }, 'release request mail not sent');
  }
}

function isAcceptedWitness(db: Prisma.TransactionClient | typeof prisma, ownerId: string, userId: string): Promise<boolean> {
  return db.witness.findFirst({ where: { ownerId, witnessUserId: userId, status: 'accepted' }, select: { id: true } }).then((r) => r !== null);
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

const requestInclude = {
  owner: { select: person },
  openedBy: { select: person },
  votes: { include: { witness: { select: person } }, orderBy: { votedAt: 'asc' } },
} satisfies Prisma.ReleaseRequestInclude;

type RequestRow = Prisma.ReleaseRequestGetPayload<{ include: typeof requestInclude }>;

/**
 * Open requests carry the owner's open rules as they are now, with the caller's own wrapped share for each and the
 * recipients' public keys to re-wrap for. Closed requests carry none of that. Only the caller's shares are ever sent.
 */
async function toDtos(userId: string, rows: RequestRow[]) {
  const ownerIds = [...new Set(rows.filter((r) => r.state === 'open').map((r) => r.ownerId))];
  const rules = ownerIds.length
    ? await prisma.handoffRule.findMany({
        where: { ownerId: { in: ownerIds }, state: { in: [...OPEN_RULE_STATES] } },
        include: { recipients: { include: { user: { select: { id: true, publicKey: true } } } }, shares: { where: { witnessUserId: userId } } },
        orderBy: { createdAt: 'asc' },
      })
    : [];

  return rows.map((r) => {
    const mine = r.state === 'open' ? rules.filter((rule) => rule.ownerId === r.ownerId) : [];
    return {
      id: r.id,
      owner: r.owner,
      openedBy: r.openedBy,
      state: r.state,
      requiredVotes: r.requiredVotes,
      openedAt: r.openedAt.toISOString(),
      closedAt: r.closedAt?.toISOString(),
      votes: r.votes.map((v) => ({ witnessUserId: v.witnessUserId, displayName: v.witness.displayName, email: v.witness.email, votedAt: v.votedAt.toISOString() })),
      myVote: r.votes.some((v) => v.witnessUserId === userId),
      rules: mine.map((rule) => ({
        ruleId: rule.id,
        sharesStale: rule.sharesStale,
        state: rule.state,
        recipients: rule.recipients.map((x) => ({ userId: x.userId, publicKey: x.user.publicKey })).sort((a, b) => a.userId.localeCompare(b.userId)),
      })),
      myShares: mine
        .filter((rule) => !rule.sharesStale && rule.shares[0])
        .map((rule) => ({ ruleId: rule.id, shareIndex: rule.shares[0]!.shareIndex, wrappedShare: rule.shares[0]!.wrappedShare })),
    };
  });
}

async function dtoFor(userId: string, id: string) {
  const row = await prisma.releaseRequest.findUniqueOrThrow({ where: { id }, include: requestInclude });
  const [dto] = await toDtos(userId, [row]);
  return dto!;
}

export async function listRequests(userId: string) {
  const owners = await prisma.witness.findMany({ where: { witnessUserId: userId, status: 'accepted' }, select: { ownerId: true } });
  if (owners.length === 0) return [];
  const rows = await prisma.releaseRequest.findMany({
    where: { ownerId: { in: owners.map((o) => o.ownerId) } },
    include: requestInclude,
    orderBy: [{ openedAt: 'desc' }, { id: 'asc' }],
    take: LIST_CAP,
  });
  return toDtos(userId, rows);
}

// ---------------------------------------------------------------------------
// Open
// ---------------------------------------------------------------------------

export async function openRequest(userId: string, ownerId: string, req: Request) {
  if (!(await isAcceptedWitness(prisma, ownerId, userId))) throw notAWitness();
  const ruleCount = await prisma.handoffRule.count({ where: { ownerId, state: { in: [...OPEN_RULE_STATES] } } });
  if (ruleCount === 0) throw nothingToRelease();
  const alreadyOpen = () => conflict('A release request is already open for this person', 'REQUEST_OPEN');

  const owner = await prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: { ...person, witnessThreshold: true } });
  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      // Locking the owner's row makes two simultaneous opens take turns, so the loser gets a clean 409 here
      // instead of a constraint error. The partial unique index stays as the backstop.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${ownerId} FOR UPDATE`;
      if (await tx.releaseRequest.count({ where: { ownerId, state: 'open' } })) throw alreadyOpen();
      return tx.releaseRequest.create({ data: { ownerId, openedByUserId: userId, requiredVotes: owner.witnessThreshold } });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw alreadyOpen();
    throw err;
  }

  const [opener, others] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: person }),
    prisma.witness.findMany({ where: { ownerId, status: 'accepted', witnessUserId: { not: userId } }, include: { witness: { select: person } } }),
  ]);
  await tryMail(
    owner.email,
    requestOpenedOwner({ witness: name(opener), time: mailTime(created.openedAt), k: created.requiredVotes, link: `${env.APP_URL}/login` }),
    { requestId: created.id }
  );
  for (const w of others) {
    await tryMail(w.witness.email, requestOpenedWitness({ witness: name(opener), owner: name(owner), link: `${env.APP_URL}/dashboard` }), { requestId: created.id });
  }
  audit(req, { userId, action: 'handoff.request.open', resourceType: 'user', resourceId: ownerId, metadata: { requestId: created.id, requiredVotes: created.requiredVotes } });
  return dtoFor(userId, created.id);
}

// ---------------------------------------------------------------------------
// Vote
// ---------------------------------------------------------------------------

type ShareInput = z.infer<typeof voteSchema>['shares'][number];

interface VoteOutcome {
  count: number;
  completed: boolean;
  releasedRuleIds: string[];
  /** Users who receive something now: the recipients of the rules that released. */
  recipients: Array<{ id: string; email: string; displayName: string | null }>;
  awaitingRepair: string[];
  closedAt: Date | null;
  /** The votes reached k but no rule could be released, so the request was closed instead of left hanging. */
  cancelled: boolean;
}

export async function vote(userId: string, requestId: string, shares: ShareInput[], req: Request) {
  const request = await prisma.releaseRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new NotFoundError('Request not found');
  if (!(await isAcceptedWitness(prisma, request.ownerId, userId))) throw notAWitness();
  if (request.state !== 'open') throw conflict('This request is closed', 'REQUEST_CLOSED');

  const outcome = await prisma.$transaction(async (tx): Promise<VoteOutcome> => {
    // The row lock serialises votes, completion and cancellation on this request.
    const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM release_requests WHERE id = ${requestId} AND state = 'open' FOR UPDATE`;
    if (locked.length === 0) throw conflict('This request is closed', 'REQUEST_CLOSED');
    if (!(await isAcceptedWitness(tx, request.ownerId, userId))) throw notAWitness();
    if (await tx.releaseVote.findUnique({ where: { requestId_witnessUserId: { requestId, witnessUserId: userId } }, select: { requestId: true } })) {
      throw conflict('You already voted on this request', 'ALREADY_VOTED');
    }

    const rules = await tx.handoffRule.findMany({
      where: { ownerId: request.ownerId, state: { in: [...OPEN_RULE_STATES] } },
      include: { recipients: { include: { user: { select: person } } } },
    });
    const fresh = rules.filter((r) => !r.sharesStale);
    const awaitingRepair = rules.filter((r) => r.sharesStale).map((r) => r.id);
    if (fresh.length === 0) throw nothingToRelease();

    const expected = new Set(fresh.flatMap((r) => r.recipients.map((x) => `${r.id}:${x.userId}`)));
    const given = new Set(shares.map((s) => `${s.ruleId}:${s.recipientUserId}`));
    if (given.size !== shares.length || given.size !== expected.size || [...expected].some((k) => !given.has(k))) {
      throw new BadRequestError('Shares must cover every open rule and recipient, one each', undefined, 'COVERAGE_SHARES');
    }

    await tx.releaseVote.create({ data: { requestId, witnessUserId: userId } });
    await tx.releaseVoteShare.createMany({
      data: shares.map((s) => ({ requestId, witnessUserId: userId, ruleId: s.ruleId, recipientUserId: s.recipientUserId, wrappedShare: s.wrappedShare })),
    });
    const count = await tx.releaseVote.count({ where: { requestId } });
    const outcome: VoteOutcome = { count, completed: false, releasedRuleIds: [], recipients: [], awaitingRepair, closedAt: null, cancelled: false };
    if (count < request.requiredVotes) return outcome;

    // A rule is releasable only when every one of its recipients has k shares from this request. A rule created
    // after the early voters voted may not, and then stays active until the votes that did cover it reach k.
    const have = await tx.releaseVoteShare.groupBy({ by: ['ruleId', 'recipientUserId'], where: { requestId }, _count: { _all: true } });
    const perPair = new Map(have.map((h) => [`${h.ruleId}:${h.recipientUserId}`, h._count._all]));
    const at = new Date();
    for (const rule of fresh) {
      if (!rule.recipients.every((x) => (perPair.get(`${rule.id}:${x.userId}`) ?? 0) >= request.requiredVotes)) continue;
      // Claimed by a conditional update: a rule the timer, a revoke or a stale flag got to first is left alone.
      const claimed = await tx.handoffRule.updateMany({
        where: { id: rule.id, state: { in: [...OPEN_RULE_STATES] }, sharesStale: false },
        data: { state: 'released_quorum', releasedAt: at },
      });
      if (claimed.count === 1) {
        outcome.releasedRuleIds.push(rule.id);
        for (const x of rule.recipients) if (!outcome.recipients.some((r) => r.id === x.user.id)) outcome.recipients.push(x.user);
      }
    }
    if (outcome.releasedRuleIds.length === 0) {
      // Nothing can ever be released by this request: say so instead of leaving it open for ever.
      await tx.releaseRequest.update({ where: { id: requestId }, data: { state: 'cancelled', closedAt: at } });
      await tx.releaseVoteShare.deleteMany({ where: { requestId } });
      outcome.cancelled = true;
      outcome.closedAt = at;
      return outcome;
    }
    await tx.releaseRequest.update({ where: { id: requestId }, data: { state: 'completed', closedAt: at } });
    // Shares for rules this request did not release are useless and must not mix with a later split.
    await tx.releaseVoteShare.deleteMany({ where: { requestId, ruleId: { notIn: outcome.releasedRuleIds } } });
    await tx.handoffRule.updateMany({ where: { id: { in: outcome.releasedRuleIds } }, data: { releasedByRequestId: requestId } });
    outcome.completed = true;
    outcome.closedAt = at;
    return outcome;
  });

  const [owner, witness] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: request.ownerId }, select: person }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: person }),
  ]);
  const at = outcome.closedAt ?? new Date();
  if (outcome.cancelled) {
    await announceCancelled(request.ownerId, [requestId], 'no_release_possible');
  } else if (outcome.completed) {
    await tryMail(owner.email, releaseCompleted({ k: outcome.count, time: mailTime(at), link: `${env.APP_URL}/dashboard` }), { requestId });
    for (const r of outcome.recipients) {
      await tryMail(r.email, releasedRecipient(name(owner), `${env.APP_URL}/shared`), { requestId });
    }
  } else {
    await tryMail(
      owner.email,
      voteAdded({ witness: name(witness), time: mailTime(at), count: outcome.count, k: request.requiredVotes, link: `${env.APP_URL}/login` }),
      { requestId }
    );
  }
  audit(req, {
    userId,
    action: 'handoff.request.vote',
    resourceType: 'release_request',
    resourceId: requestId,
    metadata: { count: outcome.count, requiredVotes: request.requiredVotes, shares: shares.length, completed: outcome.completed },
  });
  for (const ruleId of outcome.releasedRuleIds) {
    audit(req, { userId: request.ownerId, action: 'handoff.rule.released_quorum', resourceType: 'handoff_rule', resourceId: ruleId, metadata: { requestId, votes: outcome.count } });
  }
  return { ...(await dtoFor(userId, requestId)), awaitingRepair: outcome.awaitingRepair };
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

export type CancelReason = 'owner_activity' | 'owner_change' | 'no_release_possible';

type Tx = Prisma.TransactionClient;

/**
 * Cancel the owner's open requests inside the caller's transaction and return the ids it cancelled. It takes the same
 * row lock the vote path takes, so a vote either finished before this runs or finds the request closed afterwards.
 * Callers do this BEFORE writing whatever made the votes obsolete, and call `announceCancelled` after they commit.
 * Nothing was released, so the re-wrapped shares go with the request.
 */
export async function cancelOpenRequestsTx(tx: Tx, ownerId: string): Promise<string[]> {
  const open = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM release_requests WHERE owner_id = ${ownerId} AND state = 'open' ORDER BY id FOR UPDATE`;
  const won: string[] = [];
  for (const { id } of open) {
    const res = await tx.releaseRequest.updateMany({ where: { id, state: 'open' }, data: { state: 'cancelled', closedAt: new Date() } });
    if (res.count === 0) continue;
    await tx.releaseVoteShare.deleteMany({ where: { requestId: id } });
    won.push(id);
  }
  return won;
}

/** Mail every accepted witness that each request is off, and audit it. The one place both happen. Never throws. */
export async function announceCancelled(ownerId: string, requestIds: string[], reason: CancelReason): Promise<void> {
  if (requestIds.length === 0) return;
  try {
    const [owner, witnesses] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: person }),
      prisma.witness.findMany({ where: { ownerId, status: 'accepted' }, include: { witness: { select: person } } }),
    ]);
    for (const requestId of requestIds) {
      for (const w of witnesses) await tryMail(w.witness.email, requestCancelled(name(owner), `${env.APP_URL}/dashboard`, reason), { requestId });
      audit(undefined, { userId: ownerId, action: 'handoff.request.cancel', resourceType: 'release_request', resourceId: requestId, metadata: { reason } });
    }
  } catch (err) {
    logger.warn({ err, ownerId }, 'release request cancel notice failed');
  }
}

/** Cancel on its own, for callers with no transaction of their own (owner activity, invite). Never throws. */
export async function cancelOpenRequests(ownerId: string, reason: CancelReason = 'owner_activity'): Promise<void> {
  try {
    const ids = await prisma.$transaction((tx) => cancelOpenRequestsTx(tx, ownerId));
    await announceCancelled(ownerId, ids, reason);
  } catch (err) {
    logger.warn({ err, ownerId }, 'release request cancel failed');
  }
}

/** Drop the vote shares that open requests hold for these rules, because the split they came from is gone. */
export async function dropOpenVoteShares(ruleIds: string[], tx: Tx | typeof prisma = prisma): Promise<void> {
  if (ruleIds.length === 0) return;
  await tx.releaseVoteShare.deleteMany({ where: { ruleId: { in: ruleIds }, request: { state: 'open' } } });
}
