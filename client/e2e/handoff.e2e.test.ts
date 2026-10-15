/**
 * End-to-end for the handoff: real client services and crypto against a live API.
 * Timer path (job clock injected), quorum path, cancel on owner sign-in, and re-split repair.
 * Every scenario has its own accounts so nothing leaks between them.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import AuthService from '../src/services/auth.service';
import FileService from '../src/services/file.service';
import * as WitnessService from '../src/services/witness.service';
import * as RulesService from '../src/services/rules.service';
import * as ReleaseService from '../src/services/release.service';
import ApiService from '../src/services/api.service';

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:4100/api';
const PHRASE = 'I understand there is no way back';
const PASSWORD = 'correct horse battery staple';
const DAY = 24 * 60 * 60 * 1000;
const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface Mail {
  to: string;
  subject: string;
  text: string;
}

const mailTo = async (to: string): Promise<Mail[]> => {
  const res = await fetch(`${API}/_test/mail?to=${encodeURIComponent(to)}`);
  return ((await res.json()) as { data: Mail[] }).data;
};
const post = (path: string, body?: unknown) =>
  fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
const setClock = async (now: Date | null) => expect((await post('/_test/clock', { now: now ? now.toISOString() : null })).status).toBe(200);

function fileOf(name: string, size: number): File {
  const bytes = new Uint8Array(size);
  for (let o = 0; o < size; o += 65536) crypto.getRandomValues(bytes.subarray(o, Math.min(size, o + 65536)));
  return new File([bytes], name, { type: 'application/pdf' });
}
const bytesOf = async (blob: Blob) => Buffer.from(await blob.arrayBuffer());

async function register(email: string) {
  await AuthService.register(email, PASSWORD, undefined, PHRASE);
  let token: string | undefined;
  for (let i = 0; i < 10 && !token; i++) {
    token = (await mailTo(email)).map((m) => m.text.match(/\/verify\/([A-Za-z0-9_-]+)/)?.[1]).find(Boolean);
    if (!token) await new Promise((r) => setTimeout(r, 200));
  }
  if (!token) throw new Error(`No verification mail for ${email}`);
  await AuthService.verifyEmail(token);
  return (await AuthService.login(email, PASSWORD)).user;
}

/** Sign out whoever is in and sign in as this person. */
async function as(email: string) {
  await AuthService.logout().catch(() => undefined);
  await AuthService.login(email, PASSWORD);
}

interface Cast {
  owner: string;
  w: string[];
  recipient: string;
  ids: Record<string, string>;
}

/** Five accounts: an owner, three witnesses who have accepted, and a recipient. Threshold 2. */
async function cast(tag: string, witnesses = 3): Promise<Cast> {
  const email = (n: string) => `${n}-${tag}-${unique}@example.com`;
  const c: Cast = { owner: email('owner'), w: Array.from({ length: witnesses }, (_, i) => email(`w${i + 1}`)), recipient: email('rcpt'), ids: {} };
  for (const e of [...c.w, c.recipient, c.owner]) {
    const user = await register(e);
    c.ids[e] = user.id;
  }
  // The owner is signed in last. Invite, then each witness accepts.
  for (const w of c.w) await WitnessService.invite(w);
  await WitnessService.setThreshold(2);
  for (const w of c.w) {
    await as(w);
    const { invitations } = await WitnessService.invitations();
    const mine = invitations.find((i) => i.owner.email === c.owner);
    expect(mine).toBeDefined();
    await WitnessService.accept(mine!.id);
  }
  await as(c.owner);
  return c;
}

/** Owner uploads two files into a new folder and returns them. */
async function seedFolder(tag: string) {
  const folder = await FileService.createFolder(`estate-${tag}`);
  const files = [
    fileOf(`estate-deed-${unique}-${tag}.pdf`, 70_000),
    fileOf(`estate-will-${unique}-${tag}.pdf`, 130_000),
  ];
  for (const f of files) await FileService.uploadFile(f, folder.id);
  return { folder, files };
}

async function recipientOf(c: Cast) {
  const contact = await WitnessService.lookupContact(c.recipient);
  return { userId: contact.id, publicKey: contact.publicKey };
}

async function expectReceived(c: Cast, files: File[], by: 'timer' | 'quorum') {
  await as(c.recipient);
  const listed = await FileService.listSharedWithMe();
  expect(listed.map((f) => f.name).sort()).toEqual(files.map((f) => f.name).sort());
  for (const row of listed) expect(row.handoff?.by).toBe(by);
  const metadata = await ApiService.getSharedWithMe();
  for (const file of files) {
    const meta = metadata.find((m) => listed.find((l) => l.id === m.id)?.name === file.name)!;
    const got = await FileService.downloadSharedFile(meta);
    expect(Buffer.compare(await bytesOf(got.blob), await bytesOf(file))).toBe(0);
  }
}

const noNames = (mails: Mail[], files: File[]) => {
  for (const m of mails) for (const f of files) {
    expect(m.subject).not.toContain(f.name);
    expect(m.text).not.toContain(f.name);
    expect(m.text).not.toContain('estate-deed');
    expect(m.text).not.toContain('estate-will');
  }
};

beforeAll(async () => {
  const res = await fetch(`${API}/health`);
  if (!res.ok) throw new Error(`API at ${API} is not healthy: ${res.status}`);
  await fetch(`${API}/_test/mail`, { method: 'DELETE' });
});

afterAll(async () => {
  await setClock(null).catch(() => undefined);
  await AuthService.logout().catch(() => undefined);
});

describe('handoff: timer', () => {
  it('releases a folder of two files to the recipient after the owner goes quiet', async () => {
    const c = await cast('timer');
    const { folder, files } = await seedFolder('timer');
    const recipient = await recipientOf(c);

    const rule = await RulesService.createRule({ target: { folderId: folder.id }, recipients: [recipient], periodDays: 30 });
    expect(rule.items).toHaveLength(2);

    // The recipient sees the rule exists but holds no key material yet.
    await as(c.recipient);
    const mine = await RulesService.forMe();
    expect(mine).toHaveLength(1);
    expect(mine[0]!.state).toBe('active');
    expect(mine[0]).not.toHaveProperty('wrappedReleaseKey');
    expect(mine[0]).not.toHaveProperty('items');
    expect(mine[0]).not.toHaveProperty('voteShares');
    expect(await FileService.listSharedWithMe()).toHaveLength(0);

    // The job walks the period: 75 %, 90 %, 95 %, then the release.
    const start = Date.now();
    try {
      for (const days of [23, 28, 29.2, 31]) {
        await setClock(new Date(start + days * DAY));
        expect((await post('/_test/handoff-tick')).status).toBe(200);
      }
    } finally {
      await setClock(null);
    }

    const ownerMail = await mailTo(c.owner);
    const subjects = ownerMail.map((m) => m.subject);
    expect(subjects.some((s) => /^A handoff rule releases on /.test(s))).toBe(true);
    expect(subjects.some((s) => /^A handoff rule releases in \d+ days?$/.test(s))).toBe(true);
    expect(subjects.some((s) => /^Final notice: /.test(s))).toBe(true);
    expect(subjects).toContain('A handoff rule has released');
    noNames(ownerMail, files);
    noNames(await mailTo(c.recipient), files);

    await expectReceived(c, files, 'timer');
    const items = await RulesService.releasedItems();
    expect(items.map((i) => i.name).sort()).toEqual(files.map((f) => f.name).sort());
  });
});

describe('handoff: quorum', () => {
  it('releases when two of three witnesses vote, and refuses the third afterwards', async () => {
    const c = await cast('quorum');
    const { folder, files } = await seedFolder('quorum');
    const recipient = await recipientOf(c);
    await RulesService.createRule({ target: { folderId: folder.id }, recipients: [recipient], periodDays: 30 });

    await as(c.w[0]!);
    const request = await ReleaseService.openRequest(c.ids[c.owner]!);
    expect(request.requiredVotes).toBe(2);
    const ownerSubjects = (await mailTo(c.owner)).map((m) => m.subject);
    expect(ownerSubjects).toContain('A witness asked to release your items');
    for (const w of [c.w[1]!, c.w[2]!]) {
      expect((await mailTo(w)).some((m) => /asked to release .*'s items/.test(m.subject))).toBe(true);
    }

    const first = await ReleaseService.vote(request);
    expect(first.state).toBe('open');

    await as(c.w[1]!);
    const open = (await ReleaseService.listRequests()).find((r) => r.id === request.id)!;
    const second = await ReleaseService.vote(open);
    expect(second.state).not.toBe('open');

    const ownerMail = await mailTo(c.owner);
    expect(ownerMail.map((m) => m.subject)).toContain('Your witnesses released your items');
    noNames(ownerMail, files);

    await expectReceived(c, files, 'quorum');

    // The third witness comes too late: the request is closed.
    await as(c.w[2]!);
    const stale = (await ReleaseService.listRequests()).find((r) => r.id === request.id);
    await expect(ReleaseService.vote(stale ?? open)).rejects.toMatchObject({ statusCode: 409 });

    await as(c.owner);
    const rules = await RulesService.listRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.state).toBe('released_quorum');
  });
});

describe('handoff: cancel on owner sign-in', () => {
  it('cancels an open request when the owner signs in and tells the witnesses', async () => {
    const c = await cast('cancel');
    const { folder } = await seedFolder('cancel');
    const recipient = await recipientOf(c);
    await RulesService.createRule({ target: { folderId: folder.id }, recipients: [recipient], periodDays: 30 });

    await as(c.w[0]!);
    const request = await ReleaseService.openRequest(c.ids[c.owner]!);
    expect(request.state).toBe('open');

    await as(c.owner);

    for (const w of [c.w[1]!, c.w[2]!]) {
      const mails = await mailTo(w);
      expect(mails.some((m) => / signed in, so the request is cancelled$/.test(m.subject))).toBe(true);
      expect(mails.every((m) => !m.text.includes('estate-'))).toBe(true);
    }
    await as(c.w[1]!);
    const seen = (await ReleaseService.listRequests()).find((r) => r.id === request.id);
    expect(seen?.state).toBe('cancelled');
    await expect(ApiService.voteOnReleaseRequest(request.id, [])).rejects.toMatchObject({ statusCode: 409 });

    await as(c.owner);
    const rules = await RulesService.listRules();
    expect(rules.map((r) => r.state)).toEqual(['active']);
  });
});

describe('handoff: repair after the witness set changes', () => {
  it('re-splits at unlock so the remaining two witnesses still release', async () => {
    const c = await cast('repair');
    const { folder, files } = await seedFolder('repair');
    const recipient = await recipientOf(c);
    await RulesService.createRule({ target: { folderId: folder.id }, recipients: [recipient], periodDays: 30 });

    // Removing a witness drops the set to 2 with threshold 2; the shares no longer match it.
    const set = await WitnessService.listWitnesses();
    const entry = set.witnesses.find((w) => w.user.email === c.w[2]);
    expect(entry).toBeDefined();
    await WitnessService.remove(entry!.id);
    expect((await RulesService.listRules())[0]!.sharesStale).toBe(true);

    const repair = await RulesService.repairAtUnlock();
    expect(repair.failed).toBe(0);
    expect(repair.repaired).toBe(1);
    expect((await RulesService.listRules())[0]!.sharesStale).toBe(false);

    await as(c.w[0]!);
    const request = await ReleaseService.openRequest(c.ids[c.owner]!);
    await ReleaseService.vote(request);
    await as(c.w[1]!);
    const open = (await ReleaseService.listRequests()).find((r) => r.id === request.id)!;
    expect((await ReleaseService.vote(open)).state).not.toBe('open');

    await expectReceived(c, files, 'quorum');
  });
});
