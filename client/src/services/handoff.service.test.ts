import { beforeAll, describe, expect, it } from 'vitest';
import {
  decryptBytes,
  encryptBytes,
  generateAesKey,
  generateRSAKeyPair,
  utf8Decode,
  utf8Encode,
} from './crypto.service';
import {
  combineAndUnwrap,
  createReleaseKey,
  rewrapShareForRecipient,
  splitForWitnesses,
  unwrapFileKeyUnderRelease,
  unwrapForOwner,
  unwrapForUser,
  wrapFileKeyUnderRelease,
  wrapForOwner,
  wrapForUser,
} from './handoff.service';

const PLAINTEXT = 'the contents of the file';

describe('handoff.service', () => {
  let masterKey: CryptoKey;
  let recipientA: CryptoKeyPair;
  let recipientB: CryptoKeyPair;
  let witnesses: Record<string, CryptoKeyPair>;

  beforeAll(async () => {
    masterKey = await generateAesKey();
    [recipientA, recipientB] = await Promise.all([generateRSAKeyPair(2048), generateRSAKeyPair(2048)]);
    witnesses = {
      w1: await generateRSAKeyPair(2048),
      w2: await generateRSAKeyPair(2048),
      w3: await generateRSAKeyPair(2048),
    };
  });

  const witnessKeys = (ids: string[]) => new Map(ids.map((id) => [id, witnesses[id].publicKey]));

  async function sealedFile() {
    const fileKey = await generateAesKey();
    return { fileKey, encrypted: await encryptBytes(utf8Encode(PLAINTEXT), fileKey) };
  }

  it('wraps the release key for the owner and gets it back', async () => {
    const release = await createReleaseKey();
    const { fileKey, encrypted } = await sealedFile();
    const wrappedFileKey = await wrapFileKeyUnderRelease(fileKey, release);

    const restored = await unwrapForOwner(await wrapForOwner(release, masterKey), masterKey);
    const recovered = await unwrapFileKeyUnderRelease(wrappedFileKey, restored);
    expect(utf8Decode(await decryptBytes(encrypted, recovered))).toBe(PLAINTEXT);
  });

  it('wraps the release key for a user and round trips', async () => {
    const release = await createReleaseKey();
    const { fileKey, encrypted } = await sealedFile();
    const wrappedFileKey = await wrapFileKeyUnderRelease(fileKey, release);

    for (const pair of [recipientA, recipientB]) {
      const restored = await unwrapForUser(await wrapForUser(release, pair.publicKey), pair.privateKey);
      const recovered = await unwrapFileKeyUnderRelease(wrappedFileKey, restored);
      expect(utf8Decode(await decryptBytes(encrypted, recovered))).toBe(PLAINTEXT);
    }
  });

  it('does not let another user unwrap the release key', async () => {
    const release = await createReleaseKey();
    const wrapped = await wrapForUser(release, recipientA.publicKey);
    await expect(unwrapForUser(wrapped, recipientB.privateKey)).rejects.toThrow();
  });

  it('splits for 3 witnesses with k=2, a witness re-wraps, the recipient combines 2 of 3', async () => {
    const release = await createReleaseKey();
    const { fileKey, encrypted } = await sealedFile();
    const wrappedFileKey = await wrapFileKeyUnderRelease(fileKey, release);

    const shares = await splitForWitnesses(release, witnessKeys(['w1', 'w2', 'w3']), 2);
    expect([...shares.keys()].sort()).toEqual(['w1', 'w2', 'w3']);
    expect(new Set([...shares.values()].map((s) => s.shareIndex)).size).toBe(3);

    const forRecipient = await Promise.all(
      ['w1', 'w3'].map((id) =>
        rewrapShareForRecipient(shares.get(id)!.wrappedShare, witnesses[id].privateKey, recipientA.publicKey)
      )
    );
    const combined = await combineAndUnwrap(forRecipient, recipientA.privateKey);
    const recovered = await unwrapFileKeyUnderRelease(wrappedFileKey, combined);
    expect(utf8Decode(await decryptBytes(encrypted, recovered))).toBe(PLAINTEXT);
  });

  it('cannot recover the file with k-1 shares', async () => {
    const release = await createReleaseKey();
    const { fileKey, encrypted } = await sealedFile();
    const wrappedFileKey = await wrapFileKeyUnderRelease(fileKey, release);
    // k=3 so two shares pass combine's own minimum-count guard and the failure is cryptographic.
    const shares = await splitForWitnesses(release, witnessKeys(['w1', 'w2', 'w3']), 3);

    const two = await Promise.all(
      ['w1', 'w2'].map((id) =>
        rewrapShareForRecipient(shares.get(id)!.wrappedShare, witnesses[id].privateKey, recipientA.publicKey)
      )
    );
    const wrong = await combineAndUnwrap(two, recipientA.privateKey);
    await expect(unwrapFileKeyUnderRelease(wrappedFileKey, wrong)).rejects.toThrow();
    await expect(decryptBytes(encrypted, wrong)).rejects.toThrow();
  });

  it('a share rewrapped for one recipient is useless to another', async () => {
    const release = await createReleaseKey();
    const shares = await splitForWitnesses(release, witnessKeys(['w1', 'w2']), 2);
    const rewrapped = await rewrapShareForRecipient(shares.get('w1')!.wrappedShare, witnesses.w1.privateKey, recipientA.publicKey);
    await expect(combineAndUnwrap([rewrapped], recipientB.privateKey)).rejects.toThrow();
  });

  it('repairs stale shares: re-split after a witness change combines to the same key', async () => {
    const release = await createReleaseKey();
    const { fileKey, encrypted } = await sealedFile();
    const wrappedFileKey = await wrapFileKeyUnderRelease(fileKey, release);
    const ownerWrap = await wrapForOwner(release, masterKey);

    // Witness set changes from 2 witnesses (k=2) to 3 witnesses (k=3).
    for (const [ids, k] of [[['w1', 'w2'], 2], [['w1', 'w2', 'w3'], 3]] as const) {
      const restored = await unwrapForOwner(ownerWrap, masterKey);
      const fresh = await splitForWitnesses(restored, witnessKeys([...ids]), k);
      const rewrapped = await Promise.all(
        ids.slice(0, k).map((id) =>
          rewrapShareForRecipient(fresh.get(id)!.wrappedShare, witnesses[id].privateKey, recipientB.publicKey)
        )
      );
      const combined = await combineAndUnwrap(rewrapped, recipientB.privateKey);
      const recovered = await unwrapFileKeyUnderRelease(wrappedFileKey, combined);
      expect(utf8Decode(await decryptBytes(encrypted, recovered))).toBe(PLAINTEXT);
    }
  });
});
