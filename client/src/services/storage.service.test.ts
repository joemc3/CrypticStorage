// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { webcrypto } from 'node:crypto';
import StorageService, { type UserData, type VaultData } from './storage.service';

const subtle = (globalThis.crypto?.subtle ?? (webcrypto as unknown as Crypto).subtle) as SubtleCrypto;

const user: UserData = {
  id: 'u1',
  email: 'a@example.com',
  publicKey: 'pk',
  storageUsed: 0,
  storageLimit: 1,
  twoFactorEnabled: false,
  displayName: null,
  lockAfterMinutes: 5,
  emailVerifiedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
};
const vault: VaultData = { wrappedMasterKey: 'w', encryptedPrivateKey: 'e', publicKey: 'pk', salt: 's', kdfIterations: 1 };

function assertNoRawKeys() {
  expect(sessionStorage.length).toBe(0);
  const allowed = new Set(['cs.tokens', 'cs.user', 'cs.vault']);
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    expect(allowed.has(k)).toBe(true);
    const raw = localStorage.getItem(k)!;
    expect(raw).not.toContain('CryptoKey');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty('algorithm');
    expect(parsed).not.toHaveProperty('usages');
    expect(parsed).not.toHaveProperty('type');
    const known = k === 'cs.tokens' ? ['accessToken', 'refreshToken', 'expiresAt'] : Object.keys(k === 'cs.user' ? user : vault);
    for (const field of Object.keys(parsed)) expect(known).toContain(field);
  }
}

describe('storage.service key custody', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    StorageService.clearInMemoryData();
    StorageService.setTokens({ accessToken: 'a', refreshToken: 'r', expiresAt: 1 });
    StorageService.setUserData(user);
    StorageService.setVault(vault);
    const aes = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const rsa = await subtle.generateKey(
      { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['encrypt', 'decrypt']
    );
    StorageService.setMasterKey(aes as CryptoKey);
    StorageService.setPrivateKey((rsa as CryptoKeyPair).privateKey);
    StorageService.cacheFileKey('f1', aes as CryptoKey);
  });

  it('never writes raw keys to storage while unlocked', () => {
    expect(StorageService.hasMasterKey()).toBe(true);
    assertNoRawKeys();
  });

  it('drops every key from memory on lock and still persists no raw key', () => {
    StorageService.clearInMemoryData();
    expect(StorageService.hasMasterKey()).toBe(false);
    expect(StorageService.getPrivateKey()).toBeNull();
    expect(StorageService.getCachedFileKey('f1')).toBeUndefined();
    assertNoRawKeys();
    expect(StorageService.hasSession()).toBe(true);
  });
});
