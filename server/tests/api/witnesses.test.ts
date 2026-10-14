import { api, bearer, closeDatabase, prepareDatabase, registerUser, registrationPayload, type TestUser } from '../helpers/api';
import { outbox } from '../../src/lib/mail';
import { env } from '../../src/config/env';

beforeAll(prepareDatabase);
afterAll(closeDatabase);

async function invite(owner: TestUser, email: string) {
  return api().post('/api/witnesses').set(bearer(owner)).send({ email });
}

describe('witness set', () => {
  it('invites a verified account, mails the witness a link with no file name, and lists them', async () => {
    const owner = await registerUser();
    const w = await registerUser();
    const res = await invite(owner, w.email);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'invited', respondedAt: null, user: { id: w.id, email: w.email } });
    expect(res.body.data.user.fingerprint).toMatch(/^[0-9a-f]{64}$/);

    const mails = outbox().filter((m) => m.to === w.email && m.text.includes('/witness/'));
    expect(mails).toHaveLength(1);
    expect(mails[0]!.text).toContain(`/witness/${res.body.data.id}`);

    const list = await api().get('/api/witnesses').set(bearer(owner));
    expect(list.status).toBe(200);
    expect(list.body.data).toMatchObject({ threshold: 2, minN: 2, maxN: 7 });
    expect(list.body.data.witnesses).toHaveLength(1);
  });

  it('answers 404 NO_ACCOUNT for an unknown and for an unverified email alike', async () => {
    const owner = await registerUser();
    const unknown = await invite(owner, 'nobody-here@example.com');
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe('NO_ACCOUNT');

    const payload = registrationPayload();
    expect((await api().post('/api/auth/register').send(payload)).status).toBe(201);
    const unverified = await invite(owner, payload.email as string);
    expect(unverified.status).toBe(404);
    expect(unverified.body).toEqual(unknown.body);
  });

  it('refuses to invite yourself', async () => {
    const owner = await registerUser();
    expect((await invite(owner, owner.email)).status).toBe(400);
  });

  it('refuses a second invitation while invited or accepted, and re-invites after decline or removal', async () => {
    const owner = await registerUser();
    const w = await registerUser();
    const first = await invite(owner, w.email);
    expect((await invite(owner, w.email)).status).toBe(409);

    await api().post(`/api/witnesses/invitations/${first.body.data.id}/decline`).set(bearer(w)).expect(200);
    const again = await invite(owner, w.email);
    expect(again.status).toBe(201);
    expect(again.body.data).toMatchObject({ id: first.body.data.id, status: 'invited', respondedAt: null });

    await api().post(`/api/witnesses/invitations/${first.body.data.id}/accept`).set(bearer(w)).expect(200);
    expect((await invite(owner, w.email)).status).toBe(409);

    await api().delete(`/api/witnesses/${first.body.data.id}`).set(bearer(owner)).expect(200);
    expect((await invite(owner, w.email)).status).toBe(201);
  });

  it('caps the set at WITNESS_MAX_N non-removed witnesses', async () => {
    const owner = await registerUser();
    for (let i = 0; i < env.WITNESS_MAX_N; i += 1) {
      const w = await registerUser();
      expect((await invite(owner, w.email)).status).toBe(201);
    }
    const extra = await registerUser();
    expect((await invite(owner, extra.email)).status).toBe(400);
  });
});

describe('invitations', () => {
  it('lets only the invitee accept or decline, once', async () => {
    const owner = await registerUser();
    const w = await registerUser();
    const other = await registerUser();
    const row = (await invite(owner, w.email)).body.data;

    const mine = await api().get('/api/witnesses/invitations').set(bearer(w));
    expect(mine.body.data.invitations).toEqual([
      expect.objectContaining({ id: row.id, owner: expect.objectContaining({ id: owner.id, email: owner.email }) }),
    ]);
    expect(mine.body.data.serving).toEqual([]);

    expect((await api().post(`/api/witnesses/invitations/${row.id}/accept`).set(bearer(other))).status).toBe(404);
    expect((await api().post(`/api/witnesses/invitations/${row.id}/accept`).set(bearer(owner))).status).toBe(404);

    expect((await api().post(`/api/witnesses/invitations/${row.id}/accept`).set(bearer(w))).status).toBe(200);
    expect((await api().post(`/api/witnesses/invitations/${row.id}/accept`).set(bearer(w))).status).toBe(409);
    expect((await api().post(`/api/witnesses/invitations/${row.id}/decline`).set(bearer(w))).status).toBe(409);

    const after = await api().get('/api/witnesses/invitations').set(bearer(w));
    expect(after.body.data.invitations).toEqual([]);
    expect(after.body.data.serving).toEqual([expect.objectContaining({ id: row.id, owner: expect.objectContaining({ id: owner.id }) })]);

    const list = await api().get('/api/witnesses').set(bearer(owner));
    expect(list.body.data.witnesses[0]).toMatchObject({ status: 'accepted' });
    expect(list.body.data.witnesses[0].respondedAt).toEqual(expect.any(String));
  });

  it('records a decline', async () => {
    const owner = await registerUser();
    const w = await registerUser();
    const row = (await invite(owner, w.email)).body.data;
    const res = await api().post(`/api/witnesses/invitations/${row.id}/decline`).set(bearer(w));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('declined');
    const list = await api().get('/api/witnesses').set(bearer(owner));
    expect(list.body.data.witnesses[0].status).toBe('declined');
  });
});

describe('set size ignores declined witnesses', () => {
  it('lets a declined witness be re-invited at the cap and refits k on decline', async () => {
    const owner = await registerUser();
    const ws: TestUser[] = [];
    const rows: string[] = [];
    for (let i = 0; i < env.WITNESS_MAX_N; i += 1) {
      const w = await registerUser();
      ws.push(w);
      rows.push((await invite(owner, w.email)).body.data.id);
    }
    await api().put('/api/witnesses/threshold').set(bearer(owner)).send({ k: env.WITNESS_MAX_N }).expect(200);

    // Decline lowers k from the max to the new count.
    await api().post(`/api/witnesses/invitations/${rows[0]}/decline`).set(bearer(ws[0]!)).expect(200);
    const list = await api().get('/api/witnesses').set(bearer(owner));
    expect(list.body.data.threshold).toBe(env.WITNESS_MAX_N - 1);

    // The threshold bound ignores the declined row.
    const tooHigh = await api().put('/api/witnesses/threshold').set(bearer(owner)).send({ k: env.WITNESS_MAX_N });
    expect(tooHigh.status).toBe(400);

    // One below the cap with a declined row present: re-inviting it fits, and then the set is full.
    expect((await invite(owner, ws[0]!.email)).status).toBe(201);
    const extra = await registerUser();
    expect((await invite(owner, extra.email)).status).toBe(400);
  });
});

describe('removal and threshold', () => {
  async function ownerWithWitnesses(n: number) {
    const owner = await registerUser();
    const rows: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const w = await registerUser();
      rows.push((await invite(owner, w.email)).body.data.id);
    }
    return { owner, rows };
  }

  it('enforces 2 <= k <= n', async () => {
    const { owner } = await ownerWithWitnesses(3);
    const put = (k: unknown) => api().put('/api/witnesses/threshold').set(bearer(owner)).send({ k });
    expect((await put(1)).status).toBe(400);
    expect((await put(4)).status).toBe(400);
    expect((await put(2.5)).status).toBe(422);
    const ok = await put(3);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ threshold: 3, activeRules: [] });
    expect(ok.body.data.witnesses).toHaveLength(3);
  });

  it('removes a witness, lowers the threshold to fit, and never below 2', async () => {
    const { owner, rows } = await ownerWithWitnesses(3);
    await api().put('/api/witnesses/threshold').set(bearer(owner)).send({ k: 3 }).expect(200);

    const first = await api().delete(`/api/witnesses/${rows[0]}`).set(bearer(owner));
    expect(first.status).toBe(200);
    expect(first.body.data).toEqual({ threshold: 2, activeRules: [] });

    const second = await api().delete(`/api/witnesses/${rows[1]}`).set(bearer(owner));
    expect(second.body.data.threshold).toBe(2);

    const list = await api().get('/api/witnesses').set(bearer(owner));
    expect(list.body.data.witnesses).toHaveLength(1);
    expect(list.body.data.threshold).toBe(2);
  });

  it('does not let one owner act on another owner\'s witness row', async () => {
    const { rows } = await ownerWithWitnesses(2);
    const stranger = await registerUser();
    expect((await api().delete(`/api/witnesses/${rows[0]}`).set(bearer(stranger))).status).toBe(404);
  });

  it('requires authentication', async () => {
    expect((await api().get('/api/witnesses')).status).toBe(401);
  });
});

describe('public key lookup and trust', () => {
  it('returns a fingerprint and no trust row until the client records one', async () => {
    const me = await registerUser();
    const contact = await registerUser();
    const before = await api().get('/api/users/public-key').query({ email: contact.email }).set(bearer(me));
    expect(before.status).toBe(200);
    expect(before.body.data.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(before.body.data.trust).toBeNull();

    // The lookup alone must not create the row.
    const again = await api().get('/api/users/public-key').query({ email: contact.email }).set(bearer(me));
    expect(again.body.data.trust).toBeNull();

    const seen = await api().post(`/api/contacts/${contact.id}/seen`).set(bearer(me));
    expect(seen.status).toBe(200);
    expect(seen.body.data).toMatchObject({ fingerprint: before.body.data.fingerprint, verifiedInPerson: false });

    const after = await api().get('/api/users/public-key').query({ email: contact.email }).set(bearer(me));
    expect(after.body.data.trust).toMatchObject({ fingerprint: before.body.data.fingerprint, verifiedInPerson: false });
    expect(after.body.data.trust.firstSeenAt).toEqual(expect.any(String));
  });

  it('sets verifiedInPerson and keeps it across a later seen', async () => {
    const me = await registerUser();
    const contact = await registerUser();
    const set = await api().put(`/api/contacts/${contact.id}/trust`).set(bearer(me)).send({ verifiedInPerson: true });
    expect(set.status).toBe(200);
    expect(set.body.data.verifiedInPerson).toBe(true);
    const seen = await api().post(`/api/contacts/${contact.id}/seen`).set(bearer(me));
    expect(seen.body.data.verifiedInPerson).toBe(true);
    expect(seen.body.data.firstSeenAt).toBe(set.body.data.firstSeenAt);
    const off = await api().put(`/api/contacts/${contact.id}/trust`).set(bearer(me)).send({ verifiedInPerson: false });
    expect(off.body.data.verifiedInPerson).toBe(false);
  });

  it('answers 404 for an unverified account on lookup, seen and trust, like a missing one', async () => {
    const me = await registerUser();
    const payload = registrationPayload();
    const reg = await api().post('/api/auth/register').send(payload);
    expect(reg.status).toBe(201);
    const lookup = await api().get('/api/users/public-key').query({ email: payload.email as string }).set(bearer(me));
    const missing = await api().get('/api/users/public-key').query({ email: 'nobody-at-all@example.com' }).set(bearer(me));
    expect(lookup.status).toBe(404);
    expect(lookup.body).toEqual(missing.body);
    const { prisma } = await import('../../src/config/prisma');
    const id = (await prisma.user.findUniqueOrThrow({ where: { email: payload.email as string } })).id;
    expect((await api().post(`/api/contacts/${id}/seen`).set(bearer(me))).status).toBe(404);
    expect((await api().put(`/api/contacts/${id}/trust`).set(bearer(me)).send({ verifiedInPerson: true })).status).toBe(404);
  });

  it('404s for an unknown contact and rejects a non-boolean', async () => {
    const me = await registerUser();
    const contact = await registerUser();
    expect((await api().post('/api/contacts/00000000-0000-4000-8000-000000000000/seen').set(bearer(me))).status).toBe(404);
    expect((await api().put(`/api/contacts/${contact.id}/trust`).set(bearer(me)).send({ verifiedInPerson: 'yes' })).status).toBe(422);
  });
});
