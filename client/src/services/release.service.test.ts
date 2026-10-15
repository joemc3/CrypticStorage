import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import CryptoService from './crypto.service';
import ApiService, { type ReleaseRequest, type ReleaseVoteResult, type SharedFileMetadata } from './api.service';
import StorageService from './storage.service';
import { combineAndUnwrap, createReleaseKey, rewrapShareForRecipient, splitForWitnesses, unwrapFileKeyUnderRelease, wrapFileKeyUnderRelease } from './handoff.service';
import { listSharedWithMe } from './file.service';
import * as Release from './release.service';

const person = (id: string) => ({ id, email: `${id}@x.co`, displayName: null });

describe('release.service', () => {
  let witness: CryptoKeyPair;
  let otherWitness: CryptoKeyPair;
  let recipientA: CryptoKeyPair;
  let recipientB: CryptoKeyPair;

  beforeAll(async () => {
    [witness, otherWitness, recipientA, recipientB] = await Promise.all([1, 2, 3, 4].map(() => CryptoService.generateRSAKeyPair(2048)) as Promise<CryptoKeyPair>[]);
  });
  beforeEach(() => {
    vi.restoreAllMocks();
    StorageService.clearInMemoryData();
    StorageService.setPrivateKey(witness.privateKey);
  });

  const spki = async (pair: CryptoKeyPair) => CryptoService.exportPublicKey(pair.publicKey);

  async function requestWith(rules: Array<{ ruleId: string; stale: boolean }>): Promise<{ request: ReleaseRequest }> {
    const myShares: ReleaseRequest['myShares'] = [];
    for (const r of rules) {
      const release = await createReleaseKey();
      const shares = await splitForWitnesses(release, new Map([['me', witness.publicKey], ['other', otherWitness.publicKey]]), 2);
      if (!r.stale) myShares.push({ ruleId: r.ruleId, shareIndex: shares.get('me')!.shareIndex, wrappedShare: shares.get('me')!.wrappedShare });
    }
    const recipients = [
      { userId: 'a', publicKey: await spki(recipientA) },
      { userId: 'b', publicKey: await spki(recipientB) },
    ];
    return {
      request: {
        id: 'req1', owner: person('owner'), openedBy: person('other'), state: 'open', requiredVotes: 2, openedAt: '2026-10-13T14:02:00.000Z', votes: [], myVote: false,
        rules: rules.map((r) => ({ ruleId: r.ruleId, sharesStale: r.stale, state: 'active' as const, recipients })),
        myShares,
      },
    };
  }

  it('vote re-wraps my share for every recipient of every fresh rule, skips stale rules and posts once', async () => {
    const { request } = await requestWith([
      { ruleId: 'r1', stale: false },
      { ruleId: 'r2', stale: true },
      { ruleId: 'r3', stale: false },
    ]);
    const post = vi.spyOn(ApiService, 'voteOnReleaseRequest').mockResolvedValue({ ...request, awaitingRepair: ['r2'] } as ReleaseVoteResult);

    const result = await Release.vote(request);

    expect(post).toHaveBeenCalledTimes(1);
    const [id, shares] = post.mock.calls[0];
    expect(id).toBe('req1');
    expect(shares.map((s) => `${s.ruleId}:${s.recipientUserId}`).sort()).toEqual(['r1:a', 'r1:b', 'r3:a', 'r3:b']);
    expect(shares.every((s) => typeof s.wrappedShare === 'string' && s.wrappedShare.length > 0)).toBe(true);
    expect(result.awaitingRepair).toEqual(['r2']);
  });

  it('the shares a vote sends let the recipient, and only the recipient, recover the release key with a second witness', async () => {
    const release = await createReleaseKey();
    const split = await splitForWitnesses(release, new Map([['me', witness.publicKey], ['other', otherWitness.publicKey]]), 2);
    const request: ReleaseRequest = {
      id: 'req1', owner: person('owner'), openedBy: person('other'), state: 'open', requiredVotes: 2, openedAt: '2026-10-13T14:02:00.000Z', votes: [], myVote: false,
      rules: [{ ruleId: 'r1', sharesStale: false, state: 'active', recipients: [{ userId: 'a', publicKey: await spki(recipientA) }] }],
      myShares: [{ ruleId: 'r1', shareIndex: split.get('me')!.shareIndex, wrappedShare: split.get('me')!.wrappedShare }],
    };
    const post = vi.spyOn(ApiService, 'voteOnReleaseRequest').mockResolvedValue({ ...request, awaitingRepair: [] } as ReleaseVoteResult);
    await Release.vote(request);
    const mine = post.mock.calls[0][1][0].wrappedShare;
    const theirs = await rewrapShareForRecipient(split.get('other')!.wrappedShare, otherWitness.privateKey, recipientA.publicKey);

    const fileKey = await CryptoService.generateAesKey();
    const wrapped = await wrapFileKeyUnderRelease(fileKey, release);
    const recovered = await unwrapFileKeyUnderRelease(wrapped, await combineAndUnwrap([mine, theirs], recipientA.privateKey));
    expect(await CryptoService.exportAesKey(recovered)).toEqual(await CryptoService.exportAesKey(fileKey));
    await expect(combineAndUnwrap([mine, theirs], recipientB.privateKey)).rejects.toThrow();
  });

  it('vote without a vault key refuses before any request', async () => {
    StorageService.setPrivateKey(null);
    const { request } = await requestWith([{ ruleId: 'r1', stale: false }]);
    const post = vi.spyOn(ApiService, 'voteOnReleaseRequest');
    await expect(Release.vote(request)).rejects.toThrow(/locked/);
    expect(post).not.toHaveBeenCalled();
  });

  it('witnessCards joins the owners I serve with their open and closed requests', async () => {
    vi.spyOn(ApiService, 'getWitnessInvitations').mockResolvedValue({
      invitations: [],
      serving: [
        { id: 's1', owner: person('o1'), respondedAt: null },
        { id: 's2', owner: person('o2'), respondedAt: null },
        { id: 's3', owner: person('o3'), respondedAt: null },
      ],
    });
    const base = { openedBy: person('w'), requiredVotes: 2, openedAt: '2026-10-13T14:02:00.000Z', votes: [], myVote: false, rules: [], myShares: [] };
    vi.spyOn(ApiService, 'listReleaseRequests').mockResolvedValue([
      { ...base, id: 'q1', owner: person('o2'), state: 'open' },
      { ...base, id: 'q2', owner: person('o3'), state: 'cancelled', closedAt: '2026-10-14T09:00:00.000Z' },
      { ...base, id: 'q3', owner: person('o3'), state: 'completed', closedAt: '2026-10-12T09:00:00.000Z' },
    ]);
    const cards = await Release.witnessCards();
    expect(cards.map((c) => [c.owner.id, c.open?.id ?? null, c.closed.map((r) => r.id)])).toEqual([
      ['o1', null, []],
      ['o2', 'q1', []],
      ['o3', null, ['q2', 'q3']],
    ]);
  });

  it('listSharedWithMe recovers a quorum row from the vote shares', async () => {
    StorageService.setPrivateKey(recipientA.privateKey);
    const release = await createReleaseKey();
    const fileKey = await CryptoService.generateAesKey();
    const name = await CryptoService.encryptString('Letter of wishes.pdf', fileKey);
    const witnessKeys = new Map([['w1', witness.publicKey], ['w2', otherWitness.publicKey], ['w3', recipientB.publicKey]]);
    const split = await splitForWitnesses(release, witnessKeys, 2);
    const voteShares = [
      { witnessUserId: 'w1', wrappedShare: await rewrapShareForRecipient(split.get('w1')!.wrappedShare, witness.privateKey, recipientA.publicKey) },
      { witnessUserId: 'w2', wrappedShare: await rewrapShareForRecipient(split.get('w2')!.wrappedShare, otherWitness.privateKey, recipientA.publicKey) },
    ];
    const row: SharedFileMetadata = {
      id: 'f1', userId: 'owner', encryptedName: name.data, encryptedNameIV: name.iv, encryptedFileKey: '', fileKeyIV: '', iv: '', encryptedSize: 1000,
      mimeType: 'application/pdf', status: 'READY', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
      shareId: 'not-a-share', permissions: 'READ', sharedBy: { id: 'owner', email: 'tom@x.co' },
      handoff: {
        ruleId: 'r1', from: { id: 'owner', email: 'tom@x.co', displayName: 'Tom Becker' }, releasedAt: '2026-10-14T00:00:00.000Z', by: 'quorum', voteShares,
        wrappedFileKey: JSON.stringify(await wrapFileKeyUnderRelease(fileKey, release)),
      },
    };
    vi.spyOn(ApiService, 'getSharedWithMe').mockResolvedValue([row]);
    const [item] = await listSharedWithMe();
    expect(item.name).toBe('Letter of wishes.pdf');
    expect(item.handoff).toEqual({ ruleId: 'r1', from: 'Tom Becker', releasedAt: '2026-10-14T00:00:00.000Z', by: 'quorum', witnesses: 2 });
  });
});
