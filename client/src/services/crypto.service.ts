/**
 * CrypticStorage - Cryptographic Service
 *
 * Everything here runs in the browser with the Web Crypto API. The server only
 * ever receives the outputs marked as "safe to send".
 *
 * Key hierarchy
 * ─────────────
 *   password ──PBKDF2──▶ 512 bits ─┬─▶ wrapping key (AES-256-GCM, never leaves the device)
 *                                  └─▶ auth hash    (safe to send; the server bcrypts it)
 *   master key (random AES-256)      wrapped with the wrapping key   → safe to send
 *   RSA-OAEP private key             encrypted with the master key   → safe to send
 *   file key (random AES-256, 1/file) wrapped with the master key    → safe to send
 *   file name                        encrypted with the file key     → safe to send
 *   file content                     chunked AES-GCM under file key  → safe to send
 *
 * Content format (v1): plaintext is split into CHUNK_SIZE pieces. Chunk i is
 * sealed with nonce = baseNonce[0..8] || u32(i) and AAD = u32(i) || u32(total),
 * so chunks cannot be reordered, dropped or duplicated without detection.
 */

// ============================================================================
// Types
// ============================================================================

/** Byte array backed by a plain ArrayBuffer, as the Web Crypto API requires. */
export type Bytes = Uint8Array<ArrayBuffer>;

export interface EncryptedData {
  data: string; // base64 ciphertext (includes the GCM tag)
  iv: string; // base64 nonce
}

export interface DerivedKeys {
  /** AES-GCM key that wraps the master key. Non-extractable. */
  wrappingKey: CryptoKey;
  /** Hex string sent to the server as the login credential. */
  authHash: string;
  /** Base64 salt that was used. */
  salt: string;
  iterations: number;
}

export interface EncryptedFile {
  encryptedBlob: Blob;
  /** base64 base nonce (12 bytes) */
  iv: string;
  chunkCount: number;
}

// ============================================================================
// Constants
// ============================================================================

export const KDF_ITERATIONS = 600_000;
export const CHUNK_SIZE = 1024 * 1024; // 1 MiB of plaintext per chunk
export const GCM_TAG_BYTES = 16;
const AES = 'AES-GCM';
const AES_LENGTH = 256;
const NONCE_BYTES = 12;
const RSA_MODULUS = 4096;

const AES_KEY_USAGES: KeyUsage[] = ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'];

// ============================================================================
// Encoding helpers
// ============================================================================

export function bytesToBase64(bytes: ArrayBuffer | Bytes): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i += 0x8000) {
    binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Bytes {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function bytesToBase64Url(bytes: ArrayBuffer | Bytes): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(input: string): Bytes {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
  return base64ToBytes(padded);
}

export function bytesToHex(bytes: ArrayBuffer | Bytes): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(view, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function utf8Encode(text: string): Bytes {
  return new TextEncoder().encode(text);
}

export function utf8Decode(bytes: ArrayBuffer | Bytes): string {
  return new TextDecoder().decode(bytes);
}

export function randomBytes(length: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(length));
}

export async function sha256(data: string | ArrayBuffer | Bytes): Promise<Bytes> {
  const input = typeof data === 'string' ? utf8Encode(data) : data;
  return new Uint8Array(await crypto.subtle.digest('SHA-256', input));
}

// Legacy aliases kept for callers that still use the old names.
export const arrayBufferToBase64 = bytesToBase64;
export const base64ToArrayBuffer = (b64: string): ArrayBuffer => base64ToBytes(b64).buffer as ArrayBuffer;
export const generateRandomBytes = randomBytes;

// ============================================================================
// Password-derived keys
// ============================================================================

/**
 * The KDF salt is derived from the email so a login needs no round trip to
 * fetch it. Every account still gets a distinct salt.
 */
export async function saltForEmail(email: string): Promise<string> {
  return bytesToBase64(await sha256(`crypticstorage:v1:${email.trim().toLowerCase()}`));
}

export async function deriveKeys(password: string, saltBase64: string, iterations = KDF_ITERATIONS): Promise<DerivedKeys> {
  const material = await crypto.subtle.importKey('raw', utf8Encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: base64ToBytes(saltBase64), iterations, hash: 'SHA-256' }, material, 512)
  );
  const wrappingKey = await crypto.subtle.importKey('raw', bits.slice(0, 32), { name: AES, length: AES_LENGTH }, false, AES_KEY_USAGES);
  // Hash the second half once more so the raw derived bits never leave the device.
  const authHash = bytesToHex(await sha256(bits.slice(32, 64)));
  bits.fill(0);
  return { wrappingKey, authHash, salt: saltBase64, iterations };
}

// ============================================================================
// Symmetric keys
// ============================================================================

/** Random AES-256-GCM key. Extractable so it can be wrapped. */
export async function generateAesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: AES, length: AES_LENGTH }, true, AES_KEY_USAGES);
}

export const generateMasterKey = generateAesKey;

export async function exportAesKey(key: CryptoKey): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.exportKey('raw', key));
}

export async function importAesKey(raw: Bytes | ArrayBuffer, extractable = true): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: AES, length: AES_LENGTH }, extractable, AES_KEY_USAGES);
}

export async function wrapKey(keyToWrap: CryptoKey, wrappingKey: CryptoKey): Promise<EncryptedData> {
  const iv = randomBytes(NONCE_BYTES);
  const wrapped = await crypto.subtle.wrapKey('raw', keyToWrap, wrappingKey, { name: AES, iv });
  return { data: bytesToBase64(wrapped), iv: bytesToBase64(iv) };
}

export async function unwrapKey(wrapped: EncryptedData, wrappingKey: CryptoKey, extractable = true): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    'raw',
    base64ToBytes(wrapped.data),
    wrappingKey,
    { name: AES, iv: base64ToBytes(wrapped.iv) },
    { name: AES, length: AES_LENGTH },
    extractable,
    AES_KEY_USAGES
  );
}

// ============================================================================
// RSA-OAEP key pairs (for sharing file keys between users)
// ============================================================================

export async function generateRSAKeyPair(modulusLength = RSA_MODULUS): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['wrapKey', 'unwrapKey']
  );
}

export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  return bytesToBase64(await crypto.subtle.exportKey('spki', publicKey));
}

export async function importPublicKey(spkiBase64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('spki', base64ToBytes(spkiBase64), { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['wrapKey']);
}

export async function exportPrivateKey(privateKey: CryptoKey): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.exportKey('pkcs8', privateKey));
}

export async function importPrivateKey(pkcs8: Bytes | ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', pkcs8, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['unwrapKey']);
}

/** Wrap a file key for another user. Output is safe to send. */
export async function wrapKeyForRecipient(fileKey: CryptoKey, recipientPublicKey: CryptoKey): Promise<string> {
  return bytesToBase64(await crypto.subtle.wrapKey('raw', fileKey, recipientPublicKey, { name: 'RSA-OAEP' }));
}

export async function unwrapKeyFromSender(wrappedBase64: string, privateKey: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey('raw', base64ToBytes(wrappedBase64), privateKey, { name: 'RSA-OAEP' }, { name: AES, length: AES_LENGTH }, true, AES_KEY_USAGES);
}

// ============================================================================
// Small payloads (names, private key blobs)
// ============================================================================

export async function encryptBytes(plaintext: Bytes | ArrayBuffer, key: CryptoKey): Promise<EncryptedData> {
  const iv = randomBytes(NONCE_BYTES);
  const data = await crypto.subtle.encrypt({ name: AES, iv }, key, plaintext);
  return { data: bytesToBase64(data), iv: bytesToBase64(iv) };
}

export async function decryptBytes(encrypted: EncryptedData, key: CryptoKey): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.decrypt({ name: AES, iv: base64ToBytes(encrypted.iv) }, key, base64ToBytes(encrypted.data)));
}

export async function encryptString(plaintext: string, key: CryptoKey): Promise<EncryptedData> {
  return encryptBytes(utf8Encode(plaintext), key);
}

export async function decryptString(encrypted: EncryptedData, key: CryptoKey): Promise<string> {
  return utf8Decode(await decryptBytes(encrypted, key));
}

// ============================================================================
// File content (chunked)
// ============================================================================

export function chunkCountForPlaintext(size: number): number {
  return Math.max(1, Math.ceil(size / CHUNK_SIZE));
}

export function chunkCountForCiphertext(encryptedSize: number): number {
  return Math.max(1, Math.ceil(encryptedSize / (CHUNK_SIZE + GCM_TAG_BYTES)));
}

/** Exact plaintext size recovered from the ciphertext size. */
export function plaintextSize(encryptedSize: number): number {
  return Math.max(0, encryptedSize - GCM_TAG_BYTES * chunkCountForCiphertext(encryptedSize));
}

export function encryptedSizeFor(plaintext: number): number {
  return plaintext + GCM_TAG_BYTES * chunkCountForPlaintext(plaintext);
}

function chunkNonce(base: Bytes, index: number): Bytes {
  const nonce = new Uint8Array(NONCE_BYTES);
  nonce.set(base.subarray(0, 8));
  new DataView(nonce.buffer).setUint32(8, index, false);
  return nonce;
}

function chunkAad(index: number, total: number): Bytes {
  const aad = new Uint8Array(8);
  const view = new DataView(aad.buffer);
  view.setUint32(0, index, false);
  view.setUint32(4, total, false);
  return aad;
}

export async function encryptFile(file: Blob, key: CryptoKey, onProgress?: (percent: number) => void): Promise<EncryptedFile> {
  const baseNonce = randomBytes(NONCE_BYTES);
  const total = chunkCountForPlaintext(file.size);
  const parts: ArrayBuffer[] = [];

  for (let i = 0; i < total; i++) {
    const slice = file.slice(i * CHUNK_SIZE, Math.min(file.size, (i + 1) * CHUNK_SIZE));
    const plain = await slice.arrayBuffer();
    parts.push(await crypto.subtle.encrypt({ name: AES, iv: chunkNonce(baseNonce, i), additionalData: chunkAad(i, total) }, key, plain));
    onProgress?.(Math.round(((i + 1) / total) * 100));
  }

  return { encryptedBlob: new Blob(parts, { type: 'application/octet-stream' }), iv: bytesToBase64(baseNonce), chunkCount: total };
}

export async function decryptFile(encrypted: Blob, ivBase64: string, key: CryptoKey, onProgress?: (percent: number) => void): Promise<Blob> {
  const baseNonce = base64ToBytes(ivBase64);
  if (baseNonce.length !== NONCE_BYTES) throw new Error('Invalid content nonce');
  const total = chunkCountForCiphertext(encrypted.size);
  const sealedChunk = CHUNK_SIZE + GCM_TAG_BYTES;
  const parts: ArrayBuffer[] = [];

  for (let i = 0; i < total; i++) {
    const slice = encrypted.slice(i * sealedChunk, Math.min(encrypted.size, (i + 1) * sealedChunk));
    const sealed = await slice.arrayBuffer();
    try {
      parts.push(await crypto.subtle.decrypt({ name: AES, iv: chunkNonce(baseNonce, i), additionalData: chunkAad(i, total) }, key, sealed));
    } catch {
      throw new Error(`File integrity check failed at chunk ${i + 1} of ${total}`);
    }
    onProgress?.(Math.round(((i + 1) / total) * 100));
  }

  return new Blob(parts);
}

// ============================================================================
// Utilities
// ============================================================================

/** Short, human-comparable identifier for a key. */
export async function keyFingerprint(key: CryptoKey): Promise<string> {
  const hash = bytesToHex(await sha256(await exportAesKey(key)));
  return hash.slice(0, 32).replace(/(.{4})/g, '$1 ').trim();
}

export function generatePassword(length = 20): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}';
  const bytes = randomBytes(length * 2);
  let out = '';
  for (let i = 0; out.length < length && i < bytes.length; i++) {
    const b = bytes[i]!;
    if (b < 256 - (256 % alphabet.length)) out += alphabet[b % alphabet.length];
  }
  return out.length === length ? out : generatePassword(length);
}

const CryptoService = {
  KDF_ITERATIONS,
  CHUNK_SIZE,
  bytesToBase64,
  base64ToBytes,
  bytesToBase64Url,
  base64UrlToBytes,
  bytesToHex,
  randomBytes,
  sha256,
  saltForEmail,
  deriveKeys,
  generateAesKey,
  generateMasterKey,
  exportAesKey,
  importAesKey,
  wrapKey,
  unwrapKey,
  generateRSAKeyPair,
  exportPublicKey,
  importPublicKey,
  exportPrivateKey,
  importPrivateKey,
  wrapKeyForRecipient,
  unwrapKeyFromSender,
  encryptBytes,
  decryptBytes,
  encryptString,
  decryptString,
  encryptFile,
  decryptFile,
  plaintextSize,
  encryptedSizeFor,
  keyFingerprint,
  generatePassword,
};

export default CryptoService;
