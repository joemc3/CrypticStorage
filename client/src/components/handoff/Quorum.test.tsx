import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { HandoffRule, OwnerReleaseRequest, ReleaseRequest } from '../../services/api.service';
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
  const ownerRequest = (over: Partial<OwnerReleaseRequest> = {}): OwnerReleaseRequest => ({
    id: 'q1', state: 'cancelled', reason: 'sign_in', requiredVotes: 2, openedAt: at(10, 14, 8, 2), closedAt: at(10, 14, 9, 12),
    openedBy: { id: 'w1', email: 'j.park@outlook.com', displayName: null },
    votes: [{ witnessUserId: 'w2', displayName: 'Mia Ross', email: 'mia@x.co', votedAt: at(10, 14, 8, 40) }],
    releasedRuleIds: [], ...over,
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
  const timeline = () => screen.getAllByRole('listitem').map((li) => li.textContent);

  it('sign-in: names who opened and who voted, then says the sign-in cancelled it and nothing was released', () => {
    const [notice] = ownerNotices([ownerRequest()], [], new Map(), now);
    const onDismiss = show(notice);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Your sign-in cancelled a release request.')).toBeInTheDocument();
    expect(timeline()).toEqual([
      'j.park@outlook.com opened a release request · 14 Oct, 08:02',
      'Mia Ross voted · 14 Oct, 08:40',
      'Your sign-in cancelled a release request · 14 Oct, 09:12. Your witnesses have been told. Nothing was released.',
    ]);
    expect(screen.getByRole('link', { name: 'See your witnesses' })).toHaveAttribute('href', '/settings/witnesses');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('an owner change ends with "Your change cancelled a release request"', () => {
    const [notice] = ownerNotices([ownerRequest({ reason: 'owner_change', votes: [] })], [], new Map(), now);
    show(notice);
    expect(timeline()).toEqual([
      'j.park@outlook.com opened a release request · 14 Oct, 08:02',
      'Your change cancelled a release request · 14 Oct, 09:12. Nothing was released.',
    ]);
  });

  it('a request that could not complete says so', () => {
    const [notice] = ownerNotices([ownerRequest({ reason: 'no_release_possible' })], [], new Map(), now);
    show(notice);
    expect(screen.getByText('A release request could not complete.')).toBeInTheDocument();
    expect(timeline()[2]).toBe('A release request could not complete · 14 Oct, 09:12. Nothing was released.');
  });

  it('a completed request: what was released, to whom, and that the owner\'s copies are unchanged', () => {
    const done = ownerRequest({
      state: 'completed', reason: undefined, closedAt: at(10, 14, 8, 15), releasedRuleIds: ['r1'],
      votes: [
        { witnessUserId: 'w1', displayName: null, email: 'j.park@outlook.com', votedAt: at(10, 14, 8, 3) },
        { witnessUserId: 'w2', displayName: 'Mia Ross', email: 'mia@x.co', votedAt: at(10, 14, 8, 15) },
      ],
    });
    const [notice] = ownerNotices([done], [rule()], new Map([['r1', 'Estate']]), now);
    show(notice);
    expect(screen.getByText('Estate was released by your witnesses.')).toBeInTheDocument();
    expect(screen.getByText('It went to daniel.hale@gmail.com and sam.hale@proton.me.')).toBeInTheDocument();
    expect(timeline()).toEqual([
      'j.park@outlook.com opened a release request · 14 Oct, 08:02',
      'j.park@outlook.com voted · 14 Oct, 08:03',
      'Mia Ross voted · 14 Oct, 08:15',
      'Your witnesses released your items · 14 Oct, 08:15. Your own copies are unchanged.',
    ]);
  });

  it('picks the newest ending and ignores open requests and endings older than two weeks', () => {
    const notices = ownerNotices(
      [
        ownerRequest({ id: 'open', state: 'open', reason: undefined, closedAt: undefined }),
        ownerRequest({ id: 'old', closedAt: '2026-09-01T00:00:00.000Z' }),
        ownerRequest({ id: 'earlier', reason: 'owner_change', closedAt: at(10, 13, 9, 0) }),
        ownerRequest({ id: 'newest' }),
      ],
      [],
      new Map(),
      now
    );
    expect(notices.map((n) => n.id)).toEqual(['request:newest', 'request:earlier']);
  });
});
