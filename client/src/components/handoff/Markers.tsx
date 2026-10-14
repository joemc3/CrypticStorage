import React from 'react';
import { ClockIcon, ShareIcon } from '@heroicons/react/24/outline';
import { RowMarker } from '../common/ListRow';
import { Button } from '../common/Button';
import type { HandoffRule } from '../../services/api.service';
import { isOpen } from '../../services/rules.service';
import { formatDay, recipientNames, stateLabel } from './format';

/** Row marker for an item that a rule names directly. Children of a covered folder do not repeat it (decision 5). */
export const HandoffMarker: React.FC<{ rules: HandoffRule[] }> = ({ rules }) => {
  const open = rules.filter(isOpen);
  const label = open.some((r) => r.state === 'warning') ? 'Handoff · due soon' : open.length > 0 ? 'Handoff' : 'Handed off';
  return (
    <RowMarker tone="handoff" icon={<ClockIcon className="h-3.5 w-3.5" />}>
      {label}
    </RowMarker>
  );
};

/** "Shared" when anything gives someone else access (ruling R24). */
export const ShareMarker: React.FC = () => (
  <RowMarker tone="shared" icon={<ShareIcon className="h-3.5 w-3.5" />}>
    Shared
  </RowMarker>
);

/** Marker on a row of Shared with me, for an item that reached this account through a handoff. */
export const FromHandoffMarker: React.FC<{ from: string }> = ({ from }) => (
  <RowMarker tone="handoff" icon={<ClockIcon className="h-3.5 w-3.5" />}>
    Handed off by {from}
  </RowMarker>
);

/** At the top of a covered folder: who gets it, when, and the state. */
export const FolderRuleBanner: React.FC<{ rules: HandoffRule[]; onView: () => void }> = ({ rules, onView }) => {
  if (rules.length === 0) return null;
  return (
    <div role="note" className="flex flex-col gap-2 rounded-xl border border-line bg-accent-soft px-4 py-3">
      {rules.map((rule) => (
        <div key={rule.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span className="min-w-0 break-words text-sm text-accent-text">
            Handed off to {recipientNames(rule)} on {formatDay(isOpen(rule) ? rule.nextCheckInAt : (rule.releasedAt ?? rule.nextCheckInAt))} · {stateLabel[rule.state]}
          </span>
          <Button variant="quiet" size="sm" onClick={onView}>
            View rule
          </Button>
        </div>
      ))}
    </div>
  );
};
