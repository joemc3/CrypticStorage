import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ApiService from '../services/api.service';
import AuthService from '../services/auth.service';
import { useAuthStore } from '../stores/auth.store';
import { useUIStore } from '../stores/ui.store';
import DashboardPage from './DashboardPage';

const rules = vi.hoisted(() => ({
  listRules: vi.fn(),
  forMe: vi.fn(),
  witnessSummary: vi.fn(),
  nameRuleTargets: vi.fn(),
  repairAtUnlock: vi.fn(),
}));
vi.mock('../services/rules.service', async () => ({
  ...(await vi.importActual<typeof import('../services/rules.service')>('../services/rules.service')),
  ...rules,
}));

const release = vi.hoisted(() => ({ witnessCards: vi.fn() }));
vi.mock('../services/release.service', async () => ({
  ...(await vi.importActual<typeof import('../services/release.service')>('../services/release.service')),
  ...release,
}));

vi.mock('../layouts/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../hooks/useFiles', () => ({
  useFiles: () => ({
    files: [
      { id: 'f1', name: 'House deed scan.jpg', mimeType: 'image/jpeg', size: 2048, createdAt: '2026-10-10T09:00:00.000Z' },
    ],
    isLoading: false,
    loadFiles: vi.fn().mockResolvedValue(undefined),
    sharedWithMe: [],
    loadSharedWithMe: vi.fn().mockResolvedValue(undefined),
    downloadFile: vi.fn(),
  }),
}));

const user = {
  id: 'u1',
  email: 'a@b.co',
  displayName: null,
  lockAfterMinutes: 5,
  emailVerifiedAt: '2026-10-14T00:00:00.000Z',
  createdAt: '2026-10-14T00:00:00.000Z',
  storageUsed: 0,
  storageLimit: 1073741824,
} as never;

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rules.listRules.mockResolvedValue([]);
    rules.forMe.mockResolvedValue([]);
    rules.witnessSummary.mockResolvedValue({ threshold: 2, accepted: 2, total: 3, acceptedUserIds: [] });
    rules.nameRuleTargets.mockResolvedValue(new Map());
    rules.repairAtUnlock.mockResolvedValue({ repaired: 0, failed: 0 });
    release.witnessCards.mockResolvedValue([]);
    vi.spyOn(ApiService, 'listMyReleaseRequests').mockResolvedValue([]);
    sessionStorage.clear();
    useAuthStore.setState({ user, status: 'unlocked' });
    vi.spyOn(AuthService, 'refreshProfile').mockResolvedValue(user);
    vi.spyOn(ApiService, 'getStorageStats').mockResolvedValue({
      used: 40000000,
      limit: 1073741824,
      fileCount: 10,
      folderCount: 4,
    });
  });

  it('shows storage used, the item count and recent items, and no placeholders', async () => {
    const { container } = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DashboardPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('38.15 MB')).toBeInTheDocument());
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('in 4 folders')).toBeInTheDocument();
    expect(screen.getByText('House deed scan.jpg')).toBeInTheDocument();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/coming soon/i);
    expect(text).not.toMatch(/placeholder/i);
  });

  const renderPage = () =>
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DashboardPage />
      </MemoryRouter>
    );

  const rule = (over: Record<string, unknown>) => ({
    id: 'r1', folderId: 'folder-1', periodDays: 365, state: 'active', createdAt: '2026-10-03T12:00:00.000Z', nextCheckInAt: '2027-10-14T12:00:00.000Z', warningAt: null,
    sharesStale: false, coverageGaps: 0,
    recipients: [{ userId: 'a', email: 'daniel.hale@gmail.com', displayName: null, notifiedAt: null }, { userId: 'b', email: 'sam.hale@proton.me', displayName: null, notifiedAt: null }],
    ...over,
  });

  it('lists the rules with item name, recipients, next date and a state badge, and counts the active ones', async () => {
    rules.listRules.mockResolvedValue([
      rule({}),
      rule({ id: 'r2', folderId: undefined, fileId: 'file-1', state: 'released_timer', nextCheckInAt: null, releasedAt: '2026-10-10T12:00:00.000Z' }),
      rule({ id: 'r3', state: 'revoked', nextCheckInAt: null }),
    ]);
    rules.nameRuleTargets.mockResolvedValue(new Map([['r1', 'Estate'], ['r2', 'Letter of wishes.pdf']]));
    renderPage();
    const section = await screen.findByRole('region', { name: 'Handoff rules' });
    expect(await within(section).findByText('Estate')).toBeInTheDocument();
    expect(within(section).getByText(/To daniel\.hale@gmail\.com and sam\.hale@proton\.me · Next check-in 14 Oct 2027/)).toBeInTheDocument();
    expect(within(section).getByText('Active')).toBeInTheDocument();
    expect(within(section).getByText('Letter of wishes.pdf')).toBeInTheDocument();
    expect(within(section).getByText('Released by timer')).toBeInTheDocument();
    expect(within(section).getAllByRole('listitem')).toHaveLength(2); // revoked rules are not listed
    expect(screen.getByText('active · earliest release 14 Oct 2027')).toBeInTheDocument();
  });

  it('shows an empty state when there are no rules', async () => {
    renderPage();
    expect(await screen.findByText('No handoff rules yet.')).toBeInTheDocument();
  });

  it('shows For you rows for waiting and released rules, and the witnesses entry', async () => {
    rules.forMe.mockResolvedValue([
      { id: 'n1', owner: { id: 'o1', email: 'tom.becker@icloud.com', displayName: null }, state: 'active', createdAt: '2026-10-12T12:00:00.000Z' },
      { id: 'n2', owner: { id: 'o2', email: 'mum@x.co', displayName: 'Mum' }, state: 'released_timer', createdAt: '2026-01-01T12:00:00.000Z', releasedAt: '2026-10-10T12:00:00.000Z', releasedBy: 'timer' },
    ]);
    renderPage();
    const section = await screen.findByRole('region', { name: 'For you' });
    expect(within(section).getByText('tom.becker@icloud.com has set something aside for you.')).toBeInTheDocument();
    expect(within(section).getByText('12 Oct 2026 · nothing to do now')).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'Read the notice from tom.becker@icloud.com' })).toHaveAttribute('href', '/notice/n1');
    expect(within(section).getByText('Mum has released something to you.')).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'Open what Mum released' })).toHaveAttribute('href', '/shared');
    expect(await screen.findByRole('link', { name: /Witnesses: 2 of 3, 2 accepted/ })).toHaveAttribute('href', '/settings/witnesses');
  });

  it('draws no For you section when nothing is waiting', async () => {
    renderPage();
    await screen.findByText('No handoff rules yet.');
    expect(screen.queryByRole('region', { name: 'For you' })).toBeNull();
  });

  it('retries a repair that needs doing, once, and says so only on failure', async () => {
    rules.listRules.mockResolvedValue([rule({ sharesStale: true })]);
    rules.repairAtUnlock.mockResolvedValue({ repaired: 0, failed: 1 });
    renderPage();
    await waitFor(() => expect(rules.repairAtUnlock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(useUIStore.getState().toasts.some((t) => t.message === 'Some handoff rules could not be repaired.')).toBe(true));
  });
  it('shows the witness cards and the owner\'s release notice, and Dismiss hides the notice', async () => {
    release.witnessCards.mockResolvedValue([{ owner: { id: 'o1', email: 'anna.lind@gmail.com', displayName: null }, open: null, closed: [] }]);
    const closedAt = new Date().toISOString();
    vi.spyOn(ApiService, 'listMyReleaseRequests').mockResolvedValue([
      {
        id: 'q1', state: 'cancelled', reason: 'sign_in', requiredVotes: 2, openedAt: closedAt, closedAt,
        openedBy: { id: 'w1', email: 'j.park@outlook.com', displayName: null }, votes: [], releasedRuleIds: [],
      },
    ]);
    renderPage();
    const witnessFor = await screen.findByRole('region', { name: 'You are a witness for' });
    expect(within(witnessFor).getByText('No release request is open.')).toBeInTheDocument();
    const notice = await screen.findByRole('status', { name: 'Release notice' });
    expect(within(notice).getByText('Your sign-in cancelled a release request.')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Dismiss' }).click();
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Release notice' })).toBeNull());
  });
});
