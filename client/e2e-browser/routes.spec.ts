import { test as base, expect, type Page, type Route, type TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURE_LINK_KEY_SEED, FIXTURE_PASSWORD } from './fixture-constants.ts';

/**
 * Loads every route, saves a screenshot of it and checks two things on each: nothing scrolls
 * sideways, and the console stays clean. Names: screenshots/<route>-<width>-<scheme>.png.
 * Every API request is mocked (fixtures/vault.json, made by make-fixture.mts), so no server runs.
 */

const here = dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(readFileSync(join(here, 'fixtures', 'vault.json'), 'utf8'));
const shotsDir = join(here, 'screenshots');

if (fx.passwordSha256 !== createHash('sha256').update(FIXTURE_PASSWORD).digest('hex')) {
  throw new Error('fixtures/vault.json does not match fixture-constants.ts. Re-run: node e2e-browser/make-fixture.mts');
}
const linkFragment = createHash('sha256').update(FIXTURE_LINK_KEY_SEED).digest().toString('base64url');

// ---------------------------------------------------------------------------
// Console and overflow checks
// ---------------------------------------------------------------------------

interface Watch {
  /** Allow the "Failed to load resource" line for a request the test deliberately fails. */
  allowFailure(urlPart: string): void;
}

const test = base.extend<{ watch: Watch }>({
  watch: async ({ page }, use) => {
    const problems: string[] = [];
    const allowed: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const url = msg.location().url ?? '';
      if (msg.text().startsWith('Failed to load resource') && allowed.some((a) => url.includes(a))) return;
      problems.push(`console: ${msg.text()} ${url}`);
    });
    page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
    await use({ allowFailure: (part) => allowed.push(part) });
    expect(problems, 'console errors').toEqual([]);
  },
});

function names(info: TestInfo) {
  const { width, scheme } = info.project.metadata as { width: number; scheme: string };
  return { width, scheme };
}

/** Screenshot the whole page and assert it does not scroll sideways. */
async function shot(page: Page, info: TestInfo, route: string) {
  // Let page fades, sheet slides and font swaps finish, so the picture shows the settled screen.
  await page.evaluate(() => document.fonts.ready).catch(() => undefined);
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  await page.waitForTimeout(350);
  const { width, scheme } = names(info);
  const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: join(shotsDir, `${route}-${width}-${scheme}.png`), fullPage: true });
  expect(overflow.scroll, `${route}: page is wider than the window`).toBeLessThanOrEqual(overflow.inner);
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const ok = (data: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
const fail = (status: number, message: string) => ({ status, contentType: 'application/json', body: JSON.stringify({ success: false, message }) });

const witnessUser = (id: string, email: string, fp: string) => ({ id, email, displayName: null, publicKey: 'fixture', fingerprint: fp.repeat(64 / fp.length) });
const witnessSet = {
  threshold: 2,
  minN: 2,
  maxN: 7,
  witnesses: [
    { id: 'w1', status: 'accepted', invitedAt: '2026-09-04T00:00:00.000Z', respondedAt: '2026-09-04T00:00:00.000Z', user: witnessUser('u-w1', 'priya.n@outlook.com', '91c27f3a') },
    { id: 'w2', status: 'accepted', invitedAt: '2026-09-05T00:00:00.000Z', respondedAt: '2026-09-05T00:00:00.000Z', user: witnessUser('u-w2', 'tom.becker@icloud.com', 'e0f73c61') },
    { id: 'w3', status: 'invited', invitedAt: '2026-10-12T00:00:00.000Z', respondedAt: null, user: witnessUser('u-w3', 'lena.ortiz@gmail.com', 'd04c7718') },
  ],
};
const witnessInvitations = {
  invitations: [{ id: 'inv1', owner: { id: 'o1', email: 'r.okafor@gmail.com', displayName: null }, invitedAt: '2026-10-13T12:00:00.000Z' }],
  serving: [] as unknown[],
};

// Quorum (slice C): the owners I serve, the release requests I can see, and the owner's own request history.
const annaPerson = { id: 'o-anna', email: 'anna.lind@gmail.com', displayName: null };
const openRequest = {
  id: 'req-1', owner: annaPerson, openedBy: { id: 'u-jpark', email: 'j.park@outlook.com', displayName: null }, state: 'open', requiredVotes: 2,
  openedAt: '2026-10-13T14:02:00.000Z', myVote: false,
  votes: [{ witnessUserId: 'u-jpark', displayName: null, email: 'j.park@outlook.com', votedAt: '2026-10-13T14:02:00.000Z' }],
  rules: [{ ruleId: 'r-a', sharesStale: false, state: 'active', recipients: [] }], myShares: [],
};
const quorum: { serving: unknown[]; requests: unknown[]; mine: unknown[] } = { serving: [], requests: [], mine: [] };
function resetQuorum() {
  quorum.serving = [];
  quorum.requests = [];
  quorum.mine = [];
}

const vaultUser = { ...fx.user, ...fx.vault };

// Handoff rules: one active rule on the Estate folder, one released by timer on the deed, and one notice for me.
const rulePeople = [
  { userId: 'u-daniel', email: 'daniel.hale@gmail.com', displayName: null, notifiedAt: null },
  { userId: 'u-sam', email: 'sam.hale@proton.me', displayName: null, notifiedAt: null },
];
const handoffRules = [
  {
    id: 'rule-estate', folderId: 'folder-estate', periodDays: 365, state: 'active', createdAt: '2026-10-03T12:00:00.000Z',
    nextCheckInAt: '2027-10-14T12:00:00.000Z', warningAt: '2027-07-15T12:00:00.000Z', sharesStale: false, coverageGaps: 0, recipients: rulePeople,
  },
  {
    id: 'rule-deed', fileId: 'file-deed', periodDays: 90, state: 'released_timer', createdAt: '2026-05-01T12:00:00.000Z',
    nextCheckInAt: null, warningAt: null, sharesStale: false, coverageGaps: 0, recipients: rulePeople.slice(0, 1), releasedAt: '2026-10-10T12:00:00.000Z',
  },
];
const handoffForMe = [{ id: 'notice-1', owner: { id: 'o-tom', email: 'tom.becker@icloud.com', displayName: null }, state: 'active', createdAt: '2026-10-12T12:00:00.000Z' }];
const recipientSpki: string = fx.vault.publicKey;
const recipientLookup = {
  id: 'u-daniel',
  email: 'daniel.hale@gmail.com',
  publicKey: recipientSpki,
  fingerprint: createHash('sha256').update(Buffer.from(recipientSpki, 'base64')).digest('hex'),
  trust: null,
};

/** Every request the signed-in screens make. Anything else answers 404, which the console check catches. */
async function mockVaultApi(page: Page) {
  resetQuorum();
  await page.route('**/api/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*?\/api/, '');
    const method = route.request().method();
    if (method === 'GET') {
      if (path === '/users/profile') return route.fulfill(ok(fx.user));
      if (path === '/storage/stats') return route.fulfill(ok(fx.stats));
      if (path === '/files') {
        const rows = fx.files[url.searchParams.get('folderId') ?? 'root'] ?? [];
        return route.fulfill(ok(rows.map((f: { id: string }) => (f.id === 'file-deed' ? { ...f, shareCount: 1 } : f))));
      }
      if (path === '/handoff/rules') return route.fulfill(ok(handoffRules));
      if (path === '/handoff/for-me') return route.fulfill(ok(handoffForMe));
      if (path === '/users/public-key') return route.fulfill(ok(recipientLookup));
      if (path === '/folders') return route.fulfill(ok(url.searchParams.get('parentId') ? [] : fx.folders));
      if (path.startsWith('/folders/')) {
        const folder = fx.folders.find((f: { id: string }) => path.endsWith(f.id));
        return route.fulfill(ok(folder?.id === 'folder-estate' ? { ...folder, ruleIds: ['rule-estate'] } : folder));
      }
      if (path === '/witnesses') return route.fulfill(ok(witnessSet));
      if (path === '/witnesses/invitations') return route.fulfill(ok({ ...witnessInvitations, serving: quorum.serving }));
      if (path === '/handoff/requests') return route.fulfill(ok(quorum.requests));
      if (path === '/handoff/requests/mine') return route.fulfill(ok(quorum.mine));
      if (path === '/shares/with-me') return route.fulfill(ok(fx.sharedWithMe));
      if (/^\/files\/[^/]+\/(shares|links)$/.test(path)) return route.fulfill(ok([]));
      const one = path.match(/^\/files\/([^/]+)$/);
      if (one) return route.fulfill(ok(Object.values<{ id: string }[]>(fx.files).flat().find((f) => f.id === one[1])));
    }
    if (method === 'POST' && path === '/handoff/requests') return route.fulfill(ok({ ...openRequest, openedBy: { id: 'u-me', email: fx.user.email, displayName: null }, votes: [] }));
    if (method === 'POST' && /^\/contacts\/[^/]+\/seen$/.test(path)) return route.fulfill(ok({ fingerprint: recipientLookup.fingerprint, verifiedInPerson: false, firstSeenAt: '', lastSeenAt: '' }));
    if (method === 'POST' && path === '/auth/refresh') return route.fulfill(ok({ accessToken: 'fixture-access', refreshToken: 'fixture-refresh', expiresIn: 900 }));
    return route.fulfill(fail(404, `Unmocked ${method} ${path}`));
  });
}

/** A saved, locked session: what a reload leaves behind. */
async function seedSession(page: Page) {
  await page.addInitScript(
    ([tokens, user, vault]) => {
      localStorage.setItem('cs.tokens', JSON.stringify(tokens));
      localStorage.setItem('cs.user', JSON.stringify(user));
      localStorage.setItem('cs.vault', JSON.stringify(vault));
    },
    [fx.tokens, fx.user, fx.vault] as const
  );
}

// ---------------------------------------------------------------------------
// Public routes
// ---------------------------------------------------------------------------

test.describe('public routes', () => {
  test('landing', async ({ page, watch: _ }, info) => {
    await page.goto('/');
    await expect(page.getByRole('heading').first()).toBeVisible();
    await shot(page, info, 'home');
  });

  test('sign in, then the two-factor step', async ({ page, watch: _ }, info) => {
    await page.route('**/api/auth/login', (route) =>
      route.fulfill(ok({ user: vaultUser, tokens: { accessToken: 'challenge', refreshToken: 'challenge', expiresIn: 300 }, requiresTwoFactor: true }))
    );
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await shot(page, info, 'login');

    await page.getByLabel('Email').fill(fx.user.email);
    await page.getByLabel('Password', { exact: true }).fill(FIXTURE_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Two-factor code' })).toBeVisible();
    await shot(page, info, 'login-two-factor');
  });

  test('create account: four contract screens, the form, check your email', async ({ page, watch: _ }, info) => {
    await page.route('**/api/auth/register', (route) => route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, data: { verificationRequired: true } }) }));
    await page.goto('/register');
    for (const n of [1, 2, 3]) {
      await shot(page, info, `register-${n}`);
      await page.getByRole('button', { name: 'I understand' }).click();
    }
    await page.getByLabel('Confirmation phrase').fill('I understand there is no way back');
    await shot(page, info, 'register-4');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await shot(page, info, 'register-form');

    await page.getByLabel('Email', { exact: true }).fill('new.person@example.com');
    await page.getByLabel('Password', { exact: true }).fill('lantern-orchard-9');
    await page.getByLabel('Password again').fill('lantern-orchard-9');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible({ timeout: 30_000 });
    await shot(page, info, 'register-check-email');
  });

  test('verify the email link: success and failure', async ({ page, watch }, info) => {
    await page.route('**/api/auth/verify-email', (route) => route.fulfill(ok({ email: 'm.hale@fastmail.com' })));
    await page.goto('/verify/some-token');
    await expect(page.getByText('m.hale@fastmail.com').first()).toBeVisible();
    await shot(page, info, 'verify-ok');

    watch.allowFailure('/api/auth/verify-email');
    await page.unroute('**/api/auth/verify-email');
    await page.route('**/api/auth/verify-email', (route) => route.fulfill(fail(400, 'This link has expired or was already used.')));
    await page.goto('/verify/some-token');
    await expect(page.getByRole('heading').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    await shot(page, info, 'verify-failed');
  });

  test('shared link: open, password required, expired', async ({ page, watch }, info) => {
    const url = `/s/some-token#${linkFragment}`;
    await page.route('**/api/shares/public/some-token', (route) => route.fulfill(ok(fx.publicShare.info)));
    await page.goto(url);
    await expect(page.getByText('Letter of wishes.pdf').first()).toBeVisible();
    await shot(page, info, 'shared-link');

    await page.unroute('**/api/shares/public/some-token');
    await page.route('**/api/shares/public/some-token', (route) => route.fulfill(ok({ ...fx.publicShare.info, passwordProtected: true })));
    await page.reload();
    await expect(page.getByLabel('Password')).toBeVisible();
    await shot(page, info, 'shared-link-password');

    watch.allowFailure('/api/shares/public/some-token');
    await page.unroute('**/api/shares/public/some-token');
    await page.route('**/api/shares/public/some-token', (route) => route.fulfill(fail(410, 'This link has expired')));
    await page.reload();
    await expect(page.getByRole('heading', { name: 'This link has expired.' })).toBeVisible();
    await shot(page, info, 'shared-link-expired');
  });

  test('check-in link: clock reset, and an invalid link', async ({ page, watch }, info) => {
    await page.route('**/api/auth/check-in', (route) => route.fulfill(ok({ ok: true })));
    await page.goto('/check-in/some-token');
    await expect(page.getByRole('heading', { name: 'Your clock is reset.' })).toBeVisible();
    await expect(page.getByText('Nothing else is needed.')).toBeVisible();
    await shot(page, info, 'check-in-ok');

    watch.allowFailure('/check-in');
    await page.unroute('**/api/auth/check-in');
    await page.route('**/api/auth/check-in', (route) => route.fulfill(fail(400, 'invalid')));
    await page.goto('/check-in/some-token');
    await expect(page.getByRole('heading', { name: 'This link is invalid or has expired.' })).toBeVisible();
    await shot(page, info, 'check-in-failed');
  });

  test('not found', async ({ page, watch: _ }, info) => {
    await page.goto('/404');
    await expect(page.getByRole('heading').first()).toBeVisible();
    await shot(page, info, '404');
  });
});

// ---------------------------------------------------------------------------
// Inside the safe
// ---------------------------------------------------------------------------

test('inside the safe: locked, dashboard, files, folder, shared, share dialog, settings', async ({ page, watch: _ }, info) => {
  await seedSession(page);
  await mockVaultApi(page);
  const phone = names(info).width < 720;
  const nav = page.getByRole('navigation', { name: 'Main' });
  const go = async (name: string) => nav.getByRole('link', { name, exact: true }).click();

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Your safe is locked.' })).toBeVisible();
  await shot(page, info, 'locked');

  await page.getByLabel('Password').fill(FIXTURE_PASSWORD);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(nav).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('House deed scan.jpg').first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  await shot(page, info, 'dashboard');

  await go('Files');
  await expect(page.getByText('Estate').first()).toBeVisible();
  await expect(page.getByText('House deed scan.jpg').first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  await shot(page, info, 'files');

  await page.getByText('Estate', { exact: true }).first().click();
  await expect(page.getByText('Property tax 2025.pdf').first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  await shot(page, info, 'files-folder');

  await go('Files');
  await expect(page.getByText('House deed scan.jpg').first()).toBeVisible();
  await page.getByRole('button', { name: 'Actions for House deed scan.jpg' }).click();
  await page.getByRole('menuitem', { name: 'Share' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Share' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await shot(page, info, 'share-dialog');
  await page.keyboard.press('Escape');
  await expect(dialog.getByRole('heading', { name: 'Share' })).toBeHidden();

  await go('Shared');
  await expect(page.getByText('Mum’s recipe cards.pdf').first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  await shot(page, info, 'shared');

  await go('Settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await shot(page, info, 'settings');

  if (phone) {
    await page.getByRole('button', { name: /^Key fingerprint/ }).click();
    await expect(page.getByRole('group', { name: /^Key fingerprint/ })).toBeVisible();
    await shot(page, info, 'settings-fingerprint');
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: /^Witnesses/ }).click();
  }
  await expect(page.getByText('Any 2 of 3 can release what you marked. 2 accepted, 1 pending.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Manage witnesses' }).click();
  await expect(page.getByRole('heading', { name: 'Witnesses' })).toBeVisible();
  await expect(page.getByText('lena.ortiz@gmail.com')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await shot(page, info, 'witnesses');

  await page.getByRole('button', { name: 'Remove lena.ortiz@gmail.com' }).click();
  await expect(page.getByText('Will be removed')).toBeVisible();
  await shot(page, info, 'witnesses-staged');
  await page.getByRole('button', { name: 'Keep lena.ortiz@gmail.com' }).click();
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Review and save' }).click();
  await expect(page.getByRole('heading', { name: 'Any 3 of these 3 people, together, can release everything you have marked for handoff.' })).toBeVisible();
  await shot(page, info, 'witnesses-confirm');

  // The invitation arrives from an email link; move there inside the unlocked session, as a reload would lock it.
  await page.evaluate(() => {
    window.history.pushState({}, '', '/witness/inv1');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { name: 'r.okafor@gmail.com is asking you to be a witness.' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await shot(page, info, 'witness-invite');
});

// ---------------------------------------------------------------------------
// Handoff rules
// ---------------------------------------------------------------------------

test('handoff rules: dashboard, rule detail, revoke, sheet, confirmation, folder banner, notice', async ({ page, watch: _ }, info) => {
  await seedSession(page);
  await mockVaultApi(page);
  const nav = page.getByRole('navigation', { name: 'Main' });

  await page.goto('/dashboard');
  await page.getByLabel('Password').fill(FIXTURE_PASSWORD);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(nav).toBeVisible({ timeout: 30_000 });

  const forYou = page.getByRole('region', { name: 'For you' });
  await expect(forYou.getByText('tom.becker@icloud.com has set something aside for you.')).toBeVisible();
  const rulesList = page.getByRole('region', { name: 'Handoff rules' });
  await expect(rulesList.getByText('Estate', { exact: true })).toBeVisible();
  await expect(rulesList.getByText('Released by timer')).toBeVisible();
  await expect(page.getByRole('link', { name: /Witnesses: 2 of 3, 2 accepted/ })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await shot(page, info, 'dashboard-handoff');

  await rulesList.getByRole('button', { name: /Estate/ }).click();
  const detail = page.getByRole('dialog');
  await expect(detail.getByText('1 year without a sign-in')).toBeVisible();
  await expect(detail.getByText('Any 2 of 3')).toBeVisible();
  await shot(page, info, 'rule-detail');

  await detail.getByRole('button', { name: 'Revoke this rule' }).click();
  await expect(page.getByRole('heading', { name: 'daniel.hale@gmail.com and sam.hale@proton.me will no longer receive Estate.' })).toBeVisible();
  await shot(page, info, 'rule-revoke');
  await page.getByRole('button', { name: 'Keep the rule' }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Revoke this rule' })).toBeVisible();
  await page.keyboard.press('Escape');

  await nav.getByRole('link', { name: 'Files', exact: true }).click();
  await expect(page.getByText('House deed scan.jpg').first()).toBeVisible();
  const rows = page.locator('ul[role="list"]');
  await expect(rows.getByText('Handoff', { exact: true })).toHaveCount(1); // the Estate row only; its children do not repeat it
  await expect(rows.getByText('Shared', { exact: true })).toHaveCount(1);
  await page.waitForLoadState('networkidle');
  await shot(page, info, 'files-markers');

  await page.getByRole('button', { name: 'Actions for House deed scan.jpg' }).click();
  await page.getByRole('menuitem', { name: 'Hand off…' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('Who receives it')).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Review' })).toBeDisabled();
  await shot(page, info, 'rule-sheet');
  await sheet.getByLabel('Add a recipient by email').fill('daniel.hale@gmail.com');
  await sheet.getByRole('button', { name: 'Check key' }).click();
  await sheet.getByRole('button', { name: 'Add recipient' }).click();
  await sheet.getByRole('button', { name: '1 year' }).click();
  await expect(sheet.getByText(/any 2 of your 2 witnesses agree/)).toBeVisible();
  await shot(page, info, 'rule-sheet-filled');
  await sheet.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByRole('heading', { name: /^On \d+ \w+ \d{4}, or sooner if your witnesses agree, daniel\.hale@gmail\.com will receive House deed scan\.jpg\.$/ })).toBeVisible();
  await shot(page, info, 'rule-confirm');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByText('Estate', { exact: true }).first().click();
  await expect(page.getByText('Property tax 2025.pdf').first()).toBeVisible();
  await expect(page.getByText(/^Handed off to daniel\.hale@gmail\.com and sam\.hale@proton\.me on 14 Oct 2027 · Active$/)).toBeVisible();
  await page.waitForLoadState('networkidle');
  await shot(page, info, 'files-folder-handoff');

  // The notice is reached from the For-you row; move there inside the unlocked session, as a reload would lock it.
  await page.evaluate(() => {
    window.history.pushState({}, '', '/notice/notice-1');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { name: 'tom.becker@icloud.com has set something aside for you.' })).toBeVisible();
  await expect(page.getByText('If you do not know this person, you can ignore this.')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await shot(page, info, 'notice');
});

// ---------------------------------------------------------------------------
// Quorum
// ---------------------------------------------------------------------------

test('quorum, witness side: no request, an open request, both one-fact screens', async ({ page, watch: _ }, info) => {
  await seedSession(page);
  await mockVaultApi(page);
  quorum.serving = [{ id: 's1', owner: annaPerson, respondedAt: '2026-09-04T00:00:00.000Z' }];
  await page.goto('/dashboard');
  await page.getByLabel('Password').fill(FIXTURE_PASSWORD);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible({ timeout: 30_000 });

  const section = page.getByRole('region', { name: 'You are a witness for' });
  await expect(section.getByText('No release request is open.')).toBeVisible();
  await expect(section.getByText('You cannot read their items. You can, with others, release them to the people they chose.')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await shot(page, info, 'witness-for-none');

  await section.getByRole('button', { name: 'Open a release request' }).click();
  await expect(page.getByText('Witness · open a release request')).toBeVisible();
  await expect(page.getByRole('heading', { name: "You are asking to release anna.lind@gmail.com's items now." })).toBeVisible();
  await expect(page.getByText('anna.lind@gmail.com and the other witnesses will be told. If anna.lind@gmail.com signs in, the request is cancelled.')).toBeVisible();
  await shot(page, info, 'release-open');
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByText('Witness · open a release request')).toBeHidden();

  // The request now exists: the dashboard reloads it from the list.
  quorum.requests = [openRequest];
  await page.reload();
  await page.getByLabel('Password').fill(FIXTURE_PASSWORD);
  await page.getByRole('button', { name: 'Unlock' }).click();
  const open = page.getByRole('region', { name: 'You are a witness for' });
  await expect(open.getByText(/^Opened by j\.park@outlook\.com · \d+ Oct, \d\d:\d\d$/)).toBeVisible();
  await expect(open.getByText('1 of 2 votes')).toBeVisible();
  await expect(open.getByText('If anna.lind@gmail.com signs in, the request is cancelled.')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await shot(page, info, 'witness-for-open');

  await open.getByRole('button', { name: 'Add your vote' }).click();
  await expect(page.getByText('Witness · vote 2 of 2')).toBeVisible();
  await expect(page.getByRole('heading', { name: "Add your vote to release anna.lind@gmail.com's items." })).toBeVisible();
  await expect(page.getByText("Once 2 votes are in, the items go to the people anna.lind@gmail.com chose. This cannot be undone.")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add my vote' })).toBeVisible();
  await shot(page, info, 'release-vote');
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByText('Witness · vote 2 of 2')).toBeHidden();
});

test('quorum, owner side: the release notice after a sign-in cancelled a request', async ({ page, watch: _ }, info) => {
  await seedSession(page);
  await mockVaultApi(page);
  const closedAt = new Date();
  quorum.mine = [
    {
      id: 'req-1', state: 'cancelled', reason: 'sign_in', requiredVotes: 2,
      openedAt: new Date(closedAt.getTime() - 3_600_000).toISOString(), closedAt: closedAt.toISOString(),
      openedBy: { id: 'o-tom', email: 'tom.becker@icloud.com', displayName: null },
      votes: [{ witnessUserId: 'o-tom', displayName: null, email: 'tom.becker@icloud.com', votedAt: new Date(closedAt.getTime() - 1_800_000).toISOString() }],
      releasedRuleIds: [],
    },
  ];
  await page.goto('/dashboard');
  await page.getByLabel('Password').fill(FIXTURE_PASSWORD);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible({ timeout: 30_000 });

  const notice = page.getByRole('status', { name: 'Release notice' });
  await expect(notice.getByText('Your sign-in cancelled a release request.')).toBeVisible();
  await expect(notice.getByText('tom.becker@icloud.com opened a release request', { exact: false })).toBeVisible();
  await expect(notice.getByText('tom.becker@icloud.com voted', { exact: false })).toBeVisible();
  await expect(notice.getByText(/^Your sign-in cancelled a release request · .+\. Your witnesses have been told\. Nothing was released\.$/)).toBeVisible();
  await page.waitForLoadState('networkidle');
  await shot(page, info, 'release-notice');

  await notice.getByRole('button', { name: 'Dismiss' }).click();
  await expect(notice).toBeHidden();
});
