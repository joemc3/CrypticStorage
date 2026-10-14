import type { Request } from 'express';
import type { Readable } from 'stream';
import { randomUUID } from 'crypto';
import type { File } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { BadRequestError, ConflictError, NotFoundError, PayloadTooLargeError, QuotaExceededError } from '../../lib/errors';
import { signContentToken } from '../../lib/jwt';
import { audit } from '../../lib/audit';
import { ObjectTooLargeError, storage } from '../../storage';
import { toFileDto } from '../dto';
import { assertFolderOwnership } from '../folders/service';
import { RELEASED_STATES_FOR_ACCESS } from '../handoff/access';
import type { createUploadSchema, updateFileSchema } from './schema';

const CONTENT_TTL = env.CONTENT_TOKEN_TTL_SECONDS;

export function storageKeyFor(userId: string, fileId: string): string {
  return `u/${userId}/${fileId}`;
}

function contentUrl(fileId: string, token: string): string {
  const base = env.API_PUBLIC_URL.replace(/\/$/, '') || '/api';
  return `${base}/files/${fileId}/content?token=${encodeURIComponent(token)}`;
}

export async function assertFileOwnership(userId: string, fileId: string, status: 'READY' | 'ANY' = 'READY'): Promise<File> {
  const file = await prisma.file.findFirst({ where: { id: fileId, userId, ...(status === 'READY' ? { status: 'READY' } : {}) } });
  if (!file) throw new NotFoundError('File not found');
  return file;
}

async function assertQuota(userId: string, additionalBytes: bigint): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { storageUsed: true, storageQuota: true } });
  if (!user) throw new NotFoundError('User not found');
  if (user.storageUsed + additionalBytes > user.storageQuota) throw new QuotaExceededError();
}

// ---------------------------------------------------------------------------
// Upload: reserve -> PUT bytes -> confirm
// ---------------------------------------------------------------------------

export async function createUpload(userId: string, input: z.infer<typeof createUploadSchema>, req: Request) {
  if (input.folderId) await assertFolderOwnership(userId, input.folderId);
  await assertQuota(userId, BigInt(input.encryptedSize));

  const fileId = randomUUID();
  const storageKey = storageKeyFor(userId, fileId);
  const file = await prisma.file.create({
    data: {
      id: fileId,
      userId,
      folderId: input.folderId ?? null,
      encryptedName: input.encryptedName,
      encryptedNameIv: input.encryptedNameIV,
      encryptedFileKey: input.encryptedFileKey,
      fileKeyIv: input.fileKeyIV,
      contentIv: input.iv,
      encryptedSize: BigInt(input.encryptedSize),
      mimeType: input.mimeType,
      storageKey,
      status: 'PENDING',
    },
  });

  const presigned = await storage().presignUpload(storageKey, input.encryptedSize, CONTENT_TTL);
  const uploadUrl = presigned ?? contentUrl(fileId, signContentToken({ fid: fileId, scope: 'upload', sub: userId }));

  audit(req, { userId, action: 'file.upload.start', resourceType: 'file', resourceId: fileId, metadata: { bytes: input.encryptedSize } });
  return { fileId: file.id, storageKey, uploadUrl, method: 'PUT' as const, expiresIn: CONTENT_TTL };
}

/** Receive bytes for a pending upload through the API (used when the storage driver cannot presign). */
export async function receiveContent(fileId: string, tokenSubject: string | undefined, body: Readable, declaredLength: number | undefined): Promise<void> {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file || file.status !== 'PENDING') throw new NotFoundError('Upload not found or already completed');
  if (tokenSubject && tokenSubject !== file.userId) throw new NotFoundError('Upload not found');

  const expected = Number(file.encryptedSize);
  if (declaredLength !== undefined && declaredLength !== expected) {
    throw new BadRequestError(`Content-Length ${declaredLength} does not match declared size ${expected}`);
  }
  try {
    const result = await storage().put(file.storageKey, body, { maxBytes: expected, contentType: 'application/octet-stream' });
    if (result.size !== expected) {
      await storage().delete(file.storageKey).catch(() => undefined);
      throw new BadRequestError(`Received ${result.size} bytes but ${expected} were declared`);
    }
  } catch (err) {
    if (err instanceof ObjectTooLargeError) throw new PayloadTooLargeError('Upload exceeds its declared size');
    throw err;
  }
}

export async function confirmUpload(userId: string, fileId: string, req: Request) {
  const file = await assertFileOwnership(userId, fileId, 'ANY');
  if (file.status === 'READY') return toFileDto(file);

  const stat = await storage().stat(file.storageKey);
  if (!stat) throw new BadRequestError('No content has been uploaded for this file');
  if (BigInt(stat.size) !== file.encryptedSize) {
    await storage().delete(file.storageKey).catch(() => undefined);
    await prisma.file.delete({ where: { id: fileId } }).catch(() => undefined);
    throw new BadRequestError(`Uploaded size ${stat.size} does not match declared size ${file.encryptedSize}`);
  }

  const ready = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { storageUsed: true, storageQuota: true } });
    if (user.storageUsed + file.encryptedSize > user.storageQuota) throw new QuotaExceededError();
    await tx.user.update({ where: { id: userId }, data: { storageUsed: { increment: file.encryptedSize } } });
    return tx.file.update({ where: { id: fileId }, data: { status: 'READY' } });
  }).catch(async (err) => {
    if (err instanceof QuotaExceededError) {
      await storage().delete(file.storageKey).catch(() => undefined);
      await prisma.file.delete({ where: { id: fileId } }).catch(() => undefined);
    }
    throw err;
  });

  audit(req, { userId, action: 'file.upload.complete', resourceType: 'file', resourceId: fileId, metadata: { bytes: Number(file.encryptedSize) } });
  return toFileDto(ready);
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** Active user shares plus unexpired, unrevoked links, per file. Two grouped queries however many files. */
async function shareCounts(fileIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (fileIds.length === 0) return counts;
  const now = new Date();
  const [shares, links] = await Promise.all([
    prisma.fileShare.groupBy({
      by: ['fileId'],
      where: { fileId: { in: fileIds }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      _count: { _all: true },
    }),
    prisma.shareLink.groupBy({
      by: ['fileId'],
      where: { fileId: { in: fileIds }, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      _count: { _all: true },
    }),
  ]);
  for (const row of [...shares, ...links]) counts.set(row.fileId, (counts.get(row.fileId) ?? 0) + row._count._all);
  return counts;
}

export async function listFiles(userId: string, folderId: string | undefined) {
  if (folderId) await assertFolderOwnership(userId, folderId);
  const rows = await prisma.file.findMany({ where: { userId, folderId: folderId ?? null, status: 'READY' }, orderBy: { createdAt: 'asc' } });
  const counts = await shareCounts(rows.map((r) => r.id));
  return rows.map((r) => ({ ...toFileDto(r), shareCount: counts.get(r.id) ?? 0 }));
}

export async function getFile(userId: string, fileId: string) {
  const file = await assertFileOwnership(userId, fileId);
  const counts = await shareCounts([file.id]);
  return { ...toFileDto(file), shareCount: counts.get(file.id) ?? 0 };
}

/** Download URL for the owner, or for a recipient of a user-to-user share. */
export async function downloadUrl(userId: string, fileId: string) {
  const file = await prisma.file.findFirst({
    where: {
      id: fileId,
      status: 'READY',
      OR: [
        { userId },
        { shares: { some: { recipientId: userId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } } },
        // Released handoff items follow the ordinary sharing path: the recipient may fetch the ciphertext.
        { handoffItems: { some: { rule: { state: { in: [...RELEASED_STATES_FOR_ACCESS] }, recipients: { some: { userId } } } } } },
      ],
    },
  });
  if (!file) throw new NotFoundError('File not found');
  return { downloadUrl: await downloadUrlFor(file, { sub: userId }), expiresIn: CONTENT_TTL };
}

export async function downloadUrlFor(file: File, claims: { sub?: string; lid?: string }): Promise<string> {
  const presigned = await storage().presignDownload(file.storageKey, CONTENT_TTL);
  return presigned ?? contentUrl(file.id, signContentToken({ fid: file.id, scope: 'download', ...claims }));
}

export async function openContent(fileId: string): Promise<{ stream: Readable; size: number; file: File }> {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file || file.status !== 'READY') throw new NotFoundError('File not found');
  const { stream, size } = await storage().get(file.storageKey);
  return { stream, size, file };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function updateFile(userId: string, fileId: string, input: z.infer<typeof updateFileSchema>, req: Request) {
  await assertFileOwnership(userId, fileId);
  if (input.folderId) await assertFolderOwnership(userId, input.folderId);
  const file = await prisma.file.update({
    where: { id: fileId },
    data: {
      encryptedName: input.encryptedName,
      encryptedNameIv: input.encryptedNameIV,
      ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
    },
  });
  audit(req, { userId, action: input.encryptedName ? 'file.rename' : 'file.update', resourceType: 'file', resourceId: fileId });
  return toFileDto(file);
}

export async function moveFile(userId: string, fileId: string, folderId: string | null | undefined, req: Request) {
  await assertFileOwnership(userId, fileId);
  const target = folderId ?? null;
  if (target) await assertFolderOwnership(userId, target);
  const file = await prisma.file.update({ where: { id: fileId }, data: { folderId: target } });
  audit(req, { userId, action: 'file.move', resourceType: 'file', resourceId: fileId });
  return toFileDto(file);
}

/** Duplicate the ciphertext and metadata. The copy keeps the same wrapped file key. */
export async function copyFile(userId: string, fileId: string, folderId: string | null | undefined, req: Request) {
  const source = await assertFileOwnership(userId, fileId);
  const target = folderId === undefined ? source.folderId : folderId;
  if (target) await assertFolderOwnership(userId, target);
  await assertQuota(userId, source.encryptedSize);

  const newId = randomUUID();
  const newKey = storageKeyFor(userId, newId);
  await storage().copy(source.storageKey, newKey);

  try {
    const copy = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { storageUsed: true, storageQuota: true } });
      if (user.storageUsed + source.encryptedSize > user.storageQuota) throw new QuotaExceededError();
      await tx.user.update({ where: { id: userId }, data: { storageUsed: { increment: source.encryptedSize } } });
      return tx.file.create({
        data: {
          id: newId,
          userId,
          folderId: target,
          encryptedName: source.encryptedName,
          encryptedNameIv: source.encryptedNameIv,
          encryptedFileKey: source.encryptedFileKey,
          fileKeyIv: source.fileKeyIv,
          contentIv: source.contentIv,
          encryptedSize: source.encryptedSize,
          mimeType: source.mimeType,
          storageKey: newKey,
          status: 'READY',
        },
      });
    });
    audit(req, { userId, action: 'file.copy', resourceType: 'file', resourceId: copy.id, metadata: { sourceId: fileId } });
    return toFileDto(copy);
  } catch (err) {
    await storage().delete(newKey).catch(() => undefined);
    throw err;
  }
}

export async function deleteFile(userId: string, fileId: string, req: Request): Promise<void> {
  const file = await assertFileOwnership(userId, fileId, 'ANY');
  await prisma.$transaction([
    prisma.file.delete({ where: { id: fileId } }),
    ...(file.status === 'READY'
      ? [prisma.user.update({ where: { id: userId }, data: { storageUsed: { decrement: file.encryptedSize } } })]
      : []),
  ]);
  await storage().delete(file.storageKey).catch(() => undefined);
  audit(req, { userId, action: 'file.delete', resourceType: 'file', resourceId: fileId, metadata: { bytes: Number(file.encryptedSize) } });
}

export function ensureNotPending(file: File): void {
  if (file.status !== 'READY') throw new ConflictError('File upload has not completed');
}
