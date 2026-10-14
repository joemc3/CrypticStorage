import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'crypto';
import { env } from '../config/env';

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

/** URL-safe random token. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Human-friendly backup code, e.g. "K7F3-9QZT". */
export function randomBackupCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const raw = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += alphabet[raw[i]! % alphabet.length];
    if (i === 3) out += '-';
  }
  return out;
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function serverKey(): Buffer {
  const raw = env.SERVER_ENCRYPTION_KEY;
  if (!raw) return createHash('sha256').update(`crypticstorage:server-key:${env.JWT_SECRET}`).digest();
  const asHex = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (asHex.length !== 32) throw new Error('SERVER_ENCRYPTION_KEY must decode to 32 bytes');
  return asHex;
}

/** Encrypt a small secret at rest (AES-256-GCM). Output: base64(iv | tag | ciphertext). */
export function encryptAtRest(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', serverKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

export function decryptAtRest(blob: string): string {
  const buf = Buffer.from(blob, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', serverKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/** Lowercase-hex SHA-256 of the DER bytes of a base64 SPKI public key. Shown to users to compare keys. */
export function spkiFingerprint(publicKeyBase64: string): string {
  return createHash('sha256').update(Buffer.from(publicKeyBase64, 'base64')).digest('hex');
}
