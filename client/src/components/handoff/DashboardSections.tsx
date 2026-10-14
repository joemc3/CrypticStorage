import React from 'react';
import { Link } from 'react-router-dom';
import { ClockIcon, UserGroupIcon, UserIcon } from '@heroicons/react/24/outline';
import { EmptyState } from '../common/EmptyState';
import { ListRow, RowList } from '../common/ListRow';
import { StateBadge } from '../common/StateBadge';
import type { HandoffForMe, HandoffRule } from '../../services/api.service';
import { isOpen, type WitnessSummary } from '../../services/rules.service';
import { badgeState, formatDay, personName, recipientNames, stateLabel } from './format';

const heading = 'font-sans text-lg font-semibold leading-6 text-ink';

/** The date that matters for a rule: the next check-in while it is open, otherwise when it ended. */
function ruleWhen(rule: HandoffRule): string {
  if (isOpen(rule)) return `Next check-in ${formatDay(rule.nextCheckInAt)}`;
  if (rule.releasedAt) return `Released ${formatDay(rule.releasedAt)}`;
  return stateLabel[rule.state];
}

export const RulesSection: React.FC<{
  rules: HandoffRule[];
  names: Map<string, string>;
  onOpen: (rule: HandoffRule) => void;
}> = ({ rules, names, onOpen }) => (
  <section aria-label="Handoff rules" className="flex flex-col gap-3">
    <h2 className={heading}>Handoff rules</h2>
    {rules.length === 0 ? (
      <EmptyState
        icon={<ClockIcon className="h-6 w-6" />}
        title="No handoff rules yet."
        body="Choose Hand off… on a file or folder to decide who receives it if you stop signing in."
      />
    ) : (
      <RowList>
        {rules.map((rule) => (
          <ListRow
            key={rule.id}
            icon={<ClockIcon className="h-5 w-5" />}
            title={names.get(rule.id) ?? 'Loading name…'}
            meta={<span className="break-words">{`To ${recipientNames(rule)} · ${ruleWhen(rule)}`}</span>}
            markers={<StateBadge state={badgeState(rule.state)} label={stateLabel[rule.state]} />}
            onClick={() => onOpen(rule)}
          />
        ))}
      </RowList>
    )}
  </section>
);

const isReleased = (r: HandoffForMe) => r.state === 'released_timer' || r.state === 'released_quorum';

/** C5 as a row, and a row for each rule that has already released something to this account. */
export const ForYouSection: React.FC<{ rules: HandoffForMe[] }> = ({ rules }) => {
  const waiting = rules.filter((r) => r.state === 'active' || r.state === 'warning');
  const released = rules.filter(isReleased);
  if (waiting.length === 0 && released.length === 0) return null;
  return (
    <section aria-label="For you" className="flex flex-col gap-3">
      <h2 className={heading}>For you</h2>
      <RowList>
        {waiting.map((r) => (
          <ListRow
            key={r.id}
            icon={<UserIcon className="h-5 w-5" />}
            title="Something set aside for you"
            meta={<span className="break-words">{`${personName(r.owner)} has set something aside for you.`}</span>}
            markers={<span>{`${formatDay(r.createdAt)} · nothing to do now`}</span>}
            actions={
              <Link
                to={`/notice/${r.id}`}
                aria-label={`Read the notice from ${personName(r.owner)}`}
                className="flex h-11 items-center rounded-lg px-3 text-sm font-medium text-accent-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Read
              </Link>
            }
          />
        ))}
        {released.map((r) => (
          <ListRow
            key={r.id}
            icon={<UserIcon className="h-5 w-5" />}
            title="Released to you"
            meta={<span className="break-words">{`${personName(r.owner)} has released something to you.`}</span>}
            markers={
              <>
                <StateBadge state="released" label={r.releasedBy === 'quorum' ? 'Released by witnesses' : 'Released by timer'} />
                <span>{`${formatDay(r.releasedAt)} · it is in Shared with me`}</span>
              </>
            }
            actions={
              <Link
                to="/shared"
                aria-label={`Open what ${personName(r.owner)} released`}
                className="flex h-11 items-center rounded-lg px-3 text-sm font-medium text-accent-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Open
              </Link>
            }
          />
        ))}
      </RowList>
    </section>
  );
};

/** The witnesses entry on the dashboard: the numbers, and a way to the page. */
export const WitnessesEntry: React.FC<{ summary: WitnessSummary }> = ({ summary }) => (
  <Link
    to="/settings/witnesses"
    className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3.5 text-sm text-ink hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
  >
    <UserGroupIcon className="h-5 w-5 flex-none text-ink-3" aria-hidden="true" />
    <span className="min-w-0 flex-1">
      {summary.total === 0 ? 'Witnesses: none yet. Rules need at least two.' : `Witnesses: ${summary.threshold} of ${summary.total}, ${summary.accepted} accepted`}
    </span>
    <span className="flex-none font-medium text-accent-text">Manage</span>
  </Link>
);
