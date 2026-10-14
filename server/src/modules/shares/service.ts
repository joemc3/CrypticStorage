import bcrypt from 'bcrypt';
import type { Request } from 'express';
import type { ShareLink } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError, BadRequestError, GoneError, NotFoundError, UnauthorizedError } from '../../lib/errors';
import { randomToken } from '../../lib/crypto';
import { audit } from '../../lib/audit';
import { toFileDto, toFileShareDto, toShareLinkDto } from '../dto';
import { assertFileOwnership, downloadUrlFor } from '../files/service';
import { releasedItemsFor } from '../handoff/service';
import type { createLinkSchema, createUserShareSchema } from './schema';

// ---------------------------------------------------------------------------
// User-to-user shares
// ---------------------------------------------------------------------------

export async function createUserShare(ownerId: string, input: z.infer<typeof createUserShareSchema>, req: Request) {
  await assertFileOwnership(ownerId, input.fileId);
  const recipient = await prisma.user.findUnique({ where: { email: input.recipientEmail }, select: { id: true, email: true } });
  if (!recipient) throw new NotFoundError('No user with that email');
  if (recipient.id === ownerId) throw new BadRequestError('You already own this file');

  const share = await prisma.fileShare.upsert({
    where: { fileId_recipientId: { fileId: input.fileId, recipientId: recipient.id } },
    create: {
      fileId: input.fileId,
      ownerId,
      recipientId: recipient.id,
      encryptedFileKey: input.encryptedFileKey,
      permissions: input.permissions,
      expiresAt: input.expiresAt ?? null,
    },
    update: { encryptedFileKey: input.encryptedFileKey, permissions: input.permissions, expiresAt: input.expiresAt ?? null },
    include: { recipient: { select: { email: true } } },
  });
  audit(req, { userId: ownerId, action: 'share.user.create', resourceType: 'file', resourceId: input.fileId, metadata: { recipientId: recipient.id } });
  return toFileShareDto(share);
}

export async function listFileShares(ownerId: string, fileId: string) {
  await assertFileOwnership(ownerId, fileId);
  const rows = await prisma.fileShare.findMany({ where: { fileId, ownerId }, include: { recipient: { select: { email: true } } }, orderBy: { createdAt: 'asc' } });
  return rows.map(toFileShareDto);
}

export async function sharedWithMe(userId: string) {
  const rows = await prisma.fileShare.findMany({
    where: { recipientId: userId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }], file: { status: 'READY' } },
    include: { file: true, owner: { select: { id: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const direct = rows.map((row) => ({
    ...toFileDto(row.file),
    shareId: row.id,
    encryptedFileKey: row.encryptedFileKey, // RSA-wrapped for the recipient, replaces the owner's wrapping
    fileKeyIV: '',
    permissions: row.permissions,
    expiresAt: row.expiresAt?.toISOString(),
    sharedBy: row.owner,
  }));
  // Files from released handoff rules sit beside ordinary shares, marked with where they came from.
  return [...direct, ...(await releasedItemsFor(userId))];
}

/** Either party can end a share. */
export async function revokeUserShare(userId: string, shareId: string, req: Request): Promise<void> {
  const share = await prisma.fileShare.findFirst({ where: { id: shareId, OR: [{ ownerId: userId }, { recipientId: userId }] } });
  if (!share) throw new NotFoundError('Share not found');
  await prisma.fileShare.delete({ where: { id: shareId } });
  audit(req, { userId, action: 'share.user.revoke', resourceType: 'file', resourceId: share.fileId });
}

// ---------------------------------------------------------------------------
// Anonymous share links
// ---------------------------------------------------------------------------

export async function createLink(ownerId: string, input: z.infer<typeof createLinkSchema>, req: Request) {
  await assertFileOwnership(ownerId, input.fileId);
  const link = await prisma.shareLink.create({
    data: {
      token: randomToken(24),
      fileId: input.fileId,
      ownerId,
      passwordHash: input.password ? await bcrypt.hash(input.password, 10) : null,
      expiresAt: input.expiresAt ?? null,
      maxDownloads: input.maxDownloads ?? null,
    },
  });
  audit(req, { userId: ownerId, action: 'share.link.create', resourceType: 'file', resourceId: input.fileId, metadata: { linkId: link.id } });
  return toShareLinkDto(link);
}

export async function listFileLinks(ownerId: string, fileId: string) {
  await assertFileOwnership(ownerId, fileId);
  const rows = await prisma.shareLink.findMany({ where: { fileId, ownerId, revokedAt: null }, orderBy: { createdAt: 'desc' } });
  return rows.map(toShareLinkDto);
}

export async function listMyLinks(ownerId: string) {
  const rows = await prisma.shareLink.findMany({ where: { ownerId, revokedAt: null }, orderBy: { createdAt: 'desc' } });
  return rows.map(toShareLinkDto);
}

export async function revokeLink(ownerId: string, linkId: string, req: Request): Promise<void> {
  const link = await prisma.shareLink.findFirst({ where: { id: linkId, ownerId } });
  if (!link) throw new NotFoundError('Share link not found');
  await prisma.shareLink.update({ where: { id: linkId }, data: { revokedAt: new Date() } });
  audit(req, { userId: ownerId, action: 'share.link.revoke', resourceType: 'file', resourceId: link.fileId, metadata: { linkId } });
}

function assertLinkUsable(link: ShareLink): void {
  if (link.revokedAt) throw new GoneError('This share link has been revoked');
  if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) throw new GoneError('This share link has expired');
  if (link.maxDownloads !== null && link.downloadCount >= link.maxDownloads) throw new GoneError('This share link has reached its download limit');
}

class PasswordRequiredError extends AppError {
  constructor() {
    super(401, 'This share link requires a password', 'PASSWORD_REQUIRED');
  }
}

async function loadLink(token: string) {
  const link = await prisma.shareLink.findUnique({ where: { token }, include: { file: true, owner: { select: { email: true } } } });
  if (!link || link.file.status !== 'READY') throw new NotFoundError('Share link not found');
  assertLinkUsable(link);
  return link;
}

/** Public metadata. Names are ciphertext under the file key, which only the link fragment holds. */
export async function publicLinkInfo(token: string) {
  const link = await loadLink(token);
  const f = link.file;
  return {
    token: link.token,
    fileId: f.id,
    encryptedName: f.encryptedName,
    encryptedNameIV: f.encryptedNameIv,
    encryptedSize: Number(f.encryptedSize),
    mimeType: f.mimeType,
    iv: f.contentIv,
    passwordProtected: link.passwordHash !== null,
    expiresAt: link.expiresAt?.toISOString(),
    downloadsRemaining: link.maxDownloads === null ? undefined : Math.max(0, link.maxDownloads - link.downloadCount),
    sharedBy: env.NODE_ENV === 'production' ? maskEmail(link.owner.email) : link.owner.email,
  };
}

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 2)}***@${domain}`;
}

export async function publicLinkDownloadUrl(token: string, password: string | undefined, req: Request) {
  const link = await loadLink(token);
  if (link.passwordHash) {
    if (!password) throw new PasswordRequiredError();
    if (!(await bcrypt.compare(password, link.passwordHash))) {
      audit(req, { userId: null, action: 'share.link.access', success: false, resourceType: 'file', resourceId: link.fileId, metadata: { linkId: link.id } });
      throw new UnauthorizedError('Invalid password');
    }
  }
  await prisma.shareLink.update({ where: { id: link.id }, data: { lastAccessedAt: new Date() } });
  audit(req, { userId: null, action: 'share.link.access', resourceType: 'file', resourceId: link.fileId, metadata: { linkId: link.id } });
  return { downloadUrl: await downloadUrlFor(link.file, { lid: link.id }), expiresIn: env.CONTENT_TOKEN_TTL_SECONDS };
}

/** Called when bytes are actually served for a link download; enforces the download cap atomically. */
export async function recordLinkDownload(linkId: string): Promise<void> {
  const updated = await prisma.shareLink.updateMany({
    where: {
      id: linkId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    data: { downloadCount: { increment: 1 } },
  });
  if (updated.count === 0) throw new GoneError('This share link is no longer available');
  const link = await prisma.shareLink.findUnique({ where: { id: linkId }, select: { maxDownloads: true, downloadCount: true } });
  if (link && link.maxDownloads !== null && link.downloadCount > link.maxDownloads) {
    throw new GoneError('This share link has reached its download limit');
  }
}
