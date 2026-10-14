import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import CryptoService from './crypto.service';
import ApiService, {
  type FileMetadata,
  type FolderMetadata,
  type HandoffRule,
  type HandoffRuleDetail,
  type WitnessEntry,
  type WitnessSet,
} from './api.service';
import StorageService from './storage.service';
import { combineAndUnwrap, unwrapFileKeyUnderRelease, unwrapForOwner, unwrapForUser, wrapForOwner, wrapForUser, createReleaseKey } from './handoff.service';
import * as Rules from './rules.service';

let master: CryptoKey;
let owner: CryptoKeyPair;
let recipient: CryptoKeyPair;
const witnessPairs: Record<string, CryptoKeyPair> = {};
const fileKeys = new Map<string, CryptoKey>();

async function fileMeta(id: string, folderId?: string, status: 'READY' | 'PENDING' = 'READY'): Promise<FileMetadata> {
  const key = await CryptoService.generateAesKey();
  fileKeys.set(id, key);
  const wrapped = await CryptoService.wrapKey(key, master);
  return {
    id, userId: 'me', folderId, encryptedName: '', encryptedNameIV: '', encryptedFileKey: wrapped.data, fileKeyIV: wrapped.iv, iv: '', encryptedSize: 10,
    mimeType: 'text/plain', status, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
  };
}
const folderMeta = (id: string, parentId?: string): FolderMetadata => ({ id, userId: 'me', parentId, encryptedName: '', encryptedNameIV: '', createdAt: '', updatedAt: '' });

async function witness(id: string, status: WitnessEntry['status']): Promise<WitnessEntry> {
  witnessPairs[id] ??= await CryptoService.generateRSAKeyPair(2048);
  return {
    id: `w-${id}`, status, invitedAt: '', respondedAt: null,
    user: { id, email: `${id}@x.co`, displayName: null, publicKey: await CryptoService.exportPublicKey(witnessPairs[id].publicKey), fingerprint: 'f' },
  };
}
const setOf = (threshold: number, witnesses: WitnessEntry[]): WitnessSet => ({ threshold, minN: 2, maxN: 7, witnesses });

function rule(over: Partial<HandoffRule>): HandoffRule {
  return {
    id: 'r1', folderId: 'root', periodDays: 365, state: 'active', createdAt: '2026-10-01T00:00:00.000Z', nextCheckInAt: '2027-10-01T00:00:00.000Z', warningAt: null,
    sharesStale: false, coverageGaps: 0, recipients: [], ...over,
  };
}

describe('rules.service', () => {
  beforeAll(async () => {
    master = await CryptoService.generateAesKey();
    owner = await CryptoService.generateRSAKeyPair(2048);
    recipient = await CryptoService.generateRSAKeyPair(2048);
  });
  beforeEach(() => {
    vi.restoreAllMocks();
    StorageService.clearInMemoryData();
    StorageService.setMasterKey(master);
    StorageService.setPrivateKey(owner.privateKey);
    fileKeys.clear();
  });
  afterEach(() => StorageService.clearInMemoryData());

  describe('createRule', () => {
    it('sends one request whose shares cover exactly the accepted witnesses and whose items cover the whole folder subtree', async () => {
      const [a, b, c, invited] = [await witness('wa', 'accepted'), await witness('wb', 'accepted'), await witness('wc', 'accepted'), await witness('wd', 'invited')];
      vi.spyOn(ApiService, 'getWitnesses').mockResolvedValue(setOf(2, [a, b, c, invited]));
      const tree: Record<string, FileMetadata[]> = {
        top: [await fileMeta('f1', 'top'), await fileMeta('f-pending', 'top', 'PENDING')],
        sub: [await fileMeta('f2', 'sub')],
        deep: [await fileMeta('f3', 'deep')],
      };
      const folders: Record<string, FolderMetadata[]> = { top: [folderMeta('sub', 'top')], sub: [folderMeta('deep', 'sub')], deep: [] };
      vi.spyOn(ApiService, 'getFiles').mockImplementation(async (id) => tree[id!] ?? []);
      vi.spyOn(ApiService, 'getFolders').mockImplementation(async (id) => folders[id!] ?? []);
      const post = vi.spyOn(ApiService, 'createHandoffRule').mockResolvedValue({} as HandoffRuleDetail);

      await Rules.createRule({
        target: { folderId: 'top' },
        recipients: [{ userId: 'rec', publicKey: await CryptoService.exportPublicKey(recipient.publicKey) }],
        periodDays: 365,
      });

      expect(post).toHaveBeenCalledTimes(1);
      const req = post.mock.calls[0][0];
      expect(req.folderId).toBe('top');
      expect(req.fileId).toBeUndefined();
      expect(req.periodDays).toBe(365);
      expect(req.items.map((i) => i.fileId).sort()).toEqual(['f1', 'f2', 'f3']);
      expect(req.shares.map((s) => s.witnessUserId).sort()).toEqual(['wa', 'wb', 'wc']);

      // The owner wrap opens with the master key; the recipient's wrap opens with their private key; both give the key that opens every item.
      const releaseOwner = await unwrapForOwner(JSON.parse(req.wrappedReleaseKeyOwner), master);
      const releaseRecipient = await unwrapForUser(req.recipients[0].wrappedReleaseKey, recipient.privateKey);
      for (const item of req.items) {
        const key = await unwrapFileKeyUnderRelease(JSON.parse(item.wrappedFileKey), releaseRecipient);
        expect(await crypto.subtle.exportKey('raw', key)).toEqual(await crypto.subtle.exportKey('raw', fileKeys.get(item.fileId)!));
      }
      // Any two shares (the server's threshold) rebuild the release key; one does not.
      const byUser = new Map(req.shares.map((s) => [s.witnessUserId, s]));
      const selfWrapped = await Promise.all(
        ['wa', 'wb'].map(async (id) => {
          const { rewrapShareForRecipient } = await import('./handoff.service');
          return rewrapShareForRecipient(byUser.get(id)!.wrappedShare, witnessPairs[id].privateKey, recipient.publicKey);
        })
      );
      const rebuilt = await combineAndUnwrap(selfWrapped, recipient.privateKey);
      expect(await crypto.subtle.exportKey('raw', rebuilt)).toEqual(await crypto.subtle.exportKey('raw', releaseOwner));
      // No raw key material anywhere in the request.
      const rawFile = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('raw', fileKeys.get('f1')!))));
      expect(JSON.stringify(req)).not.toContain(rawFile);
    });

    it('wraps a single file for a file target', async () => {
      const [a, b] = [await witness('wa', 'accepted'), await witness('wb', 'accepted')];
      vi.spyOn(ApiService, 'getWitnesses').mockResolvedValue(setOf(2, [a, b]));
      vi.spyOn(ApiService, 'getFile').mockResolvedValue(await fileMeta('only'));
      const post = vi.spyOn(ApiService, 'createHandoffRule').mockResolvedValue({} as HandoffRuleDetail);
      await Rules.createRule({ target: { fileId: 'only' }, recipients: [{ userId: 'rec', publicKey: await CryptoService.exportPublicKey(recipient.publicKey) }], periodDays: 30 });
      const req = post.mock.calls[0][0];
      expect(req.fileId).toBe('only');
      expect(req.folderId).toBeUndefined();
      expect(req.items.map((i) => i.fileId)).toEqual(['only']);
    });

    it('refuses with a plain error when the witness set is not ready', async () => {
      vi.spyOn(ApiService, 'getWitnesses').mockResolvedValue(setOf(2, [await witness('wa', 'accepted'), await witness('wd', 'invited')]));
      const post = vi.spyOn(ApiService, 'createHandoffRule');
      await expect(
        Rules.createRule({ target: { fileId: 'x' }, recipients: [{ userId: 'rec', publicKey: 'k' }], periodDays: 30 })
      ).rejects.toThrow(/witness/i);
      expect(post).not.toHaveBeenCalled();
    });

    it('refuses when fewer witnesses accepted than the threshold', async () => {
      vi.spyOn(ApiService, 'getWitnesses').mockResolvedValue(setOf(3, [await witness('wa', 'accepted'), await witness('wb', 'accepted')]));
      await expect(
        Rules.createRule({ target: { fileId: 'x' }, recipients: [{ userId: 'rec', publicKey: 'k' }], periodDays: 30 })
      ).rejects.toThrow(/witness/i);
    });
  });

  describe('repairAtUnlock', () => {
    it('re-splits a stale rule against the current witnesses and fills a coverage gap, silently', async () => {
      const [a, b, c] = [await witness('wa', 'accepted'), await witness('wb', 'accepted'), await witness('wc', 'accepted')];
      vi.spyOn(ApiService, 'getWitnesses').mockResolvedValue(setOf(2, [a, b, c]));
      const release = await createReleaseKey();
      const wrappedOwner = JSON.stringify(await wrapForOwner(release, master));
      const existing = await fileMeta('old', 'root');
      const gap = await fileMeta('new', 'root');
      vi.spyOn(ApiService, 'listHandoffRules').mockResolvedValue([
        rule({ id: 'stale', sharesStale: true }),
        rule({ id: 'gappy', coverageGaps: 1 }),
        rule({ id: 'fine' }),
        rule({ id: 'done', state: 'released_timer', sharesStale: true, coverageGaps: 2 }),
      ]);
      vi.spyOn(ApiService, 'getHandoffRule').mockImplementation(
        async (id) => ({ ...rule({ id }), items: id === 'gappy' ? [{ fileId: 'old' }] : [], wrappedReleaseKeyOwner: wrappedOwner }) as HandoffRuleDetail
      );
      vi.spyOn(ApiService, 'getFiles').mockResolvedValue([existing, gap]);
      vi.spyOn(ApiService, 'getFolders').mockResolvedValue([]);
      const replace = vi.spyOn(ApiService, 'replaceHandoffShares').mockResolvedValue({} as HandoffRuleDetail);
      const add = vi.spyOn(ApiService, 'addHandoffItems').mockResolvedValue({} as HandoffRuleDetail);

      const result = await Rules.repairAtUnlock();

      expect(result).toEqual({ repaired: 2, failed: 0 });
      expect(replace).toHaveBeenCalledTimes(1);
      expect(replace.mock.calls[0][0]).toBe('stale');
      expect(replace.mock.calls[0][1].map((s) => s.witnessUserId).sort()).toEqual(['wa', 'wb', 'wc']);
      expect(add).toHaveBeenCalledTimes(1);
      expect(add.mock.calls[0][0]).toBe('gappy');
      expect(add.mock.calls[0][1].map((i) => i.fileId)).toEqual(['new']);
      const key = await unwrapFileKeyUnderRelease(JSON.parse(add.mock.calls[0][1][0].wrappedFileKey), release);
      expect(await crypto.subtle.exportKey('raw', key)).toEqual(await crypto.subtle.exportKey('raw', fileKeys.get('new')!));
    });

    it('counts a failed repair and keeps going', async () => {
      vi.spyOn(ApiService, 'getWitnesses').mockResolvedValue(setOf(2, [await witness('wa', 'accepted'), await witness('wb', 'accepted')]));
      vi.spyOn(ApiService, 'listHandoffRules').mockResolvedValue([rule({ id: 'a', sharesStale: true }), rule({ id: 'b', sharesStale: true })]);
      vi.spyOn(ApiService, 'getHandoffRule').mockRejectedValue(new Error('offline'));
      expect(await Rules.repairAtUnlock()).toEqual({ repaired: 0, failed: 2 });
    });

    it('does nothing when no rule needs repair', async () => {
      vi.spyOn(ApiService, 'listHandoffRules').mockResolvedValue([rule({ id: 'ok' })]);
      const get = vi.spyOn(ApiService, 'getHandoffRule');
      expect(await Rules.repairAtUnlock()).toEqual({ repaired: 0, failed: 0 });
      expect(get).not.toHaveBeenCalled();
    });
  });

  describe('covering a new file', () => {
    it('wraps a file just uploaded into every rule named by its folder', async () => {
      const release = await createReleaseKey();
      const wrappedOwner = JSON.stringify(await wrapForOwner(release, master));
      vi.spyOn(ApiService, 'getFolder').mockResolvedValue({ ...folderMeta('top'), ruleIds: ['r9'] });
      vi.spyOn(ApiService, 'getHandoffRule').mockResolvedValue({ ...rule({ id: 'r9' }), items: [], wrappedReleaseKeyOwner: wrappedOwner } as HandoffRuleDetail);
      vi.spyOn(ApiService, 'getFile').mockResolvedValue(await fileMeta('up', 'top'));
      const add = vi.spyOn(ApiService, 'addHandoffItems').mockResolvedValue({} as HandoffRuleDetail);
      await Rules.coverFile('up', 'top');
      expect(add).toHaveBeenCalledTimes(1);
      expect(add.mock.calls[0][0]).toBe('r9');
      expect(add.mock.calls[0][1].map((i) => i.fileId)).toEqual(['up']);
    });

    it('does nothing at the root or in an uncovered folder', async () => {
      const add = vi.spyOn(ApiService, 'addHandoffItems');
      vi.spyOn(ApiService, 'getFolder').mockResolvedValue(folderMeta('plain'));
      await Rules.coverFile('x', undefined);
      await Rules.coverFile('x', 'plain');
      expect(add).not.toHaveBeenCalled();
    });
  });

  describe('releasedItems', () => {
    it('opens the release key with my private key, then every item, and caches the file keys', async () => {
      const release = await createReleaseKey();
      const fk = await CryptoService.generateAesKey();
      const name = await CryptoService.encryptString('Letter.pdf', fk);
      const { wrapFileKeyUnderRelease } = await import('./handoff.service');
      StorageService.setPrivateKey(recipient.privateKey);
      vi.spyOn(ApiService, 'handoffForMe').mockResolvedValue([
        {
          id: 'r1', owner: { id: 'o', email: 'o@x.co', displayName: null }, state: 'released_timer', createdAt: '', releasedAt: '2026-10-10T00:00:00.000Z', releasedBy: 'timer',
          wrappedReleaseKey: await wrapForUser(release, recipient.publicKey),
          items: [{ fileId: 'ff', wrappedFileKey: JSON.stringify(await wrapFileKeyUnderRelease(fk, release)), file: { id: 'ff', encryptedName: name.data, encryptedNameIV: name.iv, encryptedSize: 100, mimeType: 'application/pdf' } as FileMetadata }],
        },
        { id: 'r2', owner: { id: 'o', email: 'o@x.co', displayName: null }, state: 'active', createdAt: '' },
      ]);
      const out = await Rules.releasedItems();
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ fileId: 'ff', name: 'Letter.pdf', ruleId: 'r1' });
      expect(StorageService.getCachedFileKey('ff')).toBeTruthy();
    });
  });

  describe('names', () => {
    it('joins recipients with commas and "and"', () => {
      expect(Rules.joinNames(['a'])).toBe('a');
      expect(Rules.joinNames(['a', 'b'])).toBe('a and b');
      expect(Rules.joinNames(['a', 'b', 'c'])).toBe('a, b and c');
    });
  });
});
