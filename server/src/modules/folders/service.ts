import type { Request } from 'express';
import type { z } from 'zod';
import { prisma } from '../../config/prisma';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { storage } from '../../storage';
import { toFolderDto } from '../dto';
import { folderCoverage } from '../handoff/coverage';
import type { createFolderSchema, updateFolderSchema } from './schema';

export async function assertFolderOwnership(userId: string, folderId: string) {
  const folder = await prisma.folder.findFirst({ where: { id: folderId, userId } });
  if (!folder) throw new NotFoundError('Folder not found');
  return folder;
}

export async function listFolders(userId: string, parentId: string | undefined) {
  if (parentId) await assertFolderOwnership(userId, parentId);
  const rows = await prisma.folder.findMany({ where: { userId, parentId: parentId ?? null }, orderBy: { createdAt: 'asc' } });
  const coverage = await folderCoverage(userId, rows.map((r) => r.id));
  return rows.map((r) => ({ ...toFolderDto(r), ...coverage.get(r.id)! }));
}

export async function getFolder(userId: string, folderId: string) {
  const folder = await assertFolderOwnership(userId, folderId);
  const coverage = await folderCoverage(userId, [folder.id]);
  return { ...toFolderDto(folder), ...coverage.get(folder.id)! };
}

export async function createFolder(userId: string, input: z.infer<typeof createFolderSchema>, req: Request) {
  if (input.parentId) await assertFolderOwnership(userId, input.parentId);
  const folder = await prisma.folder.create({
    data: { userId, parentId: input.parentId ?? null, encryptedName: input.encryptedName, encryptedNameIv: input.encryptedNameIV },
  });
  audit(req, { userId, action: 'folder.create', resourceType: 'folder', resourceId: folder.id });
  return toFolderDto(folder);
}

/** True if `candidateAncestorId` is `folderId` itself or any ancestor of it. */
async function isSelfOrDescendant(userId: string, folderId: string, candidateId: string): Promise<boolean> {
  let current: string | null = candidateId;
  const seen = new Set<string>();
  while (current) {
    if (current === folderId) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    const row: { parentId: string | null } | null = await prisma.folder.findFirst({ where: { id: current, userId }, select: { parentId: true } });
    current = row?.parentId ?? null;
  }
  return false;
}

export async function moveFolder(userId: string, folderId: string, parentId: string | null | undefined, req: Request) {
  await assertFolderOwnership(userId, folderId);
  const target = parentId ?? null;
  if (target) {
    await assertFolderOwnership(userId, target);
    if (await isSelfOrDescendant(userId, folderId, target)) throw new BadRequestError('Cannot move a folder into itself');
  }
  const folder = await prisma.folder.update({ where: { id: folderId }, data: { parentId: target } });
  audit(req, { userId, action: 'folder.move', resourceType: 'folder', resourceId: folderId });
  return toFolderDto(folder);
}

export async function updateFolder(userId: string, folderId: string, input: z.infer<typeof updateFolderSchema>, req: Request) {
  if (input.parentId !== undefined) await moveFolder(userId, folderId, input.parentId, req);
  else await assertFolderOwnership(userId, folderId);
  const folder = await prisma.folder.update({
    where: { id: folderId },
    data: { encryptedName: input.encryptedName, encryptedNameIv: input.encryptedNameIV },
  });
  if (input.encryptedName) audit(req, { userId, action: 'folder.rename', resourceType: 'folder', resourceId: folderId });
  return toFolderDto(folder);
}

/** Collect every folder id in the subtree rooted at `folderId`, including itself. */
export async function collectSubtree(userId: string, folderId: string): Promise<string[]> {
  const ids = [folderId];
  let frontier = [folderId];
  while (frontier.length) {
    const children = await prisma.folder.findMany({ where: { userId, parentId: { in: frontier } }, select: { id: true } });
    frontier = children.map((c) => c.id);
    ids.push(...frontier);
  }
  return ids;
}

export async function deleteFolder(userId: string, folderId: string, req: Request): Promise<void> {
  await assertFolderOwnership(userId, folderId);
  const subtree = await collectSubtree(userId, folderId);
  const files = await prisma.file.findMany({
    where: { userId, folderId: { in: subtree } },
    select: { id: true, storageKey: true, encryptedSize: true, status: true },
  });
  const reclaimed = files.filter((f) => f.status === 'READY').reduce((sum, f) => sum + f.encryptedSize, 0n);

  await prisma.$transaction([
    prisma.folder.delete({ where: { id: folderId } }), // cascades to subfolders and files
    prisma.user.update({ where: { id: userId }, data: { storageUsed: { decrement: reclaimed } } }),
  ]);

  const driver = storage();
  await Promise.allSettled(files.map((f) => driver.delete(f.storageKey)));
  audit(req, { userId, action: 'folder.delete', resourceType: 'folder', resourceId: folderId, metadata: { files: files.length } });
}
