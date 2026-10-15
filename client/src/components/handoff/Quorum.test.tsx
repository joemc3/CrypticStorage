import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ActivityEntry, HandoffRule, ReleaseRequest } from '../../services/api.service';
import type { WitnessCard } from '../../services/release.service';
import { useUIStore } from '../../stores/ui.store';
import { QuorumFlows, type QuorumIntent } from './QuorumFlows';
import { WitnessForSection } from './WitnessForSection';
import { ReleaseNoticeCard, ownerNotices } from './ReleaseNotice';

const release = vi.hoisted(() => ({ openRequest: vi.fn(), vote: vi.fn() }));
vi.mock('../../services/release.service', async () => ({
  ...(await vi.importActual<typeof import('../../services/release.service')>('../../services/release.service')),
  ...release,
}));

/** A local wall-clock time as an ISO string, so the expected "14:02" holds in any time zone. */
const at = (month: number, day: number, h: number, m: number, sec = 0) => new Date(2026, month - 1, day, h, m, sec).toISOString();

const owner = { id: 'o1', email: 'anna.lind@gmail.com', displayName: null };
const request = (over: Partial<ReleaseRequest> = {}): ReleaseRequest => ({
  id: 'q1', owner, openedBy: { id: 'w1', email: 'j.park@outlook.com', displayName: null }, state: 'open', requiredVotes: 2, openedAt: at(10, 13, 14, 2),
  votes: [{ witnessUserId: 'w1', displayName: null, email: 'j.park@outlook.com', votedAt: at(10, 13, 14, 2) }], myVote: false,
  rules: [{ ruleId: 'r1', sharesStale: false, state: 'active', recipients: [] }], myShares: [], ...over,
});

const renderSection = (cards: WitnessCard[], handlers = { onOpen: vi.fn(), onVote: vi.fn() }) => {
  render(<WitnessForSection cards={cards} meId="me" {...handlers} />);
  return handlers;
};

describe('You are a witness for', () => {
  it('draws nothing for someone who serves nobody', () => {
    const { container } = render(<WitnessForSection cards={[]} onOpen={() => {}} onVote={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('with no request: says so and offers to open one', () => {
    const { onOpen } = renderSection([{ owner, open: null, closed: [] }]);
    expect(screen.getByText('You cannot read their items. You can, with others, release them to the people they chose.')).toBeInTheDocument();
    expect(screen.getByText('No release request is open.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open a release request' }));
    expect(onOpen).toHaveBeenCalledWith(owner);
  });

  it('with an open request: who opened it, the amber bar, who voted, the cancel line and Add your vote', () => {
    const open = request();
    const { onVote } = renderSection([{ owner, open, closed: [] }]);
    expect(screen.getByText('Opened by j.park@outlook.com · 13 Oct, 14:02')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 votes')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Votes' })).toHaveAttribute('aria-valuenow', '1');
    const voted = screen.getByRole('list', { name: 'Who has voted' });
    expect(within(voted).getByText('j.park@outlook.com')).toBeInTheDocument();
    expect(screen.getByText('If anna.lind@gmail.com signs in, the request is cancelled.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add your vote' }));
    expect(onVote).toHaveBeenCalledWith(open);
  });

  it('hides Add your vote once I have voted, and shows me as You', () => {
    renderSection([{ owner, open: request({ myVote: true, votes: [{ witnessUserId: 'me', displayName: null, email: 'me@x.co', votedAt: at(10, 13, 15, 0) }] }), closed: [] }]);
    expect(screen.queryByRole('button', { name: 'Add your vote' })).toBeNull();
    expect(within(screen.getByRole('list', { name: 'Who has voted' })).getByText('You')).toBeInTheDocument();
  });

  it('disables the vote, with a line, when every rule awaits repair', () => {
    renderSection([{ owner, open: request({ rules: [{ ruleId: 'r1', sharesStale: true, state: 'active', recipients: [] }] }), closed: [] }]);
    expect(screen.getByRole('button', { name: 'Add your vote' })).toBeDisabled();
    expect(screen.getByText(/has to repair their rules before a vote can count/)).toBeInTheDocument();
  });

  it('lists completed and cancelled requests as one line each', () => {
    renderSection([
      {
        owner,
        open: null,
        closed: [
          request({ id: 'a', state: 'cancelled', closedAt: at(10, 14, 9, 12) }),
          request({ id: 'b', state: 'completed', closedAt: at(10, 12, 8, 15) }),
        ],
      },
    ]);
    const earlier = screen.getByRole('list', { name: 'Earlier requests' });
    expect(within(earlier).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Cancelled 14 Oct, 09:12', 'Released 12 Oct, 08:15']);
  });
});

describe('the two one-fact screens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUIStore.setState({ toasts: [] });
  });

  const renderFlow = (intent: QuorumIntent) => {
    const handlers = { onClose: vi.fn(), onChanged: vi.fn() };
    render(<QuorumFlows intent={intent} {...handlers} />);
    return handlers;
  };

  it('open: the verbatim sentences, a primary action, and Not now', async () => {
    release.openRequest.mockResolvedValue(request());
    const { onClose, onChanged } = renderFlow({ kind: 'open', owner });
    expect(screen.getByText('Witness · open a release request')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "You are asking to release anna.lind@gmail.com's items now." })).toBeInTheDocument();
    expect(screen.getByText("anna.lind@gmail.com and the other witnesses will be told. If anna.lind@gmail.com signs in, the request is cancelled.")).toBeInTheDocument();
    const act = screen.getByRole('button', { name: 'Open the request' });
    expect(act.className).not.toMatch(/bg-danger/);
    fireEvent.click(act);
    await waitFor(() => expect(release.openRequest).toHaveBeenCalledWith('o1'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onChanged).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
  });

  it('vote: "vote 2 of 2", the verbatim sentences and the danger button', () => {
    renderFlow({ kind: 'vote', request: request() });
    expect(screen.getByText('Witness · vote 2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "Add your vote to release anna.lind@gmail.com's items." })).toBeInTheDocument();
    expect(screen.getByText("Once 2 votes are in, the items go to the people anna.lind@gmail.com chose. This cannot be undone.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add my vote' }).className).toMatch(/bg-danger/);
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
  });

  it('a vote that does not complete closes with a toast', async () => {
    release.vote.mockResolvedValue({ ...request({ votes: [request().votes[0], { ...request().votes[0], witnessUserId: 'me' }], requiredVotes: 3 }), awaitingRepair: [] });
    const { onClose } = renderFlow({ kind: 'vote', request: request({ requiredVotes: 3 }) });
    fireEvent.click(screen.getByRole('button', { name: 'Add my vote' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(useUIStore.getState().toasts.some((t) => t.type === 'success' && t.message === 'Your vote is in. 2 of 3.')).toBe(true);
  });

  it('a vote that completes the release shows a calm confirmation and stays until dismissed', async () => {
    release.vote.mockResolvedValue({ ...request({ state: 'completed' }), awaitingRepair: [] });
    const { onClose, onChanged } = renderFlow({ kind: 'vote', request: request() });
    fireEvent.click(screen.getByRole('button', { name: 'Add my vote' }));
    expect(await screen.findByRole('heading', { name: 'The items have gone to the people anna.lind@gmail.com chose.' })).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Add my vote' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the dashboard' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('a failed vote says so and leaves the screen open for another try', async () => {
    release.vote.mockRejectedValue(new Error('Your vault is locked. Unlock it to continue.'));
    const { onClose } = renderFlow({ kind: 'vote', request: request() });
    fireEvent.click(screen.getByRole('button', { name: 'Add my vote' }));
    await waitFor(() => expect(useUIStore.getState().toasts.some((t) => t.type === 'error')).toBe(true));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add my vote' })).toBeEnabled();
  });
});

describe('the owner\'s release notice', () => {
  const now = new Date(at(10, 14, 12, 0));
  const entry = (over: Partial<ActivityEntry>): ActivityEntry => ({
    id: 'a1', action: 'handoff.request.cancel', resourceType: 'release_request', resourceId: 'q1', metadata: { reason: 'owner_activity' }, ipAddress: '', userAgent: '', success: true,
    createdAt: at(10, 14, 9, 12), ...over,
  });
  const rule = (over: Partial<HandoffRule> = {}): HandoffRule => ({
    id: 'r1', folderId: 'f1', periodDays: 365, state: 'released_quorum', createdAt: '2026-09-01T00:00:00.000Z', nextCheckInAt: null, warningAt: null, sharesStale: false, coverageGaps: 0,
    releasedAt: at(10, 14, 8, 15),
    recipients: [{ userId: 'a', email: 'daniel.hale@gmail.com', displayName: null, notifiedAt: null }, { userId: 'b', email: 'sam.hale@proton.me', displayName: null, notifiedAt: null }], ...over,
  });
  const show = (notice: ReturnType<typeof ownerNotices>[number], onDismiss = vi.fn()) => {
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ReleaseNoticeCard notice={notice} onDismiss={onDismiss} /></MemoryRouter>);
    return onDismiss;
  };

  it('sign-in cancelled the request: reassures that nothing was released', () => {
    const [notice] = ownerNotices([], new Map(), [entry({})], now);
    const onDismiss = show(notice);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Your sign-in cancelled a release request.')).toBeInTheDocument();
    expect(screen.getByText('Your witnesses have been told. Nothing was released.')).toBeInTheDocument();
    expect(screen.getByText('Cancelled by your sign-in')).toBeInTheDocument();
    expect(screen.getByText('14 Oct, 09:12')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See your witnesses' })).toHaveAttribute('href', '/settings/witnesses');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('witnesses released the items: says where they went and that the owner\'s copy is unchanged', () => {
    const [notice] = ownerNotices([rule()], new Map([['r1', 'Estate']]), [], now);
    show(notice);
    expect(screen.getByText('Estate was released by your witnesses.')).toBeInTheDocument();
    expect(screen.getByText('It went to daniel.hale@gmail.com and sam.hale@proton.me. Your own copy is unchanged.')).toBeInTheDocument();
    expect(screen.getByText('Released to daniel.hale@gmail.com and sam.hale@proton.me')).toBeInTheDocument();
    expect(screen.getByText('14 Oct, 08:15')).toBeInTheDocument();
  });

  it('a change of witnesses that cancelled the request is named for what it was', () => {
    const [notice] = ownerNotices([], new Map(), [entry({ metadata: { reason: 'owner_change' } })], now);
    show(notice);
    expect(screen.getByText('A change you made cancelled a release request.')).toBeInTheDocument();
    expect(screen.getByText('Cancelled by your change')).toBeInTheDocument();
  });

  it('picks the newest ending, ignores old ones, failed entries and other actions, and groups rules released together', () => {
    const notices = ownerNotices(
      [rule({ id: 'r1' }), rule({ id: 'r2', releasedAt: at(10, 14, 8, 15, 30) }), rule({ id: 'old', releasedAt: '2026-09-01T00:00:00.000Z' })],
      new Map([['r1', 'Estate'], ['r2', 'Letter']]),
      [entry({ id: 'x', createdAt: '2026-09-01T00:00:00.000Z' }), entry({ id: 'y', success: false }), entry({ id: 'z', action: 'handoff.request.open' })],
      now
    );
    expect(notices).toHaveLength(1);
    expect(notices[0].head).toBe('Estate and Letter were released by your witnesses.');
    expect(notices[0].sub).toBe('They went to daniel.hale@gmail.com and sam.hale@proton.me. Your own copies are unchanged.');
  });

  it('a sign-in that came after a release is the newest ending', () => {
    const notices = ownerNotices([rule()], new Map([['r1', 'Estate']]), [entry({})], now);
    expect(notices.map((n) => n.head)).toEqual(['Your sign-in cancelled a release request.', 'Estate was released by your witnesses.']);
  });
});
