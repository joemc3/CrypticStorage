/**
 * Handoff cryptography: the release key, its wraps, and Shamir shares of it.
 *
 * Pure functions, no network. The release key encrypts the file keys of a handoff
 * rule. The owner keeps it wrapped under their master key, recipients get it
 * wrapped under their public key, and witnesses hold Shamir shares of it, each
 * wrapped under the witness's public key. Nothing here sends plaintext anywhere.
 */
import {
  type EncryptedData,
  base64ToBytes,
  bytesToBase64,
  exportAesKey,
  generateAesKey,
  importAesKey,
  unwrapKey,
  unwrapKeyFromSender,
  wrapKey,
  wrapKeyForRecipient,
} from './crypto.service';
import { combine, split } from './shamir';

export interface WitnessShare {
  /** The share's x-coordinate (its last byte). The server stores it because the wrapped blob hides it. */
  shareIndex: number;
  /** The share, RSA-OAEP wrapped under the witness's public key, base64. */
  wrappedShare: string;
}

// A share is secret.length + 1 bytes, which is not an AES key length. Web Crypto's
// wrapKey/unwrapKey accept an HMAC key of any raw length, so a share travels as
// one. That also keeps shares usable with the key usages the RSA keys already have
// (wrapKey/unwrapKey only), and lets a witness re-wrap without the bytes ever
// being exported.
const SHARE_ALGORITHM: HmacImportParams = { name: 'HMAC', hash: 'SHA-256' };
const RSA_OAEP = { name: 'RSA-OAEP' };

/** A fresh AES-256-GCM release key, extractable so it can be wrapped and split. */
export async function createReleaseKey(): Promise<CryptoKey> {
  return generateAesKey();
}

/** Wrap the release key under the owner's master key, so witness changes never need the witnesses. */
export async function wrapForOwner(releaseKey: CryptoKey, masterKey: CryptoKey): Promise<EncryptedData> {
  return wrapKey(releaseKey, masterKey);
}

/** Recover the release key from the owner's wrap. */
export async function unwrapForOwner(wrapped: EncryptedData, masterKey: CryptoKey): Promise<CryptoKey> {
  return unwrapKey(wrapped, masterKey);
}

/** Wrap the release key for a recipient (RSA-OAEP). */
export async function wrapForUser(releaseKey: CryptoKey, publicKey: CryptoKey): Promise<string> {
  return wrapKeyForRecipient(releaseKey, publicKey);
}

/** Recover a release key wrapped for this user. */
export async function unwrapForUser(wrapped: string, privateKey: CryptoKey): Promise<CryptoKey> {
  return unwrapKeyFromSender(wrapped, privateKey);
}

/** Wrap a file key under the release key. */
export async function wrapFileKeyUnderRelease(fileKey: CryptoKey, releaseKey: CryptoKey): Promise<EncryptedData> {
  return wrapKey(fileKey, releaseKey);
}

/** Recover a file key from its wrap under the release key. */
export async function unwrapFileKeyUnderRelease(wrapped: EncryptedData, releaseKey: CryptoKey): Promise<CryptoKey> {
  return unwrapKey(wrapped, releaseKey);
}

/** Split the release key into one share per witness (n = map size, threshold k), each wrapped under that witness's public key. */
export async function splitForWitnesses(
  releaseKey: CryptoKey,
  witnessPublicKeys: Map<string, CryptoKey>,
  k: number
): Promise<Map<string, WitnessShare>> {
  const ids = [...witnessPublicKeys.keys()];
  const shares = split(await exportAesKey(releaseKey), ids.length, k);
  const result = new Map<string, WitnessShare>();
  for (let i = 0; i < ids.length; i++) {
    const share = await crypto.subtle.importKey('raw', new Uint8Array(shares[i]), SHARE_ALGORITHM, true, ['sign']);
    const wrappedShare = bytesToBase64(await crypto.subtle.wrapKey('raw', share, witnessPublicKeys.get(ids[i])!, RSA_OAEP));
    result.set(ids[i], { shareIndex: shares[i][shares[i].length - 1], wrappedShare });
  }
  return result;
}

async function unwrapShare(wrappedShare: string, privateKey: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey('raw', base64ToBytes(wrappedShare), privateKey, RSA_OAEP, SHARE_ALGORITHM, true, ['sign']);
}

/** Witness side: unwrap a share with my private key and wrap it for the recipient. The share never leaves as bytes. */
export async function rewrapShareForRecipient(
  wrappedShare: string,
  myPrivateKey: CryptoKey,
  recipientPublicKey: CryptoKey
): Promise<string> {
  const share = await unwrapShare(wrappedShare, myPrivateKey);
  return bytesToBase64(await crypto.subtle.wrapKey('raw', share, recipientPublicKey, RSA_OAEP));
}

/** Recipient side: unwrap each share with my private key, combine, and import the result as the release key. */
export async function combineAndUnwrap(shares: string[], myPrivateKey: CryptoKey): Promise<CryptoKey> {
  const raw: Uint8Array[] = [];
  for (const wrapped of shares) {
    raw.push(new Uint8Array(await crypto.subtle.exportKey('raw', await unwrapShare(wrapped, myPrivateKey))));
  }
  return importAesKey(new Uint8Array(combine(raw)));
}

const HandoffService = {
  createReleaseKey,
  wrapForOwner,
  unwrapForOwner,
  wrapForUser,
  unwrapForUser,
  wrapFileKeyUnderRelease,
  unwrapFileKeyUnderRelease,
  splitForWitnesses,
  rewrapShareForRecipient,
  combineAndUnwrap,
};

export default HandoffService;
