import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import CryptoService from './crypto.service';
import ApiService, { type SharedFileMetadata } from './api.service';
import StorageService from './storage.service';
import { createReleaseKey, wrapFileKeyUnderRelease, wrapForUser } from './handoff.service';
import { listSharedWithMe } from './file.service';

describe('listSharedWithMe', () => {
  let me: CryptoKeyPair;
  beforeAll(async () => {
    me = await CryptoService.generateRSAKeyPair(2048);
  });
  beforeEach(() => {
    vi.restoreAllMocks();
    StorageService.clearInMemoryData();
    StorageService.setPrivateKey(me.privateKey);
  });

  it('decrypts a handoff row through the release key and marks where it came from', async () => {
    const release = await createReleaseKey();
    const fileKey = await CryptoService.generateAesKey();
    const name = await CryptoService.encryptString('Letter of wishes.pdf', fileKey);
    const row: SharedFileMetadata = {
      id: 'f1', userId: 'owner', encryptedName: name.data, encryptedNameIV: name.iv, encryptedFileKey: '', fileKeyIV: '', iv: '', encryptedSize: 1000,
      mimeType: 'application/pdf', status: 'READY', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
      shareId: 'not-a-share', permissions: 'READ', sharedBy: { id: 'owner', email: 'tom@x.co' },
      handoff: {
        ruleId: 'r1', from: { id: 'owner', email: 'tom@x.co', displayName: 'Tom Becker' }, releasedAt: '2026-10-10T00:00:00.000Z', by: 'timer',
        wrappedReleaseKey: await wrapForUser(release, me.publicKey),
        wrappedFileKey: JSON.stringify(await wrapFileKeyUnderRelease(fileKey, release)),
      },
    };
    vi.spyOn(ApiService, 'getSharedWithMe').mockResolvedValue([row]);
    const [item] = await listSharedWithMe();
    expect(item.name).toBe('Letter of wishes.pdf');
    expect(item.handoff).toEqual({ ruleId: 'r1', from: 'Tom Becker', releasedAt: '2026-10-10T00:00:00.000Z', by: 'timer' });
    expect(StorageService.getCachedFileKey('f1')).toBeTruthy();
  });

  it('leaves an ordinary share without a handoff marker', async () => {
    const fileKey = await CryptoService.generateAesKey();
    const name = await CryptoService.encryptString('Recipes.pdf', fileKey);
    const row = {
      id: 'f2', encryptedName: name.data, encryptedNameIV: name.iv, encryptedFileKey: await CryptoService.wrapKeyForRecipient(fileKey, me.publicKey), fileKeyIV: '',
      encryptedSize: 100, mimeType: 'application/pdf', createdAt: '', updatedAt: '', shareId: 's1', permissions: 'READ', sharedBy: { id: 'o', email: 'mum@x.co' },
    } as unknown as SharedFileMetadata;
    vi.spyOn(ApiService, 'getSharedWithMe').mockResolvedValue([row]);
    const [item] = await listSharedWithMe();
    expect(item.name).toBe('Recipes.pdf');
    expect(item.handoff).toBeUndefined();
    expect(item.sharedBy).toBe('mum@x.co');
  });
});
