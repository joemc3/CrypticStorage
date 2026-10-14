import { describe, expect, it } from 'vitest';
import CryptoService, {
  type Bytes,
  CHUNK_SIZE,
  GCM_TAG_BYTES,
  base64UrlToBytes,
  bytesToBase64Url,
  chunkCountForCiphertext,
  decryptFile,
  deriveKeys,
  encryptFile,
  encryptedSizeFor,
  plaintextSize,
} from './crypto.service';

async function blobBytes(blob: Blob): Promise<Bytes> {
  return new Uint8Array(await blob.arrayBuffer());
}

/** Byte-for-byte comparison without vitest's slow element-wise deep equality. */
function expectSameBytes(actual: Bytes, expected: Bytes): void {
  expect(actual.length).toBe(expected.length);
  expect(Buffer.from(actual).equals(Buffer.from(expected))).toBe(true);
}

function randomBlob(size: number): Blob {
  const bytes = new Uint8Array(size);
  for (let offset = 0; offset < size; offset += 65536) {
    crypto.getRandomValues(bytes.subarray(offset, Math.min(size, offset + 65536)));
  }
  return new Blob([bytes]);
}

describe('encoding', () => {
  it('round-trips base64url without padding', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const encoded = bytesToBase64Url(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(base64UrlToBytes(encoded)).toEqual(bytes);
  });
});

describe('key derivation', () => {
  it('is deterministic for the same password and salt, and distinct otherwise', async () => {
    const salt = await CryptoService.saltForEmail('Someone@Example.com');
    expect(salt).toBe(await CryptoService.saltForEmail('  someone@example.com '));

    const a = await deriveKeys('correct horse battery staple', salt, 1000);
    const b = await deriveKeys('correct horse battery staple', salt, 1000);
    const c = await deriveKeys('correct horse battery stapl3', salt, 1000);
    const d = await deriveKeys('correct horse battery staple', await CryptoService.saltForEmail('other@example.com'), 1000);

    expect(a.authHash).toBe(b.authHash);
    expect(a.authHash).not.toBe(c.authHash);
    expect(a.authHash).not.toBe(d.authHash);
    expect(a.authHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.wrappingKey.extractable).toBe(false);
  });

  it('wraps and unwraps the master key only with the right password', async () => {
    const salt = await CryptoService.saltForEmail('u@example.com');
    const right = await deriveKeys('pw-one', salt, 1000);
    const wrong = await deriveKeys('pw-two', salt, 1000);
    const master = await CryptoService.generateMasterKey();
    const wrapped = await CryptoService.wrapKey(master, right.wrappingKey);

    const restored = await CryptoService.unwrapKey(wrapped, right.wrappingKey);
    expect(await CryptoService.exportAesKey(restored)).toEqual(await CryptoService.exportAesKey(master));
    await expect(CryptoService.unwrapKey(wrapped, wrong.wrappingKey)).rejects.toThrow();
  });
});

describe('file encryption', () => {
  it('round-trips files of awkward sizes, including empty and exact chunk multiples', async () => {
    const key = await CryptoService.generateAesKey();
    for (const size of [0, 1, 17, CHUNK_SIZE - 1, CHUNK_SIZE, CHUNK_SIZE + 1, 2 * CHUNK_SIZE + 12345]) {
      const plain = randomBlob(size);
      const { encryptedBlob, iv, chunkCount } = await encryptFile(plain, key);
      expect(encryptedBlob.size).toBe(encryptedSizeFor(size));
      expect(chunkCount).toBe(chunkCountForCiphertext(encryptedBlob.size));
      expect(plaintextSize(encryptedBlob.size)).toBe(size);
      const decrypted = await decryptFile(encryptedBlob, iv, key);
      expectSameBytes(await blobBytes(decrypted), await blobBytes(plain));
    }
  });

  it('uses a distinct nonce per chunk and per file', async () => {
    const key = await CryptoService.generateAesKey();
    const zeros = new Blob([new Uint8Array(2 * CHUNK_SIZE)]);
    const once = await encryptFile(zeros, key);
    const twice = await encryptFile(zeros, key);
    const a = await blobBytes(once.encryptedBlob);
    const b = await blobBytes(twice.encryptedBlob);
    // Identical plaintext chunks within one file must not produce identical ciphertext.
    expect(Buffer.from(a.subarray(0, CHUNK_SIZE)).equals(Buffer.from(a.subarray(CHUNK_SIZE + GCM_TAG_BYTES, 2 * CHUNK_SIZE + GCM_TAG_BYTES)))).toBe(false);
    // And a second encryption of the same file must differ entirely.
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('rejects reordered, truncated, duplicated and tampered chunks', async () => {
    const key = await CryptoService.generateAesKey();
    const plain = randomBlob(3 * CHUNK_SIZE);
    const { encryptedBlob, iv } = await encryptFile(plain, key);
    const sealed = CHUNK_SIZE + GCM_TAG_BYTES;
    const bytes = await blobBytes(encryptedBlob);
    const chunk = (i: number) => bytes.subarray(i * sealed, (i + 1) * sealed);

    const reordered = new Blob([chunk(1), chunk(0), chunk(2)]);
    await expect(decryptFile(reordered, iv, key)).rejects.toThrow(/integrity/);

    const truncated = new Blob([chunk(0), chunk(1)]);
    await expect(decryptFile(truncated, iv, key)).rejects.toThrow(/integrity/);

    const duplicated = new Blob([chunk(0), chunk(1), chunk(1)]);
    await expect(decryptFile(duplicated, iv, key)).rejects.toThrow(/integrity/);

    const tampered = bytes.slice();
    tampered[sealed + 100] ^= 0x01;
    await expect(decryptFile(new Blob([tampered]), iv, key)).rejects.toThrow(/chunk 2 of 3/);

    const wrongKey = await CryptoService.generateAesKey();
    await expect(decryptFile(encryptedBlob, iv, wrongKey)).rejects.toThrow(/integrity/);
  });
});

describe('sharing primitives', () => {
  it('wraps a file key for a recipient with RSA-OAEP', async () => {
    const recipient = await CryptoService.generateRSAKeyPair(2048);
    const fileKey = await CryptoService.generateAesKey();
    const publicKey = await CryptoService.importPublicKey(await CryptoService.exportPublicKey(recipient.publicKey));
    const wrapped = await CryptoService.wrapKeyForRecipient(fileKey, publicKey);

    const privateKey = await CryptoService.importPrivateKey(await CryptoService.exportPrivateKey(recipient.privateKey));
    const restored = await CryptoService.unwrapKeyFromSender(wrapped, privateKey);
    expect(await CryptoService.exportAesKey(restored)).toEqual(await CryptoService.exportAesKey(fileKey));

    const stranger = await CryptoService.generateRSAKeyPair(2048);
    await expect(CryptoService.unwrapKeyFromSender(wrapped, stranger.privateKey)).rejects.toThrow();
  });

  it('encrypts names under the file key so a link holder can read them', async () => {
    const fileKey = await CryptoService.generateAesKey();
    const name = await CryptoService.encryptString('tax return 2026.pdf', fileKey);
    const fragment = bytesToBase64Url(await CryptoService.exportAesKey(fileKey));
    const fromLink = await CryptoService.importAesKey(base64UrlToBytes(fragment), false);
    expect(await CryptoService.decryptString(name, fromLink)).toBe('tax return 2026.pdf');
  });
});

describe('utilities', () => {
  it('generates passwords of the requested length from the alphabet', () => {
    const pw = CryptoService.generatePassword(24);
    expect(pw).toHaveLength(24);
    expect(pw).toMatch(/^[A-Za-z0-9!@#$%^&*()\-_=+[\]{}]+$/);
  });

  it('produces a stable fingerprint for a key', async () => {
    const key = await CryptoService.generateAesKey();
    expect(await CryptoService.keyFingerprint(key)).toBe(await CryptoService.keyFingerprint(key));
    expect(await CryptoService.keyFingerprint(key)).toMatch(/^([0-9a-f]{4} ){7}[0-9a-f]{4}$/);
  });

  it('fingerprints a recipient public key from its SPKI bytes', async () => {
    const pair = await CryptoService.generateRSAKeyPair();
    const spki = await CryptoService.exportPublicKey(pair.publicKey);
    const fp = await CryptoService.publicKeyFingerprint(spki);
    expect(fp).toMatch(/^([0-9a-f]{4} ){7}[0-9a-f]{4}$/);
    expect(await CryptoService.publicKeyFingerprint(spki)).toBe(fp);
  });
});
