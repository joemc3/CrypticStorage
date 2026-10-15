import { describe, it, expect, vi, beforeEach } from 'vitest';
import ApiService, { type PublicKeyLookup } from './api.service';
import CryptoService from './crypto.service';
import { lookupContact } from './witness.service';

const FULL = 'ab12cd34ef56ab78cd90ef12ab34cd56' + 'ee'.repeat(16);
const grouped = 'ab12 cd34 ef56 ab78 cd90 ef12 ab34 cd56';

function lookup(trust: PublicKeyLookup['trust']): PublicKeyLookup {
  return { id: 'u2', email: 'p@x.co', publicKey: 'PUB', fingerprint: FULL, trust };
}
const trusted = (fingerprint: string, verifiedInPerson = false) => ({ fingerprint, verifiedInPerson, firstSeenAt: 'a', lastSeenAt: 'b' });

describe('lookupContact', () => {
  let seen: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(CryptoService, 'publicKeyFingerprint').mockResolvedValue(grouped);
    seen = vi.spyOn(ApiService, 'markContactSeen').mockResolvedValue({} as never) as unknown as typeof seen;
  });

  it('records the first sighting and reports no change', async () => {
    vi.spyOn(ApiService, 'getPublicKey').mockResolvedValue(lookup(null));
    const r = await lookupContact('P@x.co');
    expect(seen).toHaveBeenCalledWith('u2');
    expect(r).toMatchObject({ keyChanged: false, verifiedInPerson: false, publicKey: 'PUB', localFingerprint: grouped });
  });

  it('marks seen and keeps the verified flag when the stored fingerprint matches', async () => {
    vi.spyOn(ApiService, 'getPublicKey').mockResolvedValue(lookup(trusted(FULL, true)));
    const r = await lookupContact('p@x.co');
    expect(seen).toHaveBeenCalledTimes(1);
    expect(r.keyChanged).toBe(false);
    expect(r.verifiedInPerson).toBe(true);
  });

  it('reports a changed key and does not mark it seen', async () => {
    vi.spyOn(ApiService, 'getPublicKey').mockResolvedValue(lookup(trusted('00'.repeat(32), true)));
    const r = await lookupContact('p@x.co');
    expect(r.keyChanged).toBe(true);
    expect(r.verifiedInPerson).toBe(false);
    expect(seen).not.toHaveBeenCalled();
  });

  it('refuses a server fingerprint that does not match the key it sent', async () => {
    vi.spyOn(ApiService, 'getPublicKey').mockResolvedValue({ ...lookup(null), fingerprint: 'ff'.repeat(32) });
    await expect(lookupContact('p@x.co')).rejects.toThrow(/does not match/);
    expect(seen).not.toHaveBeenCalled();
  });

  it('turns an unknown account into one plain sentence', async () => {
    vi.spyOn(ApiService, 'getPublicKey').mockRejectedValue({ message: 'No user', statusCode: 404, code: 'NO_ACCOUNT' });
    await expect(lookupContact('x@x.co')).rejects.toThrow('No account with that email, or it is not verified yet.');
  });
});
