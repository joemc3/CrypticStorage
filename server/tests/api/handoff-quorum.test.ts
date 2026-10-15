import { api, bearer, closeDatabase, prepareDatabase, registerUser, type TestUser } from '../helpers/api';
import { blob, mkdir, ruleBody, upload, world, type World } from '../helpers/handoff';
import { clearOutbox, outbox } from '../../src/lib/mail';
import { prisma } from '../../src/config/prisma';
import { randomToken, sha256Hex } from '../../src/lib/crypto';

beforeAll(prepareDatabase);
afterAll(closeDatabase);

const mailsTo = (user: TestUser, part: string) => outbox().filter((m) => m.to === user.email && (m.subject + m.text).includes(part));
const ruleState = async (id: string) => (await prisma.handoffRule.findUniqueOrThrow({ where: { id } })).state;
const requestRow = (id: string) => prisma.releaseRequest.findUniqueOrThrow({ where: { id } });

/** Audit rows are written fire-and-forget, so give them a moment to land. */
async function auditRows(where: { action: string; resourceId?: string; userId?: string }, want = 1) {
  let rows = await prisma.auditLog.findMany({ where });
  for (let i = 0; i < 40 && rows.length < want; i += 1) {
    await new Promise((r) => setTimeout(r, 25));
    rows = await prisma.auditLog.findMany({ where });
  }
  return rows;
}

interface Setup {
  w: World;
  ruleId: string;
  fileId: string;
}

async function withRule(witnessCount = 3, threshold = 2): Promise<Setup> {
  const w = await world(witnessCount);
  if (threshold !== 2) await api().put('/api/witnesses/threshold').set(bearer(w.owner)).send({ k: threshold }).expect(200);
  const file = await upload(w.owner);
  const res = await api().post('/api/handoff/rules').set(bearer(w.owner)).send(ruleBody(w, { fileId: file.id }, [file.id]));
  expect(res.status).toBe(201);
  return { w, ruleId: res.body.data.id as string, fileId: file.id };
}

const open = (by: TestUser, ownerId: string) => api().post('/api/handoff/requests').set(bearer(by)).send({ ownerId });

/** One re-wrapped share per rule and recipient, as a witness's client would send. */
const votes = (rules: Array<{ ruleId: string; recipients: string[] }>) => ({
  shares: rules.flatMap((r) => r.recipients.map((recipientUserId) => ({ ruleId: r.ruleId, recipientUserId, wrappedShare: blob(256) }))),
});
const fullVote = (s: Setup) => votes([{ ruleId: s.ruleId, recipients: [s.w.recipient.id] }]);
const vote = (by: TestUser, requestId: string, body: unknown) => api().post(`/api/handoff/requests/${requestId}/votes`).set(bearer(by)).send(body as object);
const move = (user: TestUser, fileId: string, folderId: string) => api().post(`/api/files/${fileId}/move`).set(bearer(user)).send({ folderId });

/** Push the owner's last activity back so the next authenticated request counts as being seen. */
const ageOwner = (owner: TestUser) =>
  prisma.user.update({ where: { id: owner.id }, data: { lastActivityAt: new Date(Date.now() - 10 * 60_000) } });

describe('opening a request', () => {
  it('lets an accepted witness open one, mails the owner and the other witnesses, and names no item', async () => {
    const s = await withRule();
    const [w0, w1, w2] = s.w.witnesses as [TestUser, TestUser, TestUser];
    clearOutbox();
    const res = await open(w0, s.w.owner.id);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ state: 'open', requiredVotes: 2, owner: { id: s.w.owner.id }, openedBy: { id: w0.id } });

    const ownerMail = mailsTo(s.w.owner, 'opened a release request');
    expect(ownerMail).toHaveLength(1);
    expect(ownerMail[0]!.subject).toBe('A witness asked to release your items');
    expect(ownerMail[0]!.text).toMatch(/opened a release request at \d{1,2} \w{3} \d{4}, \d{2}:\d{2} UTC\. Sign in to cancel it; if 2 witnesses vote first/);
    expect(ownerMail[0]!.text).toContain('/login');
    for (const other of [w1, w2]) {
      const m = mailsTo(other, 'You can add your vote or refuse');
      expect(m).toHaveLength(1);
      expect(m[0]!.subject).toContain("'s items");
      expect(m[0]!.text).toContain('/dashboard');
    }
    expect(mailsTo(w0, 'release')).toHaveLength(0);
    expect(mailsTo(s.w.recipient, 'release')).toHaveLength(0);
    for (const m of outbox()) expect(m.subject + m.text).not.toContain(s.fileId);

    const audit = await auditRows({ action: 'handoff.request.open', resourceId: s.w.owner.id });
    expect(audit[0]?.userId).toBe(w0.id);
  });

  it('refuses a non-witness, the owner, and a recipient with 403', async () => {
    const s = await withRule();
    const stranger = await registerUser();
    expect((await open(stranger, s.w.owner.id)).status).toBe(403);
    expect((await open(s.w.owner, s.w.owner.id)).status).toBe(403);
    expect((await open(s.w.recipient, s.w.owner.id)).status).toBe(403);
  });

  it('allows one open request per owner: 409 REQUEST_OPEN, even from another witness', async () => {
    const s = await withRule();
    expect((await open(s.w.witnesses[0]!, s.w.owner.id)).status).toBe(201);
    const second = await open(s.w.witnesses[1]!, s.w.owner.id);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('REQUEST_OPEN');
  });

  it('lets only one of two simultaneous opens through', async () => {
    const s = await withRule();
    const both = [s.w.witnesses[0]!, s.w.witnesses[1]!].map((wit) =>
      api().post('/api/handoff/requests').set(bearer(wit)).set('Connection', 'close').send({ ownerId: s.w.owner.id })
    );
    const results = await Promise.all(both);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.releaseRequest.count({ where: { ownerId: s.w.owner.id, state: 'open' } })).toBe(1);
  });

  it('refuses when the owner has nothing active: 400 NOTHING_TO_RELEASE', async () => {
    const w = await world();
    const res = await open(w.witnesses[0]!, w.owner.id);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NOTHING_TO_RELEASE');
  });

  it('can be opened again once the earlier request is closed', async () => {
    const s = await withRule();
    const first = await open(s.w.witnesses[0]!, s.w.owner.id);
    await ageOwner(s.w.owner);
    await api().get('/api/users/profile').set(bearer(s.w.owner)).expect(200);
    expect((await requestRow(first.body.data.id)).state).toBe('cancelled');
    expect((await open(s.w.witnesses[0]!, s.w.owner.id)).status).toBe(201);
  });
});

describe('voting and release', () => {
  it('stores a full-coverage vote, mails the owner, and releases nothing below k', async () => {
    const s = await withRule();
    const req = await open(s.w.witnesses[0]!, s.w.owner.id);
    clearOutbox();
    const res = await vote(s.w.witnesses[0]!, req.body.data.id, fullVote(s));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ state: 'open', awaitingRepair: [], myVote: true });
    expect(res.body.data.votes).toHaveLength(1);

    const m = mailsTo(s.w.owner, 'Release request: 1 of 2 votes');
    expect(m).toHaveLength(1);
    expect(m[0]!.text).toMatch(/added a vote at .* UTC\. Sign in now to cancel the request\./);
    expect(mailsTo(s.w.owner, 'Your witnesses released your items')).toHaveLength(0);

    expect(await ruleState(s.ruleId)).toBe('active');
    const forMe = await api().get('/api/handoff/for-me').set(bearer(s.w.recipient)).expect(200);
    expect(forMe.body.data[0].state).toBe('active');
    expect(forMe.body.data[0].voteShares).toBeUndefined();
    expect(await prisma.releaseVoteShare.count({ where: { requestId: req.body.data.id } })).toBe(1);
  });

  it('releases at the k-th vote: rules released_quorum, request completed, mails, recipient views', async () => {
    const s = await withRule();
    const req = await open(s.w.witnesses[0]!, s.w.owner.id);
    const id = req.body.data.id as string;
    expect((await vote(s.w.witnesses[0]!, id, fullVote(s))).status).toBe(201);
    clearOutbox();
    const done = await vote(s.w.witnesses[1]!, id, fullVote(s));
    expect(done.status).toBe(201);
    expect(done.body.data.state).toBe('completed');
    expect(done.body.data.closedAt).toBeTruthy();

    expect(await ruleState(s.ruleId)).toBe('released_quorum');
    expect((await prisma.handoffRule.findUniqueOrThrow({ where: { id: s.ruleId } })).releasedAt).not.toBeNull();
    const row = await requestRow(id);
    expect(row.state).toBe('completed');
    expect(row.closedAt).not.toBeNull();

    const completed = mailsTo(s.w.owner, 'Your witnesses released your items');
    expect(completed).toHaveLength(1);
    expect(completed[0]!.text).toMatch(/^2 witnesses voted, and what you marked went to the people you named at .* UTC\. Your own copies are unchanged\./);
    expect(mailsTo(s.w.owner, 'Release request:')).toHaveLength(0);
    const toRecipient = mailsTo(s.w.recipient, 'has handed something to you');
    expect(toRecipient).toHaveLength(1);
    expect(toRecipient[0]!.text).toContain('It released on');
    for (const m of outbox()) expect(m.subject + m.text).not.toContain(s.fileId);

    const forMe = await api().get('/api/handoff/for-me').set(bearer(s.w.recipient)).expect(200);
    const rule = forMe.body.data.find((r: { id: string }) => r.id === s.ruleId);
    expect(rule.state).toBe('released_quorum');
    expect(rule.releasedBy).toBe('quorum');
    expect(rule.wrappedReleaseKey).toBeUndefined();
    expect(rule.voteShares).toHaveLength(2);
    expect(rule.voteShares.map((v: { witnessUserId: string }) => v.witnessUserId).sort()).toEqual(
      [s.w.witnesses[0]!.id, s.w.witnesses[1]!.id].sort()
    );
    expect(rule.voteShares[0].wrappedShare).toEqual(expect.any(String));
    expect(rule.items).toHaveLength(1);
    expect(rule.items[0].file.encryptedFileKey).toBe('');

    const withMe = await api().get('/api/shares/with-me').set(bearer(s.w.recipient)).expect(200);
    const item = withMe.body.data.find((f: { handoff?: { ruleId: string } }) => f.handoff?.ruleId === s.ruleId);
    expect(item.handoff.by).toBe('quorum');
    expect(item.handoff.voteShares).toHaveLength(2);
    expect(item.handoff.wrappedReleaseKey).toBeUndefined();
    expect(item.encryptedFileKey).toBe('');

    expect(await auditRows({ action: 'handoff.rule.released_quorum', resourceId: s.ruleId })).toHaveLength(1);
    expect(await auditRows({ action: 'handoff.request.vote', userId: s.w.witnesses[1]!.id })).toHaveLength(1);

    const stranger = await registerUser();
    expect((await api().get('/api/handoff/for-me').set(bearer(stranger)).expect(200)).body.data).toEqual([]);
  });

  it('rejects a vote after completion with 409', async () => {
    const s = await withRule();
    const id = (await open(s.w.witnesses[0]!, s.w.owner.id)).body.data.id as string;
    await vote(s.w.witnesses[0]!, id, fullVote(s)).expect(201);
    await vote(s.w.witnesses[1]!, id, fullVote(s)).expect(201);
    const late = await vote(s.w.witnesses[2]!, id, fullVote(s));
    expect(late.status).toBe(409);
    expect(await prisma.releaseVote.count({ where: { requestId: id } })).toBe(2);
  });

  it('rejects a vote from a witness removed after the request opened with 403 NOT_A_WITNESS', async () => {
    const s = await withRule();
    const id = (await open(s.w.witnesses[0]!, s.w.owner.id)).body.data.id as string;
    const set = await api().get('/api/witnesses').set(bearer(s.w.owner)).expect(200);
    const row = set.body.data.witnesses.find((x: { user: { id: string } }) => x.user.id === s.w.witnesses[1]!.id);
    await api().delete(`/api/witnesses/${row.id}`).set(bearer(s.w.owner)).expect(200);

    const res = await vote(s.w.witnesses[1]!, id, fullVote(s));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_A_WITNESS');
    expect(await prisma.releaseVote.count({ where: { requestId: id } })).toBe(0);
    // Removing a witness changes the split, so the request is cancelled too.
    expect((await requestRow(id)).state).toBe('cancelled');
    const listed = await api().get('/api/handoff/requests').set(bearer(s.w.witnesses[1]!)).expect(200);
    expect(listed.body.data).toEqual([]);
  });

  it('rejects a non-witness and the owner with 403', async () => {
    const s = await withRule();
    const id = (await open(s.w.witnesses[0]!, s.w.owner.id)).body.data.id as string;
    const stranger = await registerUser();
    expect((await vote(stranger, id, fullVote(s))).status).toBe(403);
    expect((await vote(s.w.owner, id, fullVote(s))).status).toBe(403);
  });

  it('rejects a second vote from the same witness with 409 ALREADY_VOTED', async () => {
    const s = await withRule();
    const id = (await open(s.w.witnesses[0]!, s.w.owner.id)).body.data.id as string;
    await vote(s.w.witnesses[0]!, id, fullVote(s)).expect(201);
    const again = await vote(s.w.witnesses[0]!, id, fullVote(s));
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_VOTED');
    expect(await prisma.releaseVote.count({ where: { requestId: id } })).toBe(1);
  });

  it('rejects incomplete, duplicated or foreign shares with 400 COVERAGE_SHARES and stores nothing', async () => {
    const s = await withRule();
    const other = await registerUser();
    const id = (await open(s.w.witnesses[0]!, s.w.owner.id)).body.data.id as string;
    const bad = [
      { shares: [] },
      votes([{ ruleId: s.ruleId, recipients: [other.id] }]),
      votes([{ ruleId: s.ruleId, recipients: [s.w.recipient.id, other.id] }]),
      { shares: [...fullVote(s).shares, ...fullVote(s).shares] },
      votes([{ ruleId: '00000000-0000-4000-8000-000000000000', recipients: [s.w.recipient.id] }]),
    ];
    for (const body of bad) {
      const res = await vote(s.w.witnesses[0]!, id, body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('COVERAGE_SHARES');
    }
    expect(await prisma.releaseVote.count({ where: { requestId: id } })).toBe(0);
    expect(await prisma.releaseVoteShare.count({ where: { requestId: id } })).toBe(0);
    expect((await vote(s.w.witnesses[0]!, id, { shares: [{ ruleId: s.ruleId, recipientUserId: s.w.recipient.id }] })).status).toBe(422);
  });

  it('skips a stale rule, lists it in awaitingRepair, and leaves it active on completion', async () => {
    const s = await withRule();
    const file2 = await upload(s.w.owner);
    const second = await api().post('/api/handoff/rules').set(bearer(s.w.owner)).send(ruleBody(s.w, { fileId: file2.id }, [file2.id]));
    const staleId = second.body.data.id as string;
    await prisma.handoffRule.update({ where: { id: staleId }, data: { sharesStale: true } });

    const id = (await open(s.w.witnesses[0]!, s.w.owner.id)).body.data.id as string;
    // Covering the stale rule as well is wrong: it is not part of the exact set.
    const tooMany = await vote(
      s.w.witnesses[0]!,
      id,
      votes([
        { ruleId: s.ruleId, recipients: [s.w.recipient.id] },
        { ruleId: staleId, recipients: [s.w.recipient.id] },
      ])
    );
    expect(tooMany.status).toBe(400);

    const first = await vote(s.w.witnesses[0]!, id, fullVote(s));
    expect(first.status).toBe(201);
    expect(first.body.data.awaitingRepair).toEqual([staleId]);
    const done = await vote(s.w.witnesses[1]!, id, fullVote(s));
    expect(done.body.data.state).toBe('completed');
    expect(done.body.data.awaitingRepair).toEqual([staleId]);
    expect(await ruleState(s.ruleId)).toBe('released_quorum');
    expect(await ruleState(staleId)).toBe('active');
    expect((await prisma.handoffRule.findUniqueOrThrow({ where: { id: staleId } })).sharesStale).toBe(true);
  });

  it('refuses a vote when every rule is stale: 400 NOTHING_TO_RELEASE', async () => {
    const s = await withRule();
    const id = (await open(s.w.witnesses[0]!, s.w.owner.id)).body.data.id as string;
    await prisma.handoffRule.update({ where: { id: s.ruleId }, data: { sharesStale: true } });
    const res = await vote(s.w.witnesses[0]!, id, { shares: [] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NOTHING_TO_RELEASE');
  });

  it('completes exactly once when the last votes arrive together', async () => {
    const s = await withRule(3, 3);
    const id = (await open(s.w.witnesses[0]!, s.w.owner.id)).body.data.id as string;
    clearOutbox();
    const results = await Promise.all(s.w.witnesses.map((wit) => vote(wit, id, fullVote(s))));
    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
    expect(await ruleState(s.ruleId)).toBe('released_quorum');
    expect(mailsTo(s.w.owner, 'Your witnesses released your items')).toHaveLength(1);
    expect(mailsTo(s.w.recipient, 'has handed something to you')).toHaveLength(1);
    expect(await auditRows({ action: 'handoff.rule.released_quorum', resourceId: s.ruleId })).toHaveLength(1);
  });

  it('does not touch a rule the timer released after the first vote', async () => {
    const s = await withRule();
    const id = (await open(s.w.witnesses[0]!, s.w.owner.id)).body.data.id as string;
    await vote(s.w.witnesses[0]!, id, fullVote(s)).expect(201);
    await prisma.handoffRule.update({ where: { id: s.ruleId }, data: { state: 'released_timer', releasedAt: new Date() } });
    const res = await vote(s.w.witnesses[1]!, id, fullVote(s));
    expect(res.status).toBe(400);
    expect(await ruleState(s.ruleId)).toBe('released_timer');
  });
});

describe('cancelling on owner activity', () => {
  it('cancels the open request when the owner makes an authenticated request, mails every witness, leaves rules alone', async () => {
    const s = await withRule();
    const id = (await open(s.w.witnesses[0]!, s.w.owner.id)).body.data.id as string;
    await vote(s.w.witnesses[0]!, id, fullVote(s)).expect(201);
    await ageOwner(s.w.owner);
    clearOutbox();

    await api().get('/api/users/profile').set(bearer(s.w.owner)).expect(200);
    const row = await requestRow(id);
    expect(row.state).toBe('cancelled');
    expect(row.closedAt).not.toBeNull();
    expect(await ruleState(s.ruleId)).toBe('active');
    for (const wit of s.w.witnesses) {
      const m = mailsTo(wit, 'signed in, so the request is cancelled');
      expect(m).toHaveLength(1);
      expect(m[0]!.text).toContain('Nothing was released. There is nothing for you to do.');
    }
    expect(mailsTo(s.w.recipient, 'cancelled')).toHaveLength(0);
    expect(await auditRows({ action: 'handoff.request.cancel', resourceId: id })).toHaveLength(1);
    // The shares of a cancelled request are not kept.
    expect(await prisma.releaseVoteShare.count({ where: { requestId: id } })).toBe(0);

    const late = await vote(s.w.witnesses[1]!, id, fullVote(s));
    expect(late.status).toBe(409);
    expect(await ruleState(s.ruleId)).toBe('active');
  });

  it('sends one set of mails when touches race', async () => {
    const s = await withRule();
    const id = (await open(s.w.witnesses[0]!, s.w.owner.id)).body.data.id as string;
    await ageOwner(s.w.owner);
    clearOutbox();
    await Promise.all([1, 2, 3].map(() => api().get('/api/users/profile').set(bearer(s.w.owner))));
    expect((await requestRow(id)).state).toBe('cancelled');
    for (const wit of s.w.witnesses) expect(mailsTo(wit, 'signed in, so the request is cancelled')).toHaveLength(1);
  });

  it('does not cancel while the owner stays inside the five-minute throttle', async () => {
    const s = await withRule();
    const id = (await open(s.w.witnesses[0]!, s.w.owner.id)).body.data.id as string;
    await api().get('/api/users/profile').set(bearer(s.w.owner)).expect(200);
    expect((await requestRow(id)).state).toBe('open');
  });

  it('a check-in cancels it too', async () => {
    const s = await withRule();
    const id = (await open(s.w.witnesses[0]!, s.w.owner.id)).body.data.id as string;
    const token = randomToken(32);
    await prisma.emailToken.create({
      data: { userId: s.w.owner.id, purpose: 'check_in', tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + 86_400_000) },
    });
    clearOutbox();
    await api().post('/api/auth/check-in').send({ token }).expect(200);
    expect((await requestRow(id)).state).toBe('cancelled');
    for (const wit of s.w.witnesses) expect(mailsTo(wit, 'signed in, so the request is cancelled')).toHaveLength(1);
  });
});

describe('listing requests', () => {
  it("shows votes, myVote and the caller's own shares only, and nothing to non-witnesses", async () => {
    const s = await withRule();
    const [w0, w1] = s.w.witnesses as [TestUser, TestUser];
    const id = (await open(w0, s.w.owner.id)).body.data.id as string;
    await vote(w1, id, fullVote(s)).expect(201);

    const mine = await api().get('/api/handoff/requests').set(bearer(w0)).expect(200);
    expect(mine.body.data).toHaveLength(1);
    const r = mine.body.data[0];
    expect(r).toMatchObject({ id, state: 'open', requiredVotes: 2, myVote: false, owner: { id: s.w.owner.id }, openedBy: { id: w0.id } });
    expect(r.votes).toHaveLength(1);
    expect(r.votes[0]).toMatchObject({ witnessUserId: w1.id, email: w1.email });
    expect(r.votes[0].votedAt).toBeTruthy();
    expect(r.rules).toHaveLength(1);
    expect(r.rules[0]).toMatchObject({ ruleId: s.ruleId, sharesStale: false, state: 'active' });
    expect(r.rules[0].recipients).toEqual([{ userId: s.w.recipient.id, publicKey: expect.any(String) }]);
    expect(r.myShares).toHaveLength(1);
    expect(r.myShares[0]).toMatchObject({ ruleId: s.ruleId, shareIndex: 1 });
    const stored = await prisma.handoffRuleShare.findUniqueOrThrow({ where: { ruleId_witnessUserId: { ruleId: s.ruleId, witnessUserId: w0.id } } });
    expect(r.myShares[0].wrappedShare).toBe(stored.wrappedShare);
    const others = await prisma.handoffRuleShare.findMany({ where: { ruleId: s.ruleId, witnessUserId: { not: w0.id } } });
    for (const o of others) expect(JSON.stringify(mine.body)).not.toContain(o.wrappedShare);
    const voteShare = await prisma.releaseVoteShare.findFirstOrThrow({ where: { requestId: id } });
    expect(JSON.stringify(mine.body)).not.toContain(voteShare.wrappedShare);

    const theirs = await api().get('/api/handoff/requests').set(bearer(w1)).expect(200);
    expect(theirs.body.data[0].myVote).toBe(true);

    expect((await api().get('/api/handoff/requests').set(bearer(s.w.owner)).expect(200)).body.data).toEqual([]);
    expect((await api().get('/api/handoff/requests').set(bearer(s.w.recipient)).expect(200)).body.data).toEqual([]);
  });

  it('lists closed requests newest first without share material', async () => {
    const s = await withRule();
    const first = (await open(s.w.witnesses[0]!, s.w.owner.id)).body.data.id as string;
    await ageOwner(s.w.owner);
    await api().get('/api/users/profile').set(bearer(s.w.owner)).expect(200);
    const second = (await open(s.w.witnesses[1]!, s.w.owner.id)).body.data.id as string;
    const listed = await api().get('/api/handoff/requests').set(bearer(s.w.witnesses[2]!)).expect(200);
    expect(listed.body.data.map((r: { id: string }) => r.id)).toEqual([second, first]);
    expect(listed.body.data[1]).toMatchObject({ state: 'cancelled' });
    expect(listed.body.data[1].closedAt).toBeTruthy();
    expect(listed.body.data[1].rules).toEqual([]);
    expect(listed.body.data[1].myShares).toEqual([]);
  });

  it('requires authentication', async () => {
    expect((await api().get('/api/handoff/requests')).status).toBe(401);
    expect((await api().post('/api/handoff/requests').send({ ownerId: '00000000-0000-4000-8000-000000000000' })).status).toBe(401);
  });
});

describe('moving a file out of a covered folder', () => {
  it('drops its item row, leaves coverage gaps unchanged, and a move back in shows a gap', async () => {
    const w = await world();
    const folderId = await mkdir(w.owner);
    const elsewhere = await mkdir(w.owner);
    const a = await upload(w.owner, folderId);
    const b = await upload(w.owner, folderId);
    const created = await api().post('/api/handoff/rules').set(bearer(w.owner)).send(ruleBody(w, { folderId }, [a.id, b.id]));
    expect(created.status).toBe(201);
    const ruleId = created.body.data.id as string;
    const gaps = async () => (await api().get(`/api/handoff/rules/${ruleId}`).set(bearer(w.owner)).expect(200)).body.data.coverageGaps as number;
    const items = () => prisma.handoffRuleItem.findMany({ where: { ruleId }, select: { fileId: true } });
    expect(await gaps()).toBe(0);

    await move(w.owner, a.id, elsewhere).expect(200);
    expect((await items()).map((i) => i.fileId)).toEqual([b.id]);
    expect(await gaps()).toBe(0);

    await move(w.owner, a.id, folderId).expect(200);
    expect(await gaps()).toBe(1);
  });

  it('keeps the row when the file moves inside the covered folder, and for a file-target rule', async () => {
    const w = await world();
    const top = await mkdir(w.owner);
    const sub = await mkdir(w.owner, top);
    const a = await upload(w.owner, top);
    const created = await api().post('/api/handoff/rules').set(bearer(w.owner)).send(ruleBody(w, { folderId: top }, [a.id]));
    const ruleId = created.body.data.id as string;
    await move(w.owner, a.id, sub).expect(200);
    expect(await prisma.handoffRuleItem.count({ where: { ruleId } })).toBe(1);

    const f = await upload(w.owner);
    const fileRule = await api().post('/api/handoff/rules').set(bearer(w.owner)).send(ruleBody(w, { fileId: f.id }, [f.id]));
    const other = await mkdir(w.owner);
    await move(w.owner, f.id, other).expect(200);
    expect(await prisma.handoffRuleItem.count({ where: { ruleId: fileRule.body.data.id } })).toBe(1);
  });
});

/** A second rule made behind the API's back, as if it appeared after the early voters voted. */
async function sneakRule(s: Setup): Promise<string> {
  const rule = await prisma.handoffRule.create({ data: { ownerId: s.w.owner.id, fileId: s.fileId, periodDays: 30, wrappedReleaseKeyOwner: blob() } });
  await prisma.handoffRuleRecipient.create({ data: { ruleId: rule.id, userId: s.w.recipient.id, wrappedReleaseKey: blob(256) } });
  return rule.id;
}

describe('owner changes and login cancel the request', () => {
  const cancelledWithMails = async (s: Setup, id: string, wording = 'changed their safe, so the request is cancelled') => {
    expect((await requestRow(id)).state).toBe('cancelled');
    for (const wit of s.w.witnesses) expect(mailsTo(wit, wording).length).toBeGreaterThanOrEqual(1);
    for (const wit of s.w.witnesses) expect(mailsTo(wit, 'signed in')).toHaveLength(0);
    expect(await prisma.releaseVoteShare.count({ where: { requestId: id } })).toBe(0);
  };

  it('a login cancels it even inside the touch throttle, and mails the witnesses', async () => {
    const s = await withRule();
    const id = (await open(s.w.witnesses[0]!, s.w.owner.id)).body.data.id as string;
    clearOutbox();
    await api().post('/api/auth/login').send({ email: s.w.owner.email, passwordHash: s.w.owner.passwordHash }).expect(200);
    expect((await requestRow(id)).state).toBe('cancelled');
    for (const wit of s.w.witnesses) expect(mailsTo(wit, 'signed in, so the request is cancelled')).toHaveLength(1);
    expect(await prisma.releaseVoteShare.count({ where: { requestId: id } })).toBe(0);
    expect(await ruleState(s.ruleId)).toBe('active');
  });

  it('replacing shares cancels it, and the next request releases with shares from one split only', async () => {
    const s = await withRule();
    const [w0, w1, w2] = s.w.witnesses as [TestUser, TestUser, TestUser];
    const first = (await open(w0, s.w.owner.id)).body.data.id as string;
    await vote(w0, first, fullVote(s)).expect(201);
    clearOutbox();
    const fresh = s.w.witnesses.map((w, i) => ({ witnessUserId: w.id, shareIndex: i + 1, wrappedShare: blob() }));
    await api().put(`/api/handoff/rules/${s.ruleId}/shares`).set(bearer(s.w.owner)).send({ shares: fresh }).expect(200);
    await cancelledWithMails(s, first);

    const second = (await open(w1, s.w.owner.id)).body.data.id as string;
    await vote(w1, second, fullVote(s)).expect(201);
    await vote(w2, second, fullVote(s)).expect(201);
    const forMe = await api().get('/api/handoff/for-me').set(bearer(s.w.recipient)).expect(200);
    const shares = forMe.body.data.find((r: { id: string }) => r.id === s.ruleId).voteShares as Array<{ witnessUserId: string }>;
    expect(shares.map((x) => x.witnessUserId).sort()).toEqual([w1.id, w2.id].sort());
  });

  it('changing the threshold cancels it', async () => {
    const s = await withRule();
    const id = (await open(s.w.witnesses[0]!, s.w.owner.id)).body.data.id as string;
    clearOutbox();
    await api().put('/api/witnesses/threshold').set(bearer(s.w.owner)).send({ k: 3 }).expect(200);
    await cancelledWithMails(s, id);
  });

  it('inviting a witness cancels it', async () => {
    const s = await withRule();
    const id = (await open(s.w.witnesses[0]!, s.w.owner.id)).body.data.id as string;
    clearOutbox();
    const extra = await registerUser();
    await api().post('/api/witnesses').set(bearer(s.w.owner)).send({ email: extra.email }).expect(201);
    await cancelledWithMails(s, id);
  });

  it('creating or revoking a rule cancels it', async () => {
    const s = await withRule();
    const id = (await open(s.w.witnesses[0]!, s.w.owner.id)).body.data.id as string;
    clearOutbox();
    const file = await upload(s.w.owner);
    const created = await api().post('/api/handoff/rules').set(bearer(s.w.owner)).send(ruleBody(s.w, { fileId: file.id }, [file.id]));
    expect(created.status).toBe(201);
    await cancelledWithMails(s, id);

    const again = (await open(s.w.witnesses[1]!, s.w.owner.id)).body.data.id as string;
    await api().delete(`/api/handoff/rules/${created.body.data.id}`).set(bearer(s.w.owner)).expect(200);
    expect((await requestRow(again)).state).toBe('cancelled');
  });

  it('a witness answering an invitation does not cancel it', async () => {
    const s = await withRule();
    const id = (await open(s.w.witnesses[0]!, s.w.owner.id)).body.data.id as string;
    const late = await registerUser();
    const invited = await api().post('/api/witnesses').set(bearer(s.w.owner)).send({ email: late.email }).expect(201);
    const reopened = await open(s.w.witnesses[0]!, s.w.owner.id);
    expect(reopened.status).toBe(201);
    await api().post(`/api/witnesses/invitations/${invited.body.data.id}/accept`).set(bearer(late)).expect(200);
    expect((await requestRow(reopened.body.data.id)).state).toBe('open');
    expect((await requestRow(id)).state).toBe('cancelled');
  });
});

describe('vote share lifetime', () => {
  it('serves a rule only the shares of the request that released it', async () => {
    const s = await withRule();
    const [w0, w1, w2] = s.w.witnesses as [TestUser, TestUser, TestUser];
    const a = (await open(w0, s.w.owner.id)).body.data.id as string;
    await vote(w0, a, fullVote(s)).expect(201);
    const rule2 = await sneakRule(s);
    const both = votes([
      { ruleId: s.ruleId, recipients: [s.w.recipient.id] },
      { ruleId: rule2, recipients: [s.w.recipient.id] },
    ]);
    const done = await vote(w1, a, both);
    expect(done.body.data.state).toBe('completed');
    expect(await ruleState(s.ruleId)).toBe('released_quorum');
    expect(await ruleState(rule2)).toBe('active');
    // The one share for rule 2 is gone with the request's completion.
    expect(await prisma.releaseVoteShare.count({ where: { requestId: a, ruleId: rule2 } })).toBe(0);

    // The owner repairs the second rule's shares before the next request.
    const repaired = s.w.witnesses.map((w, i) => ({ witnessUserId: w.id, shareIndex: i + 1, wrappedShare: blob() }));
    await api().put(`/api/handoff/rules/${rule2}/shares`).set(bearer(s.w.owner)).send({ shares: repaired }).expect(200);

    const b = (await open(w0, s.w.owner.id)).body.data.id as string;
    await vote(w0, b, votes([{ ruleId: rule2, recipients: [s.w.recipient.id] }])).expect(201);
    const second = await vote(w2, b, votes([{ ruleId: rule2, recipients: [s.w.recipient.id] }]));
    expect(second.body.data.state).toBe('completed');
    expect((await prisma.handoffRule.findUniqueOrThrow({ where: { id: rule2 } })).releasedByRequestId).toBe(b);

    // A stray share under the earlier request: only the releasedByRequestId filter keeps it out of the answer.
    await prisma.releaseVoteShare.create({
      data: { requestId: a, witnessUserId: w1.id, ruleId: rule2, recipientUserId: s.w.recipient.id, wrappedShare: 'stray' },
    });
    const forMe = await api().get('/api/handoff/for-me').set(bearer(s.w.recipient)).expect(200);
    const byRule = (id: string) => forMe.body.data.find((r: { id: string }) => r.id === id).voteShares as Array<{ witnessUserId: string }>;
    expect(byRule(rule2).map((x) => x.witnessUserId).sort()).toEqual([w0.id, w2.id].sort());
    expect(byRule(s.ruleId).map((x) => x.witnessUserId).sort()).toEqual([w0.id, w1.id].sort());
  });

  it('closes a request as cancelled when k votes cannot release anything', async () => {
    const s = await withRule();
    const [w0, w1] = s.w.witnesses as [TestUser, TestUser];
    const id = (await open(w0, s.w.owner.id)).body.data.id as string;
    await vote(w0, id, fullVote(s)).expect(201);
    await prisma.handoffRule.update({ where: { id: s.ruleId }, data: { state: 'revoked' } });
    const rule2 = await sneakRule(s);
    clearOutbox();
    const res = await vote(w1, id, votes([{ ruleId: rule2, recipients: [s.w.recipient.id] }]));
    expect(res.status).toBe(201);
    expect(res.body.data.state).toBe('cancelled');
    expect(await ruleState(rule2)).toBe('active');
    expect(await prisma.releaseVoteShare.count({ where: { requestId: id } })).toBe(0);
    for (const wit of s.w.witnesses) expect(mailsTo(wit, 'could not complete')).toHaveLength(1);
    for (const wit of s.w.witnesses) expect(mailsTo(wit, 'signed in')).toHaveLength(0);
    const rows = await auditRows({ action: 'handoff.request.cancel', resourceId: id });
    expect(rows[0]!.metadata).toMatchObject({ reason: 'no_release_possible' });
  });
});

/** Wait until `n` backends are blocked on a lock, so the order of the queue is known rather than guessed. */
async function waitForLockWaiters(n: number): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    const rows = await prisma.$queryRaw<Array<{ c: bigint }>>`SELECT count(*) AS c FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()`;
    if (Number(rows[0]!.c) >= n) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`fewer than ${n} backends waiting on a lock`);
}

describe('replacing shares while a vote is in flight', () => {
  it('serialises behind the request lock: the late vote finds the request cancelled and releases nothing', async () => {
    const s = await withRule();
    const [w0, w1] = s.w.witnesses as [TestUser, TestUser];
    const id = (await open(w0, s.w.owner.id)).body.data.id as string;
    await vote(w0, id, fullVote(s)).expect(201);

    // Hold the request row lock, start the owner's re-split first, then the vote. Both queue behind the lock in
    // that order, which is the order that broke when the cancel ran after the share replacement committed.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const isLocked = new Promise<void>((r) => (locked = r));
    const held = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM release_requests WHERE id = ${id} FOR UPDATE`;
        locked();
        await gate;
      },
      { timeout: 30_000 }
    );
    await isLocked;
    const before = await prisma.handoffRuleShare.findMany({ where: { ruleId: s.ruleId }, orderBy: { witnessUserId: 'asc' } });
    const fresh = s.w.witnesses.map((w, i) => ({ witnessUserId: w.id, shareIndex: i + 1, wrappedShare: blob() }));
    const replacing = api().put(`/api/handoff/rules/${s.ruleId}/shares`).set(bearer(s.w.owner)).set('Connection', 'close').send({ shares: fresh }).then((r) => r);
    await waitForLockWaiters(1);
    // The re-split is queued behind the lock and has written nothing: from another connection the rule is untouched.
    // Under the old ordering it committed without the lock and these would already have changed.
    const during = await prisma.handoffRule.findUniqueOrThrow({ where: { id: s.ruleId } });
    expect(during.sharesStale).toBe(false);
    expect(await prisma.handoffRuleShare.findMany({ where: { ruleId: s.ruleId }, orderBy: { witnessUserId: 'asc' } })).toEqual(before);
    const voting = vote(w1, id, fullVote(s)).set('Connection', 'close').then((r) => r);
    await waitForLockWaiters(2);
    release();
    await held;
    const [replaced, voted] = await Promise.all([replacing, voting]);

    expect(replaced.status).toBe(200);
    expect(voted.status).toBe(409);
    expect(await ruleState(s.ruleId)).toBe('active');
    expect((await requestRow(id)).state).toBe('cancelled');
    expect(await prisma.releaseVoteShare.count({ where: { ruleId: s.ruleId } })).toBe(0);
  });

  it('a vote built from the old shares snapshot is refused after a re-split', async () => {
    const s = await withRule();
    const [w0, w1] = s.w.witnesses as [TestUser, TestUser];
    const id = (await open(w0, s.w.owner.id)).body.data.id as string;
    await vote(w0, id, fullVote(s)).expect(201);
    const fresh = s.w.witnesses.map((w, i) => ({ witnessUserId: w.id, shareIndex: i + 1, wrappedShare: blob() }));
    await api().put(`/api/handoff/rules/${s.ruleId}/shares`).set(bearer(s.w.owner)).send({ shares: fresh }).expect(200);
    expect((await vote(w1, id, fullVote(s))).status).toBe(409);
    expect(await ruleState(s.ruleId)).toBe('active');
    expect(await prisma.releaseVoteShare.count({ where: { ruleId: s.ruleId } })).toBe(0);
  });
});

describe('a stale flag and a completing vote on several rules', () => {
  /** Two open rules, one vote in, an invitee waiting to accept, and the request row lock held from outside. */
  async function arrange() {
    const s = await withRule();
    const file2 = await upload(s.w.owner);
    const second = await api().post('/api/handoff/rules').set(bearer(s.w.owner)).send(ruleBody(s.w, { fileId: file2.id }, [file2.id])).expect(201);
    const ruleIds = [s.ruleId, second.body.data.id as string];
    const late = await registerUser();
    const invited = await api().post('/api/witnesses').set(bearer(s.w.owner)).send({ email: late.email }).expect(201);
    const id = (await open(s.w.witnesses[0]!, s.w.owner.id)).body.data.id as string;
    const body = votes(ruleIds.map((ruleId) => ({ ruleId, recipients: [s.w.recipient.id] })));
    await vote(s.w.witnesses[0]!, id, body).expect(201);

    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const isLocked = new Promise<void>((r) => (locked = r));
    const held = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM release_requests WHERE id = ${id} FOR UPDATE`;
        locked();
        await gate;
      },
      { timeout: 30_000 }
    );
    await isLocked;
    const accept = () => api().post(`/api/witnesses/invitations/${invited.body.data.id}/accept`).set(bearer(late)).set('Connection', 'close').then((r) => r);
    const finish = () => vote(s.w.witnesses[1]!, id, body).set('Connection', 'close').then((r) => r);
    return { s, ruleIds, id, held, release, accept, finish };
  }

  it('vote first: it completes, then the flag finds nothing open; neither errors', async () => {
    const t = await arrange();
    const voting = t.finish();
    await waitForLockWaiters(1);
    const accepting = t.accept();
    await waitForLockWaiters(2);
    t.release();
    await t.held;
    const [voted, accepted] = await Promise.all([voting, accepting]);
    expect(voted.status).toBe(201);
    expect(accepted.status).toBe(200);
    expect(voted.body.data.state).toBe('completed');
    for (const r of t.ruleIds) expect(await ruleState(r)).toBe('released_quorum');
  });

  it('flag first: the rules turn stale, then the vote sees them stale; neither errors', async () => {
    const t = await arrange();
    const accepting = t.accept();
    await waitForLockWaiters(1);
    const voting = t.finish();
    await waitForLockWaiters(2);
    t.release();
    await t.held;
    const [voted, accepted] = await Promise.all([voting, accepting]);
    expect(accepted.status).toBe(200);
    expect(voted.status).toBe(400);
    expect(voted.body.code).toBe('NOTHING_TO_RELEASE');
    for (const r of t.ruleIds) {
      const rule = await prisma.handoffRule.findUniqueOrThrow({ where: { id: r } });
      expect(rule.state).toBe('active');
      expect(rule.sharesStale).toBe(true);
    }
    expect((await requestRow(t.id)).state).toBe('open');
  });
});
