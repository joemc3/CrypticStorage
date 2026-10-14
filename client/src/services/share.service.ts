/**
 * CrypticStorage - Share Service
 *
 * Anonymous links carry the file key in the URL fragment (`#key`). Browsers never
 * send the fragment to the server, so the server can gate access with passwords,
 * expiry and download caps while still being unable to read the file.
 *
 * User-to-user shares wrap the file key with the recipient's RSA public key.
 */

import CryptoService, { type Bytes } from './crypto.service';
import ApiService, { toApiError, type PublicShareInfo, type ShareLink, type UserShare } from './api.service';
import { fileKeyFor } from './file.service';

export interface ShareLinkWithKey extends ShareLink {
  /** Full URL including the key fragment. This is what the user copies. */
  fullUrl: string;
}

export interface CreateLinkOptions {
  fileId: string;
  password?: string;
  expiresAt?: Date;
  maxDownloads?: number;
}

export interface PublicSharedFile {
  token: string;
  name: string;
  size: number;
  mimeType: string;
  passwordProtected: boolean;
  expiresAt?: string;
  downloadsRemaining?: number;
  sharedBy: string;
  info: PublicShareInfo;
}

function withFragment(link: ShareLink, keyFragment: string): ShareLinkWithKey {
  return { ...link, fullUrl: `${link.url}#${keyFragment}` };
}

export async function createShareLink(options: CreateLinkOptions): Promise<ShareLinkWithKey> {
  const metadata = await ApiService.getFile(options.fileId);
  const fileKey = await fileKeyFor(metadata);
  const keyFragment = CryptoService.bytesToBase64Url(await CryptoService.exportAesKey(fileKey));
  try {
    const link = await ApiService.createShareLink({
      fileId: options.fileId,
      password: options.password,
      expiresAt: options.expiresAt?.toISOString(),
      maxDownloads: options.maxDownloads,
    });
    return withFragment(link, keyFragment);
  } catch (error) {
    throw new Error(toApiError(error).message);
  }
}

/** Existing links for a file, re-attaching the key fragment the owner can derive. */
export async function listShareLinks(fileId: string): Promise<ShareLinkWithKey[]> {
  const metadata = await ApiService.getFile(fileId);
  const fileKey = await fileKeyFor(metadata);
  const keyFragment = CryptoService.bytesToBase64Url(await CryptoService.exportAesKey(fileKey));
  const links = await ApiService.getFileShareLinks(fileId);
  return links.map((link) => withFragment(link, keyFragment));
}

export async function revokeShareLink(linkId: string): Promise<void> {
  await ApiService.revokeShareLink(linkId);
}

// ---------------------------------------------------------------------------
// Public access (no account)
// ---------------------------------------------------------------------------

export function keyFromFragment(hash: string): Bytes | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  try {
    const bytes = CryptoService.base64UrlToBytes(raw);
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

export async function openPublicShare(token: string, keyBytes: Bytes): Promise<PublicSharedFile> {
  let info: PublicShareInfo;
  try {
    info = await ApiService.getPublicShare(token);
  } catch (error) {
    throw new Error(toApiError(error).message);
  }
  const key = await CryptoService.importAesKey(keyBytes, false);
  let name: string;
  try {
    name = await CryptoService.decryptString({ data: info.encryptedName, iv: info.encryptedNameIV }, key);
  } catch {
    throw new Error('This link is missing or has a wrong decryption key');
  }
  return {
    token,
    name,
    size: CryptoService.plaintextSize(info.encryptedSize),
    mimeType: info.mimeType,
    passwordProtected: info.passwordProtected,
    expiresAt: info.expiresAt,
    downloadsRemaining: info.downloadsRemaining,
    sharedBy: info.sharedBy,
    info,
  };
}

export async function downloadPublicShare(
  shared: PublicSharedFile,
  keyBytes: Bytes,
  password: string | undefined,
  onProgress?: (percent: number, stage: 'downloading' | 'decrypting') => void
): Promise<Blob> {
  let downloadUrl: string;
  try {
    ({ downloadUrl } = await ApiService.getPublicShareDownloadUrl(shared.token, password));
  } catch (error) {
    const apiError = toApiError(error);
    if (apiError.code === 'PASSWORD_REQUIRED') throw new Error('PASSWORD_REQUIRED');
    throw new Error(apiError.message);
  }
  const encrypted = await ApiService.downloadContent(downloadUrl, (loaded, total) => onProgress?.(Math.round((loaded / Math.max(1, total)) * 100), 'downloading'));
  const key = await CryptoService.importAesKey(keyBytes, false);
  const blob = await CryptoService.decryptFile(encrypted, shared.info.iv, key, (pct) => onProgress?.(pct, 'decrypting'));
  return new Blob([blob], { type: shared.mimeType });
}

// ---------------------------------------------------------------------------
// User-to-user
// ---------------------------------------------------------------------------

/**
 * Share a file with a person. When `verifiedPublicKey` is given (the key whose fingerprint the sender saw),
 * the file key is wrapped with exactly that key and the directory is not asked a second time, so the
 * key cannot change between the check and the wrap.
 */
export async function shareWithUser(
  fileId: string,
  recipientEmail: string,
  verifiedPublicKey?: string,
  permissions: 'read' | 'write' = 'read',
  expiresAt?: Date
): Promise<UserShare> {
  const metadata = await ApiService.getFile(fileId);
  const fileKey = await fileKeyFor(metadata);
  let publicKeyB64 = verifiedPublicKey;
  if (!publicKeyB64) {
    try {
      publicKeyB64 = (await ApiService.getPublicKey(recipientEmail.trim().toLowerCase())).publicKey;
    } catch (error) {
      throw new Error(toApiError(error).statusCode === 404 ? 'No CrypticStorage account uses that email' : toApiError(error).message);
    }
  }
  const publicKey = await CryptoService.importPublicKey(publicKeyB64);
  const encryptedFileKey = await CryptoService.wrapKeyForRecipient(fileKey, publicKey);
  try {
    return await ApiService.shareWithUser({ fileId, recipientEmail: recipientEmail.trim().toLowerCase(), encryptedFileKey, permissions, expiresAt: expiresAt?.toISOString() });
  } catch (error) {
    throw new Error(toApiError(error).message);
  }
}

export async function listUserShares(fileId: string): Promise<UserShare[]> {
  return ApiService.getFileShares(fileId);
}

export async function revokeUserShare(shareId: string): Promise<void> {
  await ApiService.revokeUserShare(shareId);
}

const ShareService = {
  createShareLink,
  listShareLinks,
  revokeShareLink,
  keyFromFragment,
  openPublicShare,
  downloadPublicShare,
  shareWithUser,
  listUserShares,
  revokeUserShare,
};

export default ShareService;
