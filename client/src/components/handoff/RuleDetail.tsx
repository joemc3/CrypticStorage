import React from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { StateBadge } from '../common/StateBadge';
import type { HandoffRule } from '../../services/api.service';
import { isOpen, type WitnessSummary } from '../../services/rules.service';
import { badgeState, formatDay, lastResetOf, periodLabel, recipientNames, stateLabel } from './format';

export interface RuleDetailProps {
  isOpen: boolean;
  onClose: () => void;
  itemName: string;
  detail?: string;
  rules: HandoffRule[];
  witnesses: WitnessSummary | null;
  onRevoke: (rule: HandoffRule) => void;
  /** Omit to hide "Add another rule". */
  onAddAnother?: () => void;
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

const Row: React.FC<{ term: string; children: React.ReactNode }> = ({ term, children }) => (
  <div className="flex flex-col gap-0.5 border-b border-line py-2.5 last:border-b-0 sm:flex-row sm:gap-4">
    <dt className="text-sm text-ink-3 sm:w-40 sm:flex-none">{term}</dt>
    <dd className="min-w-0 break-words text-sm text-ink">{children}</dd>
  </div>
);

/** C4: the rules on one item, each as a short definition list. */
export const RuleDetail: React.FC<RuleDetailProps> = ({ isOpen: open, onClose, itemName, detail, rules, witnesses, onRevoke, onAddAnother }) => (
  <Modal isOpen={open} onClose={onClose} title={itemName} description={detail ?? 'Handoff rules'} size="md">
    <div className="flex flex-col gap-5">
      {rules.length === 0 && <p className="text-sm text-ink-2">No rules on this item.</p>}
      {rules.map((rule) => {
        const reset = lastResetOf(rule);
        const live = isOpen(rule);
        return (
          <section key={rule.id} aria-label={`Rule ${recipientNames(rule)}`} className="flex flex-col gap-2 rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StateBadge state={badgeState(rule.state)} label={stateLabel[rule.state]} />
              <span className="text-[13px] text-ink-3">Created {formatDay(rule.createdAt)}</span>
            </div>
            <dl>
              <Row term="To">{recipientNames(rule)}</Row>
              <Row term="Releases after">{periodLabel(rule.periodDays)} without a sign-in</Row>
              {live && rule.nextCheckInAt && <Row term="Next date">{formatDay(rule.nextCheckInAt)}</Row>}
              {!live && rule.releasedAt && <Row term="Released">{formatDay(rule.releasedAt)}</Row>}
              {live && reset && <Row term="Clock last reset">{sameDay(reset, new Date()) ? 'Today, by your sign-in' : formatDay(reset)}</Row>}
              {witnesses && <Row term="Or by witnesses">Any {witnesses.threshold} of {witnesses.total}</Row>}
            </dl>
            {live && (
              <div>
                <Button variant="quiet" className="!px-0 !text-danger-text" onClick={() => onRevoke(rule)}>
                  Revoke this rule
                </Button>
              </div>
            )}
          </section>
        );
      })}
      {onAddAnother && (
        <div className="flex flex-col items-start gap-1.5">
          <Button variant="secondary" onClick={onAddAnother}>
            Add another rule
          </Button>
          <p className="text-[13px] leading-[18px] text-ink-3">Different rules can send this item to different people.</p>
        </div>
      )}
    </div>
  </Modal>
);
