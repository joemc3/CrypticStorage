import type { File, FileShare, Folder, ShareLink, User } from '@prisma/client';
import { env } from '../config/env';

export function toPublicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    publicKey: user.publicKey,
    storageUsed: Number(user.storageUsed),
    storageLimit: Number(user.storageQuota),
    twoFactorEnabled: user.twoFactorEnabled,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

/** Everything the owner needs to unlock their vault after authenticating. */
export function toAuthenticatedUser(user: User) {
  return {
    ...toPublicUser(user),
    encryptedPrivateKey: user.encryptedPrivateKey,
    wrappedMasterKey: user.wrappedMasterKey,
    salt: user.salt,
    kdfIterations: user.kdfIterations,
  };
}

export function toFileDto(file: File) {
  return {
    id: file.id,
    userId: file.userId,
    folderId: file.folderId ?? undefined,
    encryptedName: file.encryptedName,
    encryptedNameIV: file.encryptedNameIv,
    encryptedFileKey: file.encryptedFileKey,
    fileKeyIV: file.fileKeyIv,
    iv: file.contentIv,
    encryptedSize: Number(file.encryptedSize),
    mimeType: file.mimeType,
    status: file.status,
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
  };
}

export function toFolderDto(folder: Folder) {
  return {
    id: folder.id,
    userId: folder.userId,
    parentId: folder.parentId ?? undefined,
    encryptedName: folder.encryptedName,
    encryptedNameIV: folder.encryptedNameIv,
    createdAt: folder.createdAt.toISOString(),
    updatedAt: folder.updatedAt.toISOString(),
  };
}

export function shareLinkUrl(token: string): string {
  return `${env.APP_URL.replace(/\/$/, '')}/s/${token}`;
}

export function toShareLinkDto(link: ShareLink) {
  return {
    id: link.id,
    fileId: link.fileId,
    token: link.token,
    url: shareLinkUrl(link.token),
    passwordProtected: link.passwordHash !== null,
    expiresAt: link.expiresAt?.toISOString(),
    maxDownloads: link.maxDownloads ?? undefined,
    downloadCount: link.downloadCount,
    revokedAt: link.revokedAt?.toISOString(),
    createdAt: link.createdAt.toISOString(),
  };
}

export function toFileShareDto(share: FileShare & { recipient?: { email: string } }) {
  return {
    id: share.id,
    fileId: share.fileId,
    ownerId: share.ownerId,
    recipientId: share.recipientId,
    recipientEmail: share.recipient?.email,
    permissions: share.permissions,
    expiresAt: share.expiresAt?.toISOString(),
    createdAt: share.createdAt.toISOString(),
  };
}
