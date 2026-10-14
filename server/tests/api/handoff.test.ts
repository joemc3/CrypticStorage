import { api, bearer, closeDatabase, prepareDatabase, registerUser, type TestUser } from '../helpers/api';
import { blob, mkdir, ruleBody, shares, upload, world, acceptedWitnesses, type World } from '../helpers/handoff';
import { outbox } from '../../src/lib/mail';
import { env } from '../../src/config/env';
import { prisma } from '../../src/config/prisma';

beforeAll(prepareDatabase);
afterAll(closeDatabase);

const create = (owner: TestUser, body: unknown) => api().post('/api/handoff/rules').set(bearer(owner)).send(body as object);

describe('create', () => {
  it('creates a rule on a file, mails each recipient without a file name, and stores the rows', async () => {
    const w = await world();
    const second = await registerUser();
    const file = await upload(w.owner);
    const body = ruleBody(w, { fileId: file.id }, [file.id], {
      recipients: [
        { userId: w.recipient.id, wrappedReleaseKey: blob(256) },
        { userId: second.id, wrappedReleaseKey: blob(256) },
      ],
    });
    const res = await create(w.owner, body);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      fileId: file.id,
      periodDays: 30,
      state: 'active',
      sharesStale: false,
      coverageGaps: 0,
      items: [{ fileId: file.id }],
      wrappedReleaseKeyOwner: body.wrappedReleaseKeyOwner,
    });
    expect(res.body.data.recipients.map((r: { userId: string }) => r.userId).sort()).toEqual([w.recipient.id, second.id].sort());
    expect(res.body.data.recipients.every((r: { notifiedAt: string | null }) => typeof r.notifiedAt === 'string')).toBe(true);

    for (const r of [w.recipient, second]) {
      const mails = outbox().filter((m) => m.to === r.email && m.subject.includes('has set something aside for you'));
      expect(mails).toHaveLength(1);
      expect(mails[0]!.text).toContain('/dashboard');
      expect(mails[0]!.text).not.toContain(file.id);
    }

    const id = res.body.data.id as string;
    expect(await prisma.handoffRuleRecipient.count({ where: { ruleId: id } })).toBe(2);
    expect(await prisma.handoffRuleItem.count({ where: { ruleId: id } })).toBe(1);
    expect(await prisma.handoffRuleShare.count({ where: { ruleId: id } })).toBe(3);
  });

  it('rejects a folder rule that posts one item for two files (COVERAGE_ITEMS)', async () => {
    const w = await world();
    const folderId = await mkdir(w.owner);
    const a = await upload(w.owner, folderId);
    const b = await upload(w.owner, folderId);
    const short = await create(w.owner, ruleBody(w, { folderId }, [a.id]));
    expect(short.status).toBe(400);
    expect(short.body.code).toBe('COVERAGE_ITEMS');
    expect(await prisma.handoffRule.count({ where: { ownerId: w.owner.id } })).toBe(0);

    const extra = await upload(w.owner);
    const tooMany = await create(w.owner, ruleBody(w, { folderId }, [a.id, b.id, extra.id]));
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.code).toBe('COVERAGE_ITEMS');

    const ok = await create(w.owner, ruleBody(w, { folderId }, [a.id, b.id]));
    expect(ok.status).toBe(201);
  });

  it('covers the whole subtree of a folder', async () => {
    const w = await world();
    const top = await mkdir(w.owner);
    const sub = await mkdir(w.owner, top);
    const a = await upload(w.owner, top);
    const b = await upload(w.owner, sub);
    expect((await create(w.owner, ruleBody(w, { folderId: top }, [a.id]))).body.code).toBe('COVERAGE_ITEMS');
    expect((await create(w.owner, ruleBody(w, { folderId: top }, [a.id, b.id]))).status).toBe(201);
  });

  it('needs exactly one target that belongs to the owner', async () => {
    const w = await world();
    const file = await upload(w.owner);
    const folderId = await mkdir(w.owner);
    const none = await create(w.owner, ruleBody(w, {}, [file.id]));
    expect(none.status).toBe(400);
    expect(none.body.code).toBe('TARGET');
    const both = await create(w.owner, ruleBody(w, { fileId: file.id, folderId }, [file.id]));
    expect(both.status).toBe(400);
    expect(both.body.code).toBe('TARGET');

    const stranger = await registerUser();
    const theirs = await upload(stranger);
    expect((await create(w.owner, ruleBody(w, { fileId: theirs.id }, [theirs.id]))).status).toBe(404);
    const theirFolder = await mkdir(stranger);
    expect((await create(w.owner, ruleBody(w, { folderId: theirFolder }, []))).status).toBe(404);
  });

  it('checks shares against the accepted witnesses', async () => {
    const w = await world();
    const file = await upload(w.owner);
    const base = () => ruleBody(w, { fileId: file.id }, [file.id]);

    const missing = await create(w.owner, { ...base(), shares: shares(w.witnesses).slice(0, 2) });
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('COVERAGE_SHARES');

    const stranger = await registerUser();
    const extra = await create(w.owner, { ...base(), shares: [...shares(w.witnesses), { witnessUserId: stranger.id, shareIndex: 4, wrappedShare: blob() }] });
    expect(extra.status).toBe(400);
    expect(extra.body.code).toBe('COVERAGE_SHARES');

    const dupWitness = shares(w.witnesses);
    dupWitness[2] = { ...dupWitness[0]!, shareIndex: 3 };
    expect((await create(w.owner, { ...base(), shares: dupWitness })).body.code).toBe('COVERAGE_SHARES');

    const dupIndex = shares(w.witnesses);
    dupIndex[1]!.shareIndex = 1;
    const di = await create(w.owner, { ...base(), shares: dupIndex });
    expect(di.status).toBe(400);
    expect(di.body.code).toBe('SHARE_INDEX');

    const outOfRange = shares(w.witnesses);
    outOfRange[2]!.shareIndex = 9;
    expect((await create(w.owner, { ...base(), shares: outOfRange })).body.code).toBe('SHARE_INDEX');
    const zero = shares(w.witnesses);
    zero[0]!.shareIndex = 0;
    expect((await create(w.owner, { ...base(), shares: zero })).body.code).toBe('SHARE_INDEX');
  });

  it('refuses a recipient who is unknown, unverified, the owner, or listed twice', async () => {
    const w = await world();
    const file = await upload(w.owner);
    const base = () => ruleBody(w, { fileId: file.id }, [file.id]);
    const rcpt = (userId: string) => ({ userId, wrappedReleaseKey: blob(256) });

    const unknown = await create(w.owner, { ...base(), recipients: [rcpt('3b1e0c1c-7a52-4a89-8e0b-0c9f6a1d2e11')] });
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe('RECIPIENT_NOT_FOUND');

    const unverified = await prisma.user.create({
      data: { email: `unverified-${Date.now()}@example.com`, passwordHash: 'x', salt: 'x', wrappedMasterKey: 'x', publicKey: 'x', encryptedPrivateKey: 'x' },
    });
    const uv = await create(w.owner, { ...base(), recipients: [rcpt(unverified.id)] });
    expect(uv.status).toBe(400);
    expect(uv.body.code).toBe('RECIPIENT_NOT_FOUND');

    expect((await create(w.owner, { ...base(), recipients: [rcpt(w.owner.id)] })).body.code).toBe('RECIPIENT_IS_OWNER');
    expect((await create(w.owner, { ...base(), recipients: [rcpt(w.recipient.id), rcpt(w.recipient.id)] })).body.code).toBe('RECIPIENT_DUPLICATE');
    expect((await create(w.owner, { ...base(), recipients: [] })).body.code).toBe('NO_RECIPIENTS');
  });

  it('accepts periods 7 and 30 and the presets, rejects 5 and 3651', async () => {
    const w = await world();
    const file = await upload(w.owner);
    const post = (periodDays: number) => create(w.owner, ruleBody(w, { fileId: file.id }, [file.id], { periodDays }));
    const five = await post(5);
    expect(five.status).toBe(400);
    expect(five.body.code).toBe('PERIOD');
    expect((await post(3651)).status).toBe(400);
    expect((await post(7)).status).toBe(201);
    expect((await post(30)).status).toBe(201);
    expect((await post(1825)).status).toBe(201);
  });

  it('needs enough accepted witnesses for the threshold (WITNESSES_NOT_READY)', async () => {
    const owner = await registerUser();
    const file = await upload(owner);
    const recipient = await registerUser();
    const one = await acceptedWitnesses(owner, 1);
    const w1: World = { owner, witnesses: one, recipient };
    const res = await create(owner, ruleBody(w1, { fileId: file.id }, [file.id]));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WITNESSES_NOT_READY');

    // An invited-but-not-accepted witness does not count.
    const pending = await registerUser();
    await api().post('/api/witnesses').set(bearer(owner)).send({ email: pending.email }).expect(201);
    expect((await create(owner, ruleBody(w1, { fileId: file.id }, [file.id]))).body.code).toBe('WITNESSES_NOT_READY');

    // Threshold above the accepted count (k = 3 with two accepted, one pending).
    const more = await acceptedWitnesses(owner, 1);
    await api().put('/api/witnesses/threshold').set(bearer(owner)).send({ k: 3 }).expect(200);
    const w2: World = { owner, witnesses: [...one, ...more], recipient };
    const tooHigh = await create(owner, ruleBody(w2, { fileId: file.id }, [file.id]));
    expect(tooHigh.status).toBe(400);
    expect(tooHigh.body.code).toBe('WITNESSES_NOT_READY');
  });

  it('forbids a witness as recipient when WITNESS_MAY_BE_RECIPIENT is false, allows it by default', async () => {
    const w = await world();
    const file = await upload(w.owner);
    const body = ruleBody(w, { fileId: file.id }, [file.id], { recipients: [{ userId: w.witnesses[0]!.id, wrappedReleaseKey: blob(256) }] });
    expect(env.WITNESS_MAY_BE_RECIPIENT).toBe(true);
    const was = env.WITNESS_MAY_BE_RECIPIENT;
    env.WITNESS_MAY_BE_RECIPIENT = false;
    try {
      const refused = await create(w.owner, body);
      expect(refused.status).toBe(400);
      expect(refused.body.code).toBe('WITNESS_IS_RECIPIENT');
    } finally {
      env.WITNESS_MAY_BE_RECIPIENT = was;
    }
    expect((await create(w.owner, body)).status).toBe(201);
  });

  it('refuses a missing or oversized blob', async () => {
    const w = await world();
    const file = await upload(w.owner);
    expect((await create(w.owner, ruleBody(w, { fileId: file.id }, [file.id], { wrappedReleaseKeyOwner: '' }))).status).toBe(422);
    expect((await create(w.owner, ruleBody(w, { fileId: file.id }, [file.id], { wrappedReleaseKeyOwner: 'a'.repeat(20000) }))).status).toBe(422);
  });
});

describe('listing, coverage and repair', () => {
  it('shows coverageGaps after a new file lands in the folder, and PUT items clears it', async () => {
    const w = await world();
    const folderId = await mkdir(w.owner);
    const a = await upload(w.owner, folderId);
    const made = await create(w.owner, ruleBody(w, { folderId }, [a.id]));
    expect(made.status).toBe(201);
    const id = made.body.data.id as string;

    const fresh = await upload(w.owner, folderId);
    const list = await api().get('/api/handoff/rules').set(bearer(w.owner));
    expect(list.status).toBe(200);
    const row = list.body.data.find((r: { id: string }) => r.id === id);
    expect(row).toMatchObject({ coverageGaps: 1, folderId, state: 'active', periodDays: 30 });
    expect(row.nextCheckInAt).toEqual(expect.any(String));
    expect(row.items).toBeUndefined();
    expect(row.recipients[0]).toMatchObject({ userId: w.recipient.id, email: w.recipient.email });

    const notUnder = await upload(w.owner);
    const bad = await api().put(`/api/handoff/rules/${id}/items`).set(bearer(w.owner)).send({ items: [{ fileId: notUnder.id, wrappedFileKey: blob() }] });
    expect(bad.status).toBe(400);

    const put = await api()
      .put(`/api/handoff/rules/${id}/items`)
      .set(bearer(w.owner))
      .send({ items: [{ fileId: fresh.id, wrappedFileKey: blob() }, { fileId: a.id, wrappedFileKey: blob() }] });
    expect(put.status).toBe(200);
    expect(put.body.data.coverageGaps).toBe(0);
    expect(put.body.data.items.map((i: { fileId: string }) => i.fileId).sort()).toEqual([a.id, fresh.id].sort());
    // The ignored duplicate did not replace the stored blob.
    const stored = await prisma.handoffRuleItem.findUniqueOrThrow({ where: { ruleId_fileId: { ruleId: id, fileId: a.id } } });
    expect(stored.wrappedFileKey).not.toBe('');
  });

  it('returns detail with items and the owner blob, only to the owner', async () => {
    const w = await world();
    const file = await upload(w.owner);
    const made = await create(w.owner, ruleBody(w, { fileId: file.id }, [file.id]));
    const id = made.body.data.id as string;
    const got = await api().get(`/api/handoff/rules/${id}`).set(bearer(w.owner));
    expect(got.status).toBe(200);
    expect(got.body.data.items).toEqual([{ fileId: file.id }]);
    expect(got.body.data.wrappedReleaseKeyOwner).toEqual(expect.any(String));
    expect(JSON.stringify(got.body.data)).not.toContain('wrappedFileKey');
    expect((await api().get(`/api/handoff/rules/${id}`).set(bearer(w.recipient))).status).toBe(404);
    expect((await api().get('/api/handoff/rules').set(bearer(w.recipient))).body.data).toEqual([]);
  });

  it('flags sharesStale when a witness is removed, accepts, or the threshold changes, and PUT shares clears it', async () => {
    const w = await world();
    const file = await upload(w.owner);
    const made = await create(w.owner, ruleBody(w, { fileId: file.id }, [file.id]));
    const id = made.body.data.id as string;

    const set = await api().get('/api/witnesses').set(bearer(w.owner));
    const row = set.body.data.witnesses.find((x: { user: { id: string } }) => x.user.id === w.witnesses[2]!.id);
    const removed = await api().delete(`/api/witnesses/${row.id}`).set(bearer(w.owner));
    expect(removed.status).toBe(200);
    expect(removed.body.data.activeRules).toEqual([{ id, sharesStale: true }]);
    expect((await api().get(`/api/handoff/rules/${id}`).set(bearer(w.owner))).body.data.sharesStale).toBe(true);

    // Stale shares still name the removed witness; the repair must cover exactly the two who remain.
    const old = await api().put(`/api/handoff/rules/${id}/shares`).set(bearer(w.owner)).send({ shares: shares(w.witnesses) });
    expect(old.status).toBe(400);
    expect(old.body.code).toBe('COVERAGE_SHARES');

    const fixed = await api().put(`/api/handoff/rules/${id}/shares`).set(bearer(w.owner)).send({ shares: shares(w.witnesses.slice(0, 2)) });
    expect(fixed.status).toBe(200);
    expect(fixed.body.data.sharesStale).toBe(false);
    expect(await prisma.handoffRuleShare.count({ where: { ruleId: id } })).toBe(2);

    // A new witness accepting changes the accepted set.
    const [added] = await acceptedWitnesses(w.owner, 1);
    expect((await api().get(`/api/handoff/rules/${id}`).set(bearer(w.owner))).body.data.sharesStale).toBe(true);
    await api().put(`/api/handoff/rules/${id}/shares`).set(bearer(w.owner)).send({ shares: shares([...w.witnesses.slice(0, 2), added!]) }).expect(200);

    // Changing k also needs a re-split, and the threshold response names the rules.
    const th = await api().put('/api/witnesses/threshold').set(bearer(w.owner)).send({ k: 3 });
    expect(th.status).toBe(200);
    expect(th.body.data.activeRules).toEqual([{ id, sharesStale: true }]);
  });
});

describe('revoke', () => {
  it('deletes the blobs, mails the recipients, and refuses a second revoke', async () => {
    const w = await world();
    const file = await upload(w.owner);
    const id = (await create(w.owner, ruleBody(w, { fileId: file.id }, [file.id]))).body.data.id as string;

    const res = await api().delete(`/api/handoff/rules/${id}`).set(bearer(w.owner));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id, state: 'revoked', recipients: [] });
    expect(res.body.data.revokedAt).toEqual(expect.any(String));

    expect(await prisma.handoffRuleRecipient.count({ where: { ruleId: id } })).toBe(0);
    expect(await prisma.handoffRuleItem.count({ where: { ruleId: id } })).toBe(0);
    expect(await prisma.handoffRuleShare.count({ where: { ruleId: id } })).toBe(0);
    const row = await prisma.handoffRule.findUniqueOrThrow({ where: { id } });
    expect(row.state).toBe('revoked');

    const mails = outbox().filter((m) => m.to === w.recipient.email && m.subject === 'A handoff rule naming you was withdrawn');
    expect(mails).toHaveLength(1);
    expect(mails[0]!.text).toContain('Nothing will be released from it.');
    expect(mails[0]!.text).not.toContain(file.id);

    expect((await api().delete(`/api/handoff/rules/${id}`).set(bearer(w.owner))).status).toBe(409);
    expect((await api().put(`/api/handoff/rules/${id}/shares`).set(bearer(w.owner)).send({ shares: shares(w.witnesses) })).status).toBe(409);
    expect((await api().put(`/api/handoff/rules/${id}/items`).set(bearer(w.owner)).send({ items: [] })).status).toBe(409);
    expect((await api().delete(`/api/handoff/rules/${id}`).set(bearer(w.recipient))).status).toBe(404);
  });

  it('refuses to revoke a released rule', async () => {
    const w = await world();
    const file = await upload(w.owner);
    const id = (await create(w.owner, ruleBody(w, { fileId: file.id }, [file.id]))).body.data.id as string;
    await prisma.handoffRule.update({ where: { id }, data: { state: 'released_timer', releasedAt: new Date() } });
    expect((await api().delete(`/api/handoff/rules/${id}`).set(bearer(w.owner))).status).toBe(409);
    expect(await prisma.handoffRuleItem.count({ where: { ruleId: id } })).toBe(1);
  });
});

describe('recipient views', () => {
  it('shows nothing but existence before release, and the blobs after a timer release', async () => {
    const w = await world();
    const folderId = await mkdir(w.owner);
    const a = await upload(w.owner, folderId);
    const b = await upload(w.owner, folderId);
    const body = ruleBody(w, { folderId }, [a.id, b.id]);
    const id = (await create(w.owner, body)).body.data.id as string;

    const before = await api().get('/api/handoff/for-me').set(bearer(w.recipient));
    expect(before.status).toBe(200);
    expect(before.body.data).toHaveLength(1);
    expect(before.body.data[0]).toMatchObject({ id, state: 'active', owner: { id: w.owner.id, email: w.owner.email } });
    expect(before.body.data[0].wrappedReleaseKey).toBeUndefined();
    expect(before.body.data[0].items).toBeUndefined();
    expect(JSON.stringify(before.body.data)).not.toContain(body.recipients[0]!.wrappedReleaseKey);
    expect(JSON.stringify(before.body.data)).not.toContain(a.id);

    const withMe = await api().get('/api/shares/with-me').set(bearer(w.recipient));
    expect(withMe.body.data).toEqual([]);
    // Others see nothing at all.
    expect((await api().get('/api/handoff/for-me').set(bearer(w.owner))).body.data).toEqual([]);
    const downloadBefore = await api().get(`/api/files/${a.id}/download-url`).set(bearer(w.recipient));
    expect(downloadBefore.status).toBe(404);

    await prisma.handoffRule.update({ where: { id }, data: { state: 'released_timer', releasedAt: new Date() } });
    const after = await api().get('/api/handoff/for-me').set(bearer(w.recipient));
    const rule = after.body.data[0];
    expect(rule).toMatchObject({ id, state: 'released_timer', releasedBy: 'timer', wrappedReleaseKey: body.recipients[0]!.wrappedReleaseKey });
    expect(rule.releasedAt).toEqual(expect.any(String));
    expect(rule.items).toHaveLength(2);
    expect(rule.items[0].file.encryptedName).toEqual(expect.any(String));
    expect(rule.items[0].file.encryptedFileKey).toBe('');
    const sent = body.items.find((i) => i.fileId === rule.items[0].fileId)!;
    expect(rule.items[0].wrappedFileKey).toBe(sent.wrappedFileKey);

    const wm = await api().get('/api/shares/with-me').set(bearer(w.recipient));
    expect(wm.body.data).toHaveLength(2);
    expect(wm.body.data[0]).toMatchObject({
      encryptedFileKey: '',
      handoff: { ruleId: id, from: { id: w.owner.id, email: w.owner.email }, by: 'timer', wrappedReleaseKey: body.recipients[0]!.wrappedReleaseKey },
    });
    expect(wm.body.data[0].handoff.wrappedFileKey).toEqual(expect.any(String));
    expect(wm.body.data[0].handoff.releasedAt).toEqual(expect.any(String));

    // Ordinary sharing path: the recipient may fetch the ciphertext.
    expect((await api().get(`/api/files/${a.id}/download-url`).set(bearer(w.recipient))).status).toBe(200);
    // The other recipient-less user still cannot.
    expect((await api().get(`/api/files/${a.id}/download-url`).set(bearer(w.witnesses[0]!))).status).toBe(404);
  });

  it('lists quorum-released files in Shared-with-me without a release key and with no vote shares until votes exist', async () => {
    const w = await world();
    const file = await upload(w.owner);
    const id = (await create(w.owner, ruleBody(w, { fileId: file.id }, [file.id]))).body.data.id as string;
    await prisma.handoffRule.update({ where: { id }, data: { state: 'released_quorum', releasedAt: new Date() } });
    const wm = await api().get('/api/shares/with-me').set(bearer(w.recipient));
    expect(wm.body.data).toHaveLength(1);
    expect(wm.body.data[0].handoff).toMatchObject({ ruleId: id, by: 'quorum' });
    expect(wm.body.data[0].handoff.wrappedReleaseKey).toBeUndefined();
    expect(wm.body.data[0].handoff.voteShares).toEqual([]);
    const fm = await api().get('/api/handoff/for-me').set(bearer(w.recipient));
    expect(fm.body.data[0]).toMatchObject({ state: 'released_quorum', releasedBy: 'quorum', voteShares: [] });
    expect(fm.body.data[0].wrappedReleaseKey).toBeUndefined();
    // The wrapped file keys are served so the client can unwrap once it has recombined the release key.
    expect(fm.body.data[0].items).toHaveLength(1);
  });
});

describe('metadata on files and folders', () => {
  it('counts user shares and unexpired, unrevoked links in shareCount', async () => {
    const w = await world();
    const file = await upload(w.owner);
    const other = await upload(w.owner);
    const count = async (id: string) => (await api().get(`/api/files/${id}`).set(bearer(w.owner))).body.data.shareCount as number;
    expect(await count(file.id)).toBe(0);

    await api().post('/api/shares').set(bearer(w.owner)).send({ fileId: file.id, recipientEmail: w.recipient.email, encryptedFileKey: blob() }).expect(201);
    expect(await count(file.id)).toBe(1);
    const link = await api().post('/api/shares/links').set(bearer(w.owner)).send({ fileId: file.id }).expect(201);
    expect(await count(file.id)).toBe(2);
    await api().post('/api/shares/links').set(bearer(w.owner)).send({ fileId: file.id, expiresAt: new Date(Date.now() + 60_000).toISOString() }).expect(201);
    expect(await count(file.id)).toBe(3);
    await prisma.shareLink.updateMany({ where: { fileId: file.id, expiresAt: { not: null } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await count(file.id)).toBe(2);
    await api().delete(`/api/shares/links/${link.body.data.id}`).set(bearer(w.owner)).expect(200);
    expect(await count(file.id)).toBe(1);
    expect(await count(other.id)).toBe(0);

    const listed = await api().get('/api/files').set(bearer(w.owner));
    const byId = Object.fromEntries(listed.body.data.map((f: { id: string; shareCount: number }) => [f.id, f.shareCount]));
    expect(byId[file.id]).toBe(1);
    expect(byId[other.id]).toBe(0);
  });

  it('gives folders ruleIds from the folder and its ancestors, and the number of uncovered files', async () => {
    const w = await world();
    const top = await mkdir(w.owner);
    const sub = await mkdir(w.owner, top);
    const sibling = await mkdir(w.owner);
    const a = await upload(w.owner, top);
    const made = await create(w.owner, ruleBody(w, { folderId: top }, [a.id]));
    const id = made.body.data.id as string;

    const get = async (fid: string) => (await api().get(`/api/folders/${fid}`).set(bearer(w.owner))).body.data;
    expect(await get(top)).toMatchObject({ ruleIds: [id], coverageGaps: 0 });
    expect(await get(sub)).toMatchObject({ ruleIds: [id], coverageGaps: 0 });
    expect(await get(sibling)).toMatchObject({ ruleIds: [], coverageGaps: 0 });

    await upload(w.owner, sub);
    expect(await get(top)).toMatchObject({ ruleIds: [id], coverageGaps: 1 });
    expect(await get(sub)).toMatchObject({ ruleIds: [id], coverageGaps: 1 });
    const roots = await api().get('/api/folders').set(bearer(w.owner));
    const rootTop = roots.body.data.find((f: { id: string }) => f.id === top);
    expect(rootTop).toMatchObject({ ruleIds: [id], coverageGaps: 1 });
    const children = await api().get('/api/folders').query({ parentId: top }).set(bearer(w.owner));
    expect(children.body.data[0]).toMatchObject({ id: sub, ruleIds: [id], coverageGaps: 1 });

    await api().delete(`/api/handoff/rules/${id}`).set(bearer(w.owner)).expect(200);
    expect(await get(top)).toMatchObject({ ruleIds: [], coverageGaps: 0 });
  });
});
