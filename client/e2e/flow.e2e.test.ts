/**
 * End-to-end: the real client services (crypto, auth, files, sharing) against
 * a live API. Run via `scripts/e2e.sh` or `npm run test:e2e` with E2E_API_URL set.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import AuthService from '../src/services/auth.service';
import FileService from '../src/services/file.service';
import ShareService from '../src/services/share.service';
import StorageService from '../src/services/storage.service';
import ApiService from '../src/services/api.service';
import CryptoService from '../src/services/crypto.service';

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:4100/api';
const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const alice = { email: `alice-${unique}@example.com`, password: 'correct horse battery staple' };
const bob = { email: `bob-${unique}@example.com`, password: 'another strong passphrase 42' };

function randomFile(name: string, size: number, type = 'application/octet-stream'): File {
  const bytes = new Uint8Array(size);
  for (let o = 0; o < size; o += 65536) crypto.getRandomValues(bytes.subarray(o, Math.min(size, o + 65536)));
  return new File([bytes], name, { type });
}

async function bytesOf(blob: Blob): Promise<Buffer> {
  return Buffer.from(await blob.arrayBuffer());
}

const PHRASE = 'I understand there is no way back';

/** Register the way a person does: accept the contract, follow the emailed link, then sign in. */
async function registerAndVerify(email: string, password: string, beforeVerify?: () => Promise<void>) {
  await AuthService.register(email, password, undefined, PHRASE);
  await beforeVerify?.();
  let token: string | undefined;
  for (let attempt = 0; attempt < 10 && !token; attempt++) {
    const res = await fetch(`${API}/_test/mail?to=${encodeURIComponent(email)}`);
    const body = (await res.json()) as { data?: { text: string }[] };
    token = body.data?.map((m) => m.text.match(/\/verify\/([A-Za-z0-9_-]+)/)?.[1]).find(Boolean);
    if (!token) await new Promise((r) => setTimeout(r, 200));
  }
  if (!token) throw new Error(`No verification mail arrived for ${email}`);
  const verified = await AuthService.verifyEmail(token);
  expect(verified.email).toBe(email);
  return (await AuthService.login(email, password)).user;
}

beforeAll(async () => {
  const res = await fetch(`${API}/health`);
  if (!res.ok) throw new Error(`API at ${API} is not healthy: ${res.status}`);
});

afterAll(async () => {
  await AuthService.logout().catch(() => undefined);
});

describe('zero-knowledge flow', () => {
  let uploadedId = '';
  let shareUrl = '';
  const original = randomFile('quarterly-report.pdf', 2 * CryptoService.CHUNK_SIZE + 777, 'application/pdf');

  it('registers and the server only receives ciphertext', async () => {
    const user = await registerAndVerify(alice.email, alice.password, async () => {
      // Registering opens no vault, and signing in before the link is followed is refused.
      expect(StorageService.isUnlocked()).toBe(false);
      await expect(AuthService.login(alice.email, alice.password)).rejects.toThrow();
      expect(StorageService.isUnlocked()).toBe(false);
    });
    expect(user.email).toBe(alice.email);
    expect(StorageService.isUnlocked()).toBe(true);

    const profile = await ApiService.getProfile();
    expect(profile).not.toHaveProperty('wrappedMasterKey');
    const vault = StorageService.getVault()!;
    expect(vault.wrappedMasterKey).not.toContain(alice.password);
  }, 60_000);

  it('uploads, lists and downloads a multi-chunk file byte for byte', async () => {
    const stages: string[] = [];
    const uploaded = await FileService.uploadFile(original, undefined, (p) => stages.push(p.status));
    uploadedId = uploaded.id;
    expect(uploaded.name).toBe('quarterly-report.pdf');
    expect(uploaded.size).toBe(original.size);
    expect(stages).toContain('encrypting');
    expect(stages).toContain('uploading');
    expect(stages[stages.length - 1]).toBe('completed');

    // The stored object is ciphertext of the expected size and the name is encrypted.
    const metadata = await ApiService.getFile(uploadedId);
    expect(metadata.encryptedSize).toBe(CryptoService.encryptedSizeFor(original.size));
    expect(metadata.encryptedName).not.toContain('quarterly');

    const listed = await FileService.listFiles();
    expect(listed.map((f) => f.name)).toContain('quarterly-report.pdf');

    const downloaded = await FileService.downloadFile(uploadedId);
    expect(downloaded.size).toBe(original.size);
    expect((await bytesOf(downloaded.blob)).equals(await bytesOf(original))).toBe(true);
  }, 60_000);

  it('survives lock, reload and offline unlock', async () => {
    AuthService.lock();
    expect(StorageService.isUnlocked()).toBe(false);
    await expect(FileService.listFiles()).rejects.toThrow(/locked/);
    await expect(AuthService.unlock('wrong password')).rejects.toThrow(/Incorrect password/);
    await AuthService.unlock(alice.password);
    expect(StorageService.isUnlocked()).toBe(true);
    expect((await FileService.listFiles()).length).toBe(1);
  }, 60_000);

  it('lets the person choose how long the safe stays open', async () => {
    await ApiService.updateProfile({ lockAfterMinutes: 1 });
    await AuthService.refreshProfile();
    expect(StorageService.getUserData()!.lockAfterMinutes).toBe(1);

    AuthService.lock();
    expect(StorageService.isUnlocked()).toBe(false);
    await AuthService.unlock(alice.password);
    expect(StorageService.isUnlocked()).toBe(true);
  }, 60_000);

  it('creates a share link whose key never reaches the server and opens it anonymously', async () => {
    const link = await ShareService.createShareLink({ fileId: uploadedId, maxDownloads: 3 });
    shareUrl = link.fullUrl;
    expect(shareUrl).toMatch(/\/s\/[A-Za-z0-9_-]+#[A-Za-z0-9_-]{43}$/);

    const url = new URL(shareUrl);
    const token = url.pathname.split('/').pop()!;
    const key = ShareService.keyFromFragment(url.hash)!;
    expect(key).not.toBeNull();

    // An anonymous visitor: no session at all.
    const saved = { tokens: StorageService.getTokens(), user: StorageService.getUserData(), vault: StorageService.getVault() };
    StorageService.clearAllData();

    const shared = await ShareService.openPublicShare(token, key);
    expect(shared.name).toBe('quarterly-report.pdf');
    expect(shared.size).toBe(original.size);
    const blob = await ShareService.downloadPublicShare(shared, key, undefined);
    expect((await bytesOf(blob)).equals(await bytesOf(original))).toBe(true);

    // A wrong key fails closed.
    const wrongKey = crypto.getRandomValues(new Uint8Array(32));
    await expect(ShareService.openPublicShare(token, wrongKey)).rejects.toThrow(/wrong decryption key/);

    // Restore Alice and unlock.
    StorageService.setTokens(saved.tokens!);
    StorageService.setUserData(saved.user!);
    StorageService.setVault(saved.vault!);
    await AuthService.unlock(alice.password);
  }, 60_000);

  it('shares with another user via their public key', async () => {
    // Register Bob in a separate session, then come back as Alice.
    const aliceSession = { tokens: StorageService.getTokens()!, user: StorageService.getUserData()!, vault: StorageService.getVault()! };
    StorageService.clearAllData();
    await registerAndVerify(bob.email, bob.password);
    const bobSession = { tokens: StorageService.getTokens()!, user: StorageService.getUserData()!, vault: StorageService.getVault()! };
    StorageService.clearAllData();

    StorageService.setTokens(aliceSession.tokens);
    StorageService.setUserData(aliceSession.user);
    StorageService.setVault(aliceSession.vault);
    await AuthService.unlock(alice.password);
    const share = await ShareService.shareWithUser(uploadedId, bob.email);
    expect(share.recipientEmail).toBe(bob.email);
    await expect(ShareService.shareWithUser(uploadedId, 'nobody@example.com')).rejects.toThrow(/No CrypticStorage account/);
    StorageService.clearAllData();

    StorageService.setTokens(bobSession.tokens);
    StorageService.setUserData(bobSession.user);
    StorageService.setVault(bobSession.vault);
    await AuthService.unlock(bob.password);
    const received = await FileService.listSharedWithMe();
    expect(received).toHaveLength(1);
    expect(received[0]!.name).toBe('quarterly-report.pdf');
    expect(received[0]!.sharedBy).toBe(alice.email);
    const metadata = (await ApiService.getSharedWithMe())[0]!;
    const decrypted = await FileService.downloadSharedFile(metadata);
    expect((await bytesOf(decrypted.blob)).equals(await bytesOf(original))).toBe(true);
  }, 120_000);

  it('changes the password and still opens the vault', async () => {
    await AuthService.changePassword(bob.password, 'new passphrase for bob 99');
    AuthService.lock();
    await expect(AuthService.unlock(bob.password)).rejects.toThrow();
    await AuthService.unlock('new passphrase for bob 99');
    await AuthService.logout();
    const login = await AuthService.login(bob.email, 'new passphrase for bob 99');
    expect(login.requiresTwoFactor).toBe(false);
    expect(StorageService.isUnlocked()).toBe(true);
  }, 60_000);
});
