import { api, bearer, closeDatabase, prepareDatabase, registerUser, type TestUser } from '../helpers/api';
import { blob, ruleBody, upload, world, type World } from '../helpers/handoff';
import { outbox } from '../../src/lib/mail';
import { prisma } from '../../src/config/prisma';
import { runHandoffTimer } from '../../src/jobs/handoff';

beforeAll(prepareDatabase);
afterAll(closeDatabase);
// The job looks at every owner, so each test starts with no other rules for a faked clock to hit.
beforeEach(async () => {
  await prisma.handoffRule.deleteMany();
});

const DAY = 86_400_000;
const PERIOD = 30;

/** Pin the owner's last activity a minute ago, so the 5-minute throttle does not rewrite it during the test. */
async function pinActivity(owner: TestUser): Promise<Date> {
  const t0 = new Date(Date.now() - 60_000);
  await prisma.user.update({ where: { id: owner.id }, data: { lastActivityAt: t0 } });
  return t0;
}

const at = (t0: Date, fraction: number) => () => new Date(t0.getTime() + fraction * PERIOD * DAY);
const mailsTo = (user: TestUser, part: string) => outbox().filter((m) => m.to === user.email && (m.subject + m.text).includes(part));
const reminders = (owner: TestUser) => outbox().filter((m) => m.to === owner.email && m.text.includes('/check-in/'));

async function ruleFor(w: World, over: Record<string, unknown> = {}) {
  const file = await upload(w.owner);
  const res = await api()
    .post('/api/handoff/rules')
    .set(bearer(w.owner))
    .send(ruleBody(w, { fileId: file.id }, [file.id], { periodDays: PERIOD, ...over }));
  expect(res.status).toBe(201);
  return { id: res.body.data.id as string, file };
}

const row = (id: string) => prisma.handoffRule.findUniqueOrThrow({ where: { id } });

describe('thresholds', () => {
  it('stays quiet at 74 %, warns once at 75 %, then 90 % and 95 % once each, and releases at 100 %', async () => {
    const w = await world();
    const { id, file } = await ruleFor(w);
    const t0 = await pinActivity(w.owner);

    expect(await runHandoffTimer(at(t0, 0.74))).toEqual({ warned: 0, released: 0 });
    expect(reminders(w.owner)).toHaveLength(0);
    expect((await row(id)).state).toBe('active');

    expect(await runHandoffTimer(at(t0, 0.75))).toEqual({ warned: 1, released: 0 });
    let r = await row(id);
    expect(r.state).toBe('warning');
    expect(r.reminded75At).not.toBeNull();
    expect(r.reminded90At).toBeNull();
    const first = reminders(w.owner);
    expect(first).toHaveLength(1);
    expect(first[0]!.subject).toContain('A handoff rule releases on');
    expect(first[0]!.text).toMatch(/\/check-in\/[A-Za-z0-9_-]{16,}/);
    expect(first[0]!.text).toContain(w.recipient.email);
    expect(first[0]!.text).not.toContain(file.id);

    expect(await runHandoffTimer(at(t0, 0.76))).toEqual({ warned: 0, released: 0 });
    expect(reminders(w.owner)).toHaveLength(1);

    await runHandoffTimer(at(t0, 0.9));
    expect(reminders(w.owner)).toHaveLength(2);
    expect(reminders(w.owner)[1]!.subject).toMatch(/releases in \d+ days/);
    await runHandoffTimer(at(t0, 0.91));
    expect(reminders(w.owner)).toHaveLength(2);

    await runHandoffTimer(at(t0, 0.95));
    expect(reminders(w.owner)).toHaveLength(3);
    expect(reminders(w.owner)[2]!.subject).toContain('Final notice');
    await runHandoffTimer(at(t0, 0.99));
    expect(reminders(w.owner)).toHaveLength(3);
    r = await row(id);
    expect([r.reminded75At, r.reminded90At, r.reminded95At].every((s) => s !== null)).toBe(true);

    // Release
    const counts = await runHandoffTimer(at(t0, 1));
    expect(counts).toEqual({ warned: 0, released: 1 });
    r = await row(id);
    expect(r.state).toBe('released_timer');
    expect(r.releasedAt).not.toBeNull();
    expect(reminders(w.owner)).toHaveLength(3);
    const ownerMail = mailsTo(w.owner, 'has released');
    expect(ownerMail).toHaveLength(1);
    expect(ownerMail[0]!.text).toContain('/dashboard');
    expect(ownerMail[0]!.text).toContain('30 days');
    expect(ownerMail[0]!.text).toContain(w.recipient.email);
    const recipientMail = mailsTo(w.recipient, 'has handed something to you');
    expect(recipientMail).toHaveLength(1);
    expect(recipientMail[0]!.text).toContain('/shared');
    for (const m of [...ownerMail, ...recipientMail]) expect(m.subject + m.text).not.toContain(file.id);

    const forMe = await api().get('/api/handoff/for-me').set(bearer(w.recipient));
    expect(forMe.body.data[0]).toMatchObject({ id, state: 'released_timer', releasedBy: 'timer', wrappedReleaseKey: expect.any(String) });
    expect(forMe.body.data[0].items).toHaveLength(1);
    const withMe = await api().get('/api/shares/with-me').set(bearer(w.recipient));
    expect(withMe.body.data).toHaveLength(1);
    expect(withMe.body.data[0].handoff.by).toBe('timer');

    const audited = await prisma.auditLog.count({ where: { userId: w.owner.id, action: 'handoff.rule.released_timer', resourceId: id } });
    expect(audited).toBe(1);

    // A released rule is never touched again.
    const before = outbox().length;
    expect(await runHandoffTimer(at(t0, 6.6))).toEqual({ warned: 0, released: 0 });
    expect(outbox().length).toBe(before);
    expect(await row(id)).toEqual(r);
  });

  it('sends one reminder per owner per threshold when two rules cross together, naming the earliest date and all recipients', async () => {
    const w = await world();
    const second = await registerUser();
    const a = await ruleFor(w, { periodDays: 55 });
    const secondFile = await upload(w.owner);
    const res = await api()
      .post('/api/handoff/rules')
      .set(bearer(w.owner))
      .send(ruleBody(w, { fileId: secondFile.id }, [secondFile.id], { periodDays: 60, recipients: [{ userId: second.id, wrappedReleaseKey: blob(256) }] }));
    expect(res.status).toBe(201);
    const t0 = await pinActivity(w.owner);

    // 75 % of 55 days is 41.25 days and of 60 days is 45 days, so both are inside 75 to 90 % at day 46.
    const counts = await runHandoffTimer(() => new Date(t0.getTime() + 46 * DAY));
    expect(counts).toEqual({ warned: 2, released: 0 });
    const sent = reminders(w.owner);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain(w.recipient.email);
    expect(sent[0]!.text).toContain(second.email);
    // The earliest release date is the 55-day rule's.
    const earliest = new Date(t0.getTime() + 55 * DAY).getUTCDate().toString();
    expect(sent[0]!.subject).toContain(earliest);
    expect((await row(res.body.data.id)).state).toBe('warning');
    expect((await row(a.id)).state).toBe('warning');
  });

  it('on a jump from 0 to 96 % sends only the final warning and stamps all three', async () => {
    const w = await world();
    const { id } = await ruleFor(w);
    const t0 = await pinActivity(w.owner);
    expect(await runHandoffTimer(at(t0, 0.96))).toEqual({ warned: 1, released: 0 });
    const mails = reminders(w.owner);
    expect(mails).toHaveLength(1);
    expect(mails[0]!.subject).toContain('Final notice');
    const r = await row(id);
    expect(r.state).toBe('warning');
    expect([r.reminded75At, r.reminded90At, r.reminded95At].every((s) => s !== null)).toBe(true);
  });

  it('on a jump past 100 % releases and sends no reminder', async () => {
    const w = await world();
    const { id } = await ruleFor(w);
    const t0 = await pinActivity(w.owner);
    expect(await runHandoffTimer(at(t0, 1.2))).toEqual({ warned: 0, released: 1 });
    expect(reminders(w.owner)).toHaveLength(0);
    expect((await row(id)).state).toBe('released_timer');
  });

  it('is safe to run twice at once: one reminder, one release mail set', async () => {
    const w = await world();
    await ruleFor(w);
    const t0 = await pinActivity(w.owner);
    await Promise.all([runHandoffTimer(at(t0, 0.8)), runHandoffTimer(at(t0, 0.8))]);
    expect(reminders(w.owner)).toHaveLength(1);

    const v = await world();
    await ruleFor(v);
    const u0 = await pinActivity(v.owner);
    await Promise.all([runHandoffTimer(at(u0, 1.1)), runHandoffTimer(at(u0, 1.1))]);
    expect(mailsTo(v.recipient, 'has handed something to you')).toHaveLength(1);
    expect(mailsTo(v.owner, 'has released')).toHaveLength(1);
  });

  it("measures from the owner's current last activity, not from when the rule was made", async () => {
    const w = await world();
    const { id } = await ruleFor(w);
    const t0 = await pinActivity(w.owner);
    // The owner is seen "now" relative to a clock that is 100 % after t0: not stale at that clock.
    await prisma.user.update({ where: { id: w.owner.id }, data: { lastActivityAt: new Date(t0.getTime() + PERIOD * DAY) } });
    expect(await runHandoffTimer(at(t0, 1.01))).toEqual({ warned: 0, released: 0 });
    expect((await row(id)).state).toBe('active');
  });
});

describe('reset and check-in', () => {
  async function warned(w: World) {
    const { id } = await ruleFor(w);
    const t0 = await pinActivity(w.owner);
    await runHandoffTimer(at(t0, 0.8));
    expect((await row(id)).state).toBe('warning');
    return { id, t0 };
  }

  it('check-in with the mailed token resets the clock once, and refuses reuse or a made-up token', async () => {
    const w = await world();
    const { id, t0 } = await warned(w);
    const token = /\/check-in\/([A-Za-z0-9_-]+)/.exec(reminders(w.owner)[0]!.text)![1]!;

    const stored = await prisma.emailToken.findFirstOrThrow({ where: { userId: w.owner.id, purpose: 'check_in' } });
    expect(stored.tokenHash).not.toContain(token);
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * DAY);

    const res = await api().post('/api/auth/check-in').send({ token });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ok: true });
    const r = await row(id);
    expect(r.state).toBe('active');
    expect([r.reminded75At, r.reminded90At, r.reminded95At]).toEqual([null, null, null]);
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: w.owner.id } });
    expect(owner.lastActivityAt.getTime()).toBeGreaterThan(t0.getTime());
    expect(await prisma.auditLog.count({ where: { userId: w.owner.id, action: 'user.check_in' } })).toBe(1);

    const again = await api().post('/api/auth/check-in').send({ token });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('TOKEN_INVALID');
    const fake = await api().post('/api/auth/check-in').send({ token: blob(32).replace(/[^A-Za-z0-9]/g, 'a') });
    expect(fake.status).toBe(400);
    expect(fake.body.code).toBe('TOKEN_INVALID');
  });

  it('refuses an expired token', async () => {
    const w = await world();
    const { t0 } = await warned(w);
    void t0;
    const token = /\/check-in\/([A-Za-z0-9_-]+)/.exec(reminders(w.owner)[0]!.text)![1]!;
    await prisma.emailToken.updateMany({ where: { userId: w.owner.id, purpose: 'check_in' }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await api().post('/api/auth/check-in').send({ token })).body.code).toBe('TOKEN_INVALID');
  });

  it('resets a warning rule when the owner makes an authenticated request after the throttle window', async () => {
    const w = await world();
    const { id } = await warned(w);
    await prisma.user.update({ where: { id: w.owner.id }, data: { lastActivityAt: new Date(Date.now() - 10 * 60_000) } });
    await api().get('/api/handoff/rules').set(bearer(w.owner)).expect(200);
    const r = await row(id);
    expect(r.state).toBe('active');
    expect([r.reminded75At, r.reminded90At, r.reminded95At]).toEqual([null, null, null]);
  });

  it('a request inside the throttle window leaves the warning in place', async () => {
    const w = await world();
    const { id } = await warned(w);
    await api().get('/api/handoff/rules').set(bearer(w.owner)).expect(200);
    expect((await row(id)).state).toBe('warning');
  });
});

describe('dates and revoke', () => {
  it('exposes nextCheckInAt and warningAt from the owner last activity', async () => {
    const w = await world();
    await ruleFor(w);
    const t0 = await pinActivity(w.owner);
    const list = await api().get('/api/handoff/rules').set(bearer(w.owner));
    const rule = list.body.data[0];
    expect(new Date(rule.nextCheckInAt).getTime()).toBe(t0.getTime() + PERIOD * DAY);
    expect(new Date(rule.warningAt).getTime()).toBe(t0.getTime() + 0.75 * PERIOD * DAY);
  });

  it('revoke clears the owner-wrapped release key', async () => {
    const w = await world();
    const { id } = await ruleFor(w);
    await api().delete(`/api/handoff/rules/${id}`).set(bearer(w.owner)).expect(200);
    expect((await row(id)).wrappedReleaseKeyOwner).toBe('');
  });
});
