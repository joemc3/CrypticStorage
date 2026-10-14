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

/** Font hosts are not part of what the smoke tests; a blocked font must not fail it. */
const IGNORED_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

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
      if (IGNORED_HOSTS.some((h) => url.includes(h) || msg.text().includes(h))) return;
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

const vaultUser = { ...fx.user, ...fx.vault };

/** Every request the signed-in screens make. Anything else answers 404, which the console check catches. */
async function mockVaultApi(page: Page) {
  await page.route('**/api/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*?\/api/, '');
    const method = route.request().method();
    if (method === 'GET') {
      if (path === '/users/profile') return route.fulfill(ok(fx.user));
      if (path === '/storage/stats') return route.fulfill(ok(fx.stats));
      if (path === '/files') return route.fulfill(ok(fx.files[url.searchParams.get('folderId') ?? 'root'] ?? []));
      if (path === '/folders') return route.fulfill(ok(url.searchParams.get('parentId') ? [] : fx.folders));
      if (path.startsWith('/folders/')) return route.fulfill(ok(fx.folders.find((f: { id: string }) => path.endsWith(f.id))));
      if (path === '/shares/with-me') return route.fulfill(ok(fx.sharedWithMe));
      if (/^\/files\/[^/]+\/(shares|links)$/.test(path)) return route.fulfill(ok([]));
      const one = path.match(/^\/files\/([^/]+)$/);
      if (one) return route.fulfill(ok(Object.values<{ id: string }[]>(fx.files).flat().find((f) => f.id === one[1])));
    }
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
  }
});
