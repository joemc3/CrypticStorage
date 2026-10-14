import type { Request } from 'express';
import type { Witness } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError, BadRequestError, ConflictError, NotFoundError } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { spkiFingerprint } from '../../lib/crypto';
import { sendMail } from '../../lib/mail';
import { witnessInvitation } from '../../mail/templates';

interface ActiveRuleRef {
  id: string;
  sharesStale: boolean;
}

/**
 * The accepted set or the threshold changed, so every open rule's shares no longer match it. Flag them and return
 * the list; the owner's client re-splits each release key at next unlock and replaces the shares.
 */
async function flagOpenRules(ownerId: string): Promise<ActiveRuleRef[]> {
  await prisma.handoffRule.updateMany({ where: { ownerId, state: { in: ['active', 'warning'] } }, data: { sharesStale: true } });
  const rules = await prisma.handoffRule.findMany({
    where: { ownerId, state: { in: ['active', 'warning'] } },
    select: { id: true, sharesStale: true },
    orderBy: { createdAt: 'asc' },
  });
  return rules;
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
function setSize(ownerId: string): Promise<number> {
  return prisma.witness.count({ where: { ownerId, status: { in: ['invited', 'accepted'] } } });
}

/** Fit k to the current set, but never below 2. With fewer than 2 left the set is simply incomplete. */
async function refitThreshold(ownerId: string): Promise<number> {
  const [n, threshold] = await Promise.all([setSize(ownerId), thresholdOf(ownerId)]);
  const next = Math.max(MIN_K, Math.min(threshold, n));
  if (next !== threshold) await prisma.user.update({ where: { id: ownerId }, data: { witnessThreshold: next } });
  return next;
}

const withWitness = { witness: { select: { ...personSelect, publicKey: true } } } as const;

async function thresholdOf(ownerId: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: ownerId }, select: { witnessThreshold: true } });
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
  const n = await setSize(ownerId);
  const upper = Math.min(n, env.WITNESS_MAX_N);
  if (k < MIN_K || k > upper) {
    throw new BadRequestError(`The threshold must be between ${MIN_K} and the number of witnesses (${n}), at most ${env.WITNESS_MAX_N}`);
  }
  await prisma.user.update({ where: { id: ownerId }, data: { witnessThreshold: k } });
  audit(req, { userId: ownerId, action: 'witness.threshold', metadata: { k, n } });
  return { ...(await getSet(ownerId)), activeRules: await flagOpenRules(ownerId) };
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
  const row = existing
    ? await prisma.witness.update({
        where: { id: existing.id },
        data: { status: 'invited', invitedAt: now, respondedAt: null },
        include: withWitness,
      })
    : await prisma.witness.create({ data: { ownerId, witnessUserId: target.id, invitedAt: now }, include: withWitness });

  const owner = await prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: personSelect });
  await sendMail({ to: target.email, ...witnessInvitation(owner.displayName ?? owner.email, `${env.APP_URL}/witness/${row.id}`) });
  audit(req, { userId: ownerId, action: 'witness.invite', resourceType: 'witness', resourceId: row.id });
  return entry(row);
}

export async function remove(ownerId: string, id: string, req: Request) {
  const row = await prisma.witness.findFirst({ where: { id, ownerId, status: { not: 'removed' } } });
  if (!row) throw new NotFoundError('Witness not found');
  await prisma.witness.update({ where: { id }, data: { status: 'removed', respondedAt: new Date() } });

  const next = await refitThreshold(ownerId);
  audit(req, { userId: ownerId, action: 'witness.remove', resourceType: 'witness', resourceId: id });
  return { threshold: next, activeRules: await flagOpenRules(ownerId) };
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
  // Conditional update so two concurrent answers cannot both win.
  const claimed = await prisma.witness.updateMany({
    where: { id, status: 'invited' },
    data: { status: decision, respondedAt: new Date() },
  });
  if (claimed.count === 0) throw new ConflictError('This invitation has already been answered');
  if (decision === 'declined') await refitThreshold(row.ownerId);
  await flagOpenRules(row.ownerId);
  audit(req, {
    userId,
    action: decision === 'accepted' ? 'witness.accept' : 'witness.decline',
    resourceType: 'witness',
    resourceId: id,
    metadata: { ownerId: row.ownerId },
  });
  return invitation(await prisma.witness.findUniqueOrThrow({ where: { id }, include: { owner: { select: personSelect } } }));
}
