/**
 * CrypticStorage - File Service
 * Upload, download and metadata operations with per-file keys.
 */

import CryptoService from './crypto.service';
import ApiService, { toApiError, type FileMetadata, type FolderMetadata, type SharedFileMetadata } from './api.service';
import StorageService from './storage.service';
import { combineAndUnwrap, unwrapFileKeyUnderRelease, unwrapForUser } from './handoff.service';

// ============================================================================
// Types
// ============================================================================

export type UploadStatus = 'preparing' | 'encrypting' | 'uploading' | 'confirming' | 'completed' | 'failed';
export type DownloadStatus = 'downloading' | 'decrypting' | 'completed' | 'failed';

export interface UploadProgress {
  fileId?: string;
  fileName: string;
  totalSize: number;
  uploadedSize: number;
  percentage: number;
  status: UploadStatus;
  error?: string;
}

export interface DownloadProgress {
  fileId: string;
  fileName: string;
  totalSize: number;
  downloadedSize: number;
  percentage: number;
  status: DownloadStatus;
  error?: string;
}

export interface FileListItem {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  folderId?: string;
  createdAt: string;
  updatedAt: string;
  /** Active user shares plus live links. Zero or absent means the file is not shared. */
  shareCount?: number;
}

export interface SharedFileListItem extends FileListItem {
  /** For a handoff row this is not a share; it only keeps rows unique. Never pass it to the share revoke. */
  shareId: string;
  permissions: string;
  sharedBy: string;
  expiresAt?: string;
  /** Set when the file reached this account through a released handoff rule. */
  handoff?: { ruleId: string; from: string; releasedAt: string; by: 'timer' | 'quorum'; /** After a quorum release: how many witnesses' shares came with it. */ witnesses?: number };
}

export interface FolderListItem {
  id: string;
  name: string;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
  /** Active or warning handoff rules on this folder or an ancestor. */
  ruleIds?: string[];
  coverageGaps?: number;
}

export interface DecryptedFile extends FileListItem {
  blob: Blob;
}

// ============================================================================
// Keys
// ============================================================================

function requireMasterKey(): CryptoKey {
  const key = StorageService.getMasterKey();
  if (!key) throw new Error('Your vault is locked. Unlock it to continue.');
  return key;
}

/** Unwrap (and cache) the per-file key for a file the current user owns. */
export async function fileKeyFor(file: Pick<FileMetadata, 'id' | 'encryptedFileKey' | 'fileKeyIV'>): Promise<CryptoKey> {
  const cached = StorageService.getCachedFileKey(file.id);
  if (cached) return cached;
  const key = await CryptoService.unwrapKey({ data: file.encryptedFileKey, iv: file.fileKeyIV }, requireMasterKey());
  StorageService.cacheFileKey(file.id, key);
  return key;
}

/** The release key of a released row: unwrapped for me after a timer, combined from the voting witnesses' shares after a quorum. */
async function releaseKeyFor(handoff: NonNullable<SharedFileMetadata['handoff']>, privateKey: CryptoKey): Promise<CryptoKey> {
  if (handoff.by === 'quorum') {
    if (!handoff.voteShares?.length) throw new Error('This handoff has not released its key to you yet.');
    return combineAndUnwrap(handoff.voteShares.map((s) => s.wrappedShare), privateKey);
  }
  if (!handoff.wrappedReleaseKey) throw new Error('This handoff has not released its key to you yet.');
  return unwrapForUser(handoff.wrappedReleaseKey, privateKey);
}

/** A released handoff row has no `encryptedFileKey`: open the release key with my private key, then the file key with that. */
async function handoffFileKey(handoff: NonNullable<SharedFileMetadata['handoff']>, privateKey: CryptoKey): Promise<CryptoKey> {
  const releaseKey = await releaseKeyFor(handoff, privateKey);
  return unwrapFileKeyUnderRelease(JSON.parse(handoff.wrappedFileKey), releaseKey);
}

/** Unwrap a key that another user wrapped for us with our RSA public key. */
async function sharedFileKeyFor(file: SharedFileMetadata): Promise<CryptoKey> {
  const cached = StorageService.getCachedFileKey(file.id);
  if (cached) return cached;
  const privateKey = StorageService.getPrivateKey();
  if (!privateKey) throw new Error('Your vault is locked. Unlock it to continue.');
  const key = file.handoff ? await handoffFileKey(file.handoff, privateKey) : await CryptoService.unwrapKeyFromSender(file.encryptedFileKey, privateKey);
  StorageService.cacheFileKey(file.id, key);
  return key;
}

async function toListItem(file: FileMetadata, key: CryptoKey): Promise<FileListItem> {
  const name = await CryptoService.decryptString({ data: file.encryptedName, iv: file.encryptedNameIV }, key);
  return {
    id: file.id,
    name,
    size: CryptoService.plaintextSize(file.encryptedSize),
    mimeType: file.mimeType,
    folderId: file.folderId,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    shareCount: file.shareCount,
  };
}

function undecryptable(file: FileMetadata): FileListItem {
  return {
    id: file.id,
    name: '(cannot decrypt)',
    size: CryptoService.plaintextSize(file.encryptedSize),
    mimeType: file.mimeType,
    folderId: file.folderId,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  };
}

// ============================================================================
// Upload
// ============================================================================

export async function uploadFile(file: File, folderId?: string, onProgress?: (p: UploadProgress) => void): Promise<FileListItem> {
  const masterKey = requireMasterKey();
  const progress: UploadProgress = { fileName: file.name, totalSize: file.size, uploadedSize: 0, percentage: 0, status: 'preparing' };
  const report = (patch: Partial<UploadProgress>) => onProgress?.(Object.assign(progress, patch));

  try {
    report({ status: 'encrypting' });
    const fileKey = await CryptoService.generateAesKey();
    const encryptedName = await CryptoService.encryptString(file.name, fileKey);
    const wrappedFileKey = await CryptoService.wrapKey(fileKey, masterKey);
    const { encryptedBlob, iv } = await CryptoService.encryptFile(file, fileKey, (pct) => report({ percentage: Math.round(pct * 0.3) }));

    report({ status: 'uploading', percentage: 30 });
    const reservation = await ApiService.createUploadUrl({
      encryptedName: encryptedName.data,
      encryptedNameIV: encryptedName.iv,
      encryptedFileKey: wrappedFileKey.data,
      fileKeyIV: wrappedFileKey.iv,
      iv,
      encryptedSize: encryptedBlob.size,
      mimeType: file.type || 'application/octet-stream',
      folderId,
    });
    report({ fileId: reservation.fileId });

    await ApiService.uploadContent(reservation.uploadUrl, encryptedBlob, (loaded, total) => {
      report({ uploadedSize: Math.min(file.size, Math.round((loaded / Math.max(1, total)) * file.size)), percentage: 30 + Math.round((loaded / Math.max(1, total)) * 65) });
    });

    report({ status: 'confirming', percentage: 95 });
    const metadata = await ApiService.confirmUpload(reservation.fileId);
    StorageService.cacheFileKey(metadata.id, fileKey);

    report({ status: 'completed', percentage: 100, uploadedSize: file.size });
    return { id: metadata.id, name: file.name, size: file.size, mimeType: metadata.mimeType, folderId: metadata.folderId, createdAt: metadata.createdAt, updatedAt: metadata.updatedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : toApiError(error).message;
    report({ status: 'failed', error: message });
    throw new Error(message);
  }
}

// ============================================================================
// Download
// ============================================================================

async function downloadWithKey(metadata: FileMetadata, key: CryptoKey, onProgress?: (p: DownloadProgress) => void): Promise<DecryptedFile> {
  const item = await toListItem(metadata, key);
  const progress: DownloadProgress = { fileId: metadata.id, fileName: item.name, totalSize: item.size, downloadedSize: 0, percentage: 0, status: 'downloading' };
  const report = (patch: Partial<DownloadProgress>) => onProgress?.(Object.assign(progress, patch));

  report({});
  const { downloadUrl } = await ApiService.getDownloadUrl(metadata.id);
  const encryptedBlob = await ApiService.downloadContent(downloadUrl, (loaded, total) => {
    report({ downloadedSize: loaded, percentage: Math.round((loaded / Math.max(1, total)) * 60) });
  });
  if (encryptedBlob.size !== metadata.encryptedSize) throw new Error('Downloaded size does not match the stored file');

  report({ status: 'decrypting', percentage: 60 });
  const blob = await CryptoService.decryptFile(encryptedBlob, metadata.iv, key, (pct) => report({ percentage: 60 + Math.round(pct * 0.4) }));
  report({ status: 'completed', percentage: 100, downloadedSize: item.size });
  return { ...item, blob: new Blob([blob], { type: metadata.mimeType }) };
}

export async function downloadFile(fileId: string, onProgress?: (p: DownloadProgress) => void): Promise<DecryptedFile> {
  try {
    const metadata = await ApiService.getFile(fileId);
    return await downloadWithKey(metadata, await fileKeyFor(metadata), onProgress);
  } catch (error) {
    const message = error instanceof Error ? error.message : toApiError(error).message;
    onProgress?.({ fileId, fileName: '', totalSize: 0, downloadedSize: 0, percentage: 0, status: 'failed', error: message });
    throw new Error(message);
  }
}

export async function downloadSharedFile(file: SharedFileMetadata, onProgress?: (p: DownloadProgress) => void): Promise<DecryptedFile> {
  return downloadWithKey(file, await sharedFileKeyFor(file), onProgress);
}

export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function downloadFileToDevice(fileId: string, onProgress?: (p: DownloadProgress) => void): Promise<void> {
  const file = await downloadFile(fileId, onProgress);
  saveBlob(file.blob, file.name);
}

// ============================================================================
// Listing and metadata
// ============================================================================

export async function listFiles(folderId?: string): Promise<FileListItem[]> {
  requireMasterKey();
  const files = await ApiService.getFiles(folderId);
  return Promise.all(
    files.map(async (file) => {
      try {
        return await toListItem(file, await fileKeyFor(file));
      } catch {
        return undecryptable(file);
      }
    })
  );
}

export async function listSharedWithMe(): Promise<SharedFileListItem[]> {
  const files = await ApiService.getSharedWithMe();
  return Promise.all(
    files.map(async (file) => {
      let item: FileListItem;
      try {
        item = await toListItem(file, await sharedFileKeyFor(file));
      } catch {
        item = undecryptable(file);
      }
      const handoff = file.handoff && {
        ruleId: file.handoff.ruleId,
        from: file.handoff.from.displayName || file.handoff.from.email,
        releasedAt: file.handoff.releasedAt,
        by: file.handoff.by,
        ...(file.handoff.by === 'quorum' ? { witnesses: file.handoff.voteShares?.length ?? 0 } : {}),
      };
      return {
        ...item,
        shareId: file.shareId,
        permissions: file.permissions,
        sharedBy: handoff ? handoff.from : file.sharedBy.email,
        expiresAt: file.expiresAt,
        ...(handoff ? { handoff } : {}),
      };
    })
  );
}

export async function getFileMetadata(fileId: string): Promise<FileMetadata> {
  return ApiService.getFile(fileId);
}

export async function renameFile(fileId: string, newName: string): Promise<FileListItem> {
  const metadata = await ApiService.getFile(fileId);
  const key = await fileKeyFor(metadata);
  const encryptedName = await CryptoService.encryptString(newName, key);
  const updated = await ApiService.updateFile(fileId, { encryptedName: encryptedName.data, encryptedNameIV: encryptedName.iv });
  return toListItem(updated, key);
}

export async function moveFile(fileId: string, folderId: string | null): Promise<FileListItem> {
  const updated = await ApiService.moveFile(fileId, folderId);
  return toListItem(updated, await fileKeyFor(updated));
}

export async function copyFile(fileId: string, folderId?: string | null): Promise<FileListItem> {
  const copy = await ApiService.copyFile(fileId, folderId);
  return toListItem(copy, await fileKeyFor(copy));
}

export async function deleteFile(fileId: string): Promise<void> {
  await ApiService.deleteFile(fileId);
  StorageService.forgetFileKey(fileId);
}

// ============================================================================
// Folders (names are encrypted with the master key)
// ============================================================================

async function toFolderItem(folder: FolderMetadata, masterKey: CryptoKey): Promise<FolderListItem> {
  let name: string;
  try {
    name = await CryptoService.decryptString({ data: folder.encryptedName, iv: folder.encryptedNameIV }, masterKey);
  } catch {
    name = '(cannot decrypt)';
  }
  return { id: folder.id, name, parentId: folder.parentId, createdAt: folder.createdAt, updatedAt: folder.updatedAt, ruleIds: folder.ruleIds, coverageGaps: folder.coverageGaps };
}

export async function listFolders(parentId?: string): Promise<FolderListItem[]> {
  const masterKey = requireMasterKey();
  const folders = await ApiService.getFolders(parentId);
  return Promise.all(folders.map((f) => toFolderItem(f, masterKey)));
}

export async function getFolder(folderId: string): Promise<FolderListItem> {
  return toFolderItem(await ApiService.getFolder(folderId), requireMasterKey());
}

export async function createFolder(name: string, parentId?: string): Promise<FolderListItem> {
  const masterKey = requireMasterKey();
  const encryptedName = await CryptoService.encryptString(name, masterKey);
  const folder = await ApiService.createFolder({ encryptedName: encryptedName.data, encryptedNameIV: encryptedName.iv, parentId });
  return { id: folder.id, name, parentId: folder.parentId, createdAt: folder.createdAt, updatedAt: folder.updatedAt };
}

export async function renameFolder(folderId: string, newName: string): Promise<FolderListItem> {
  const masterKey = requireMasterKey();
  const encryptedName = await CryptoService.encryptString(newName, masterKey);
  const folder = await ApiService.updateFolder(folderId, { encryptedName: encryptedName.data, encryptedNameIV: encryptedName.iv });
  return toFolderItem(folder, masterKey);
}

export async function moveFolder(folderId: string, parentId: string | null): Promise<FolderListItem> {
  return toFolderItem(await ApiService.moveFolder(folderId, parentId), requireMasterKey());
}

export async function deleteFolder(folderId: string): Promise<void> {
  await ApiService.deleteFolder(folderId);
}

/** Walk parent links to build a breadcrumb trail (root first). */
export async function folderPath(folderId: string | null): Promise<FolderListItem[]> {
  const trail: FolderListItem[] = [];
  let current = folderId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const folder = await getFolder(current);
    trail.unshift(folder);
    current = folder.parentId ?? null;
  }
  return trail;
}

// ============================================================================
// Utilities
// ============================================================================

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${Math.round((bytes / 1024 ** i) * 100) / 100} ${units[i]}`;
}

export function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

const FileService = {
  fileKeyFor,
  uploadFile,
  downloadFile,
  downloadSharedFile,
  downloadFileToDevice,
  saveBlob,
  listFiles,
  listSharedWithMe,
  getFileMetadata,
  renameFile,
  moveFile,
  copyFile,
  deleteFile,
  listFolders,
  getFolder,
  createFolder,
  renameFolder,
  moveFolder,
  deleteFolder,
  folderPath,
  formatFileSize,
  getFileExtension,
};

export default FileService;
