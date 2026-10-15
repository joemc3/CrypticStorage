import React from 'react';
import { Link } from 'react-router-dom';
import { ClockIcon } from '@heroicons/react/24/outline';
import type { HandoffRule, OwnerReleaseRequest } from '../../services/api.service';
import { formatDayTime, joinNames, personName, witnessName } from './format';

export interface NoticeLine {
  /** One sentence with who and when. */
  what: string;
  tone: 'warn' | 'accent' | 'info';
}

export interface OwnerNotice {
  /** Stable for one ending, so a dismissal hides this notice and not the next one. */
  id: string;
  at: string;
  head: string;
  sub: string;
  lines: NoticeLine[];
  link?: { to: string; label: string };
}

const WINDOW_MS = 14 * 86_400_000;

/** The last line of the timeline: how the request ended, by state and reason. */
function ending(request: OwnerReleaseRequest, when: string): { line: string; head: string } {
  if (request.state === 'completed') {
    return { line: `Your witnesses released your items · ${when}. Your own copies are unchanged.`, head: '' };
  }
  switch (request.reason) {
    case 'owner_change':
      return { line: `Your change cancelled a release request · ${when}. Nothing was released.`, head: 'Your change cancelled a release request.' };
    case 'no_release_possible':
      return { line: `A release request could not complete · ${when}. Nothing was released.`, head: 'A release request could not complete.' };
    default:
      return {
        line: `Your sign-in cancelled a release request · ${when}. Your witnesses have been told. Nothing was released.`,
        head: 'Your sign-in cancelled a release request.',
      };
  }
}

/**
 * The owner's story of each release request that ended in the last two weeks, newest first: who opened it, who
 * voted, and how it ended. Built from the owner's own request history; the rules supply what a completed request
 * released and to whom.
 */
export function ownerNotices(requests: OwnerReleaseRequest[], rules: HandoffRule[], names: Map<string, string>, now: Date = new Date()): OwnerNotice[] {
  const since = now.getTime() - WINDOW_MS;
  const notices: OwnerNotice[] = [];

  for (const request of requests) {
    if (request.state === 'open' || !request.closedAt || new Date(request.closedAt).getTime() < since) continue;
    const lines: NoticeLine[] = [
      { what: `${witnessName(request.openedBy)} opened a release request · ${formatDayTime(request.openedAt)}`, tone: 'warn' },
      ...request.votes.map((v): NoticeLine => ({ what: `${witnessName(v)} voted · ${formatDayTime(v.votedAt)}`, tone: 'warn' })),
    ];
    const end = ending(request, formatDayTime(request.closedAt));
    lines.push({ what: end.line, tone: request.state === 'completed' ? 'info' : 'accent' });

    if (request.state === 'completed') {
      const released = rules.filter((r) => request.releasedRuleIds.includes(r.id));
      const one = released.length === 1;
      const itemNames = released.length ? joinNames(released.map((r) => names.get(r.id) ?? 'An item')) : 'Your items';
      const to = joinNames([...new Set(released.flatMap((r) => r.recipients.map(personName)))]);
      notices.push({
        id: `request:${request.id}`,
        at: request.closedAt,
        head: `${itemNames} ${one ? 'was' : 'were'} released by your witnesses.`,
        sub: to ? `${one ? 'It' : 'They'} went to ${to}.` : 'They went to the people you named.',
        lines,
      });
    } else {
      notices.push({
        id: `request:${request.id}`,
        at: request.closedAt,
        head: end.head,
        sub: 'Nothing was released.',
        lines,
        link: { to: '/settings/witnesses', label: 'See your witnesses' },
      });
    }
  }

  return notices.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

const dot = { warn: 'bg-warn-text', accent: 'bg-accent', info: 'bg-info-text' } as const;

/** C7 on the owner's dashboard: the top card, a short timeline of how a release request ended. */
export const ReleaseNoticeCard: React.FC<{ notice: OwnerNotice; onDismiss: () => void }> = ({ notice, onDismiss }) => (
  <section role="status" aria-label="Release notice" className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-surface-2 text-ink-2" aria-hidden="true">
        <ClockIcon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="break-words font-sans text-base font-semibold leading-[22px] text-ink">{notice.head}</h2>
        <p className="mt-1 text-sm text-ink-2">{notice.sub}</p>
      </div>
    </div>
    <ol className="flex flex-col border-t border-line">
      {notice.lines.map((line) => (
        <li key={line.what} className="grid grid-cols-[12px_minmax(0,1fr)] gap-3 border-b border-line py-3">
          <span className={`mt-1.5 h-2 w-2 rounded-full ${dot[line.tone]}`} aria-hidden="true" />
          <span className="break-words text-sm text-ink">{line.what}</span>
        </li>
      ))}
    </ol>
    <div className="flex flex-wrap items-center justify-between gap-2">
      {notice.link ? (
        <Link to={notice.link.to} className="text-sm font-medium text-accent-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          {notice.link.label}
        </Link>
      ) : (
        <span />
      )}
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-lg px-3 py-2 text-sm font-medium text-ink-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Dismiss
      </button>
    </div>
  </section>
);

const DISMISSED_KEY = 'cs.releaseNotice.dismissed';

export function dismissedNotice(): string | null {
  try {
    return sessionStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

export function rememberDismissed(id: string): void {
  try {
    sessionStorage.setItem(DISMISSED_KEY, id);
  } catch {
    // The notice stays hidden until the page reloads; that is acceptable.
  }
}
