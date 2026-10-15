import React from 'react';
import { Link } from 'react-router-dom';
import { ClockIcon } from '@heroicons/react/24/outline';
import type { ActivityEntry, HandoffRule } from '../../services/api.service';
import { formatDayTime, joinNames, personName } from './format';

export interface NoticeLine {
  what: string;
  when: string;
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
const CANCEL_REASON = new Set(['owner_activity', 'owner_change', 'no_release_possible']);

const cancelCopy = (reason: unknown): { head: string; sub: string; line: string } => {
  switch (reason) {
    case 'owner_change':
      return { head: 'A change you made cancelled a release request.', sub: 'Your witnesses have been told. Nothing was released.', line: 'Cancelled by your change' };
    case 'no_release_possible':
      return { head: 'A release request ended because nothing could be released.', sub: 'Your witnesses have been told. Nothing was released.', line: 'Ended with nothing to release' };
    default:
      return { head: 'Your sign-in cancelled a release request.', sub: 'Your witnesses have been told. Nothing was released.', line: 'Cancelled by your sign-in' };
  }
};

/**
 * The owner's story of a release request, from what the owner can read: the activity feed carries
 * the cancellation (the owner's own entry) and each rule that released by quorum comes from the rules.
 * Who opened and who voted are recorded under the witnesses, so the owner's feed cannot name them.
 * Newest ending first; only endings from the last two weeks.
 */
export function ownerNotices(rules: HandoffRule[], names: Map<string, string>, activity: ActivityEntry[], now: Date = new Date()): OwnerNotice[] {
  const since = now.getTime() - WINDOW_MS;
  const notices: OwnerNotice[] = [];

  for (const entry of activity) {
    if (entry.action !== 'handoff.request.cancel' || !entry.success || new Date(entry.createdAt).getTime() < since) continue;
    const reason = entry.metadata?.reason;
    if (typeof reason === 'string' && !CANCEL_REASON.has(reason)) continue;
    const copy = cancelCopy(reason);
    notices.push({
      id: `cancel:${entry.id}`,
      at: entry.createdAt,
      head: copy.head,
      sub: copy.sub,
      lines: [{ what: copy.line, when: formatDayTime(entry.createdAt), tone: 'accent' }],
      link: { to: '/settings/witnesses', label: 'See your witnesses' },
    });
  }

  // One request releases all its rules at the same moment, so rules sharing a minute are one ending.
  const released = new Map<string, HandoffRule[]>();
  for (const rule of rules) {
    if (rule.state !== 'released_quorum' || !rule.releasedAt || new Date(rule.releasedAt).getTime() < since) continue;
    const key = rule.releasedAt.slice(0, 16);
    released.set(key, [...(released.get(key) ?? []), rule]);
  }
  for (const group of released.values()) {
    const itemNames = joinNames(group.map((r) => names.get(r.id) ?? 'An item'));
    const to = joinNames([...new Set(group.flatMap((r) => r.recipients.map(personName)))]);
    const releasedAt = group[0].releasedAt!;
    notices.push({
      id: `released:${group.map((r) => r.id).sort().join(',')}`,
      at: releasedAt,
      head: group.length === 1 ? `${itemNames} was released by your witnesses.` : `${itemNames} were released by your witnesses.`,
      sub: `${group.length === 1 ? 'It' : 'They'} went to ${to}. Your own ${group.length === 1 ? 'copy is' : 'copies are'} unchanged.`,
      lines: [{ what: `Released to ${to}`, when: formatDayTime(releasedAt), tone: 'info' }],
    });
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
          <div className="flex flex-col gap-1">
            <span className="break-words text-sm text-ink">{line.what}</span>
            <span className="text-xs text-ink-3">{line.when}</span>
          </div>
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
