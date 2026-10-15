import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { UserIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { ListRow, RowList } from '../common/ListRow';
import { ContactKey, KeyChangedCallout } from './ContactKey';
import { WitnessRecipientWarning } from './WitnessRecipientWarning';
import { lookupContact, setContactVerified, type ContactLookup } from '../../services/witness.service';
import type { WitnessSummary } from '../../services/rules.service';
import { toApiError } from '../../services/api.service';
import { CUSTOM_MAX_DAYS, CUSTOM_MIN_DAYS, PERIOD_CHOICES, formatDay, personName, reminderDates } from './format';

export interface DraftRecipient {
  userId: string;
  email: string;
  displayName: string | null;
  publicKey: string;
  fingerprint: string;
}

export interface RuleDraft {
  recipients: DraftRecipient[];
  periodDays: number | null;
}

export interface RuleSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** What the rule is for: its name and a short line such as "Folder · 7 files" or "1.2 MB". */
  item: { name: string; detail: string };
  /** Null while loading. */
  witnesses: WitnessSummary | null;
  initial?: RuleDraft;
  onReview: (draft: RuleDraft & { periodDays: number }) => void;
}

const chip = (on: boolean) =>
  `h-11 rounded-lg border px-4 text-[15px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
    on ? 'border-accent bg-accent-soft text-accent-text' : 'border-line-strong bg-surface text-ink hover:bg-surface-2'
  }`;

const shortKey = (fp: string) => `${(fp.replace(/\s+/g, '').slice(0, 8).toUpperCase().match(/.{4}/g) ?? []).join(' ')} …`;

/** C3: who receives it, and after how long without a sign-in. Review leads to the confirmation. */
export const RuleSheet: React.FC<RuleSheetProps> = ({ isOpen, onClose, item, witnesses, initial, onReview }) => {
  const [recipients, setRecipients] = useState<DraftRecipient[]>(initial?.recipients ?? []);
  const initialChoice = initial?.periodDays == null ? null : PERIOD_CHOICES.some((p) => p.days === initial.periodDays) ? initial.periodDays : 'custom';
  const [choice, setChoice] = useState<number | 'custom' | null>(initialChoice);
  const [customDays, setCustomDays] = useState(initialChoice === 'custom' ? String(initial?.periodDays) : '');

  const [email, setEmail] = useState('');
  const [checking, setChecking] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [contact, setContact] = useState<ContactLookup | null>(null);
  const [verified, setVerified] = useState(false);
  const [trusting, setTrusting] = useState(false);

  const customValue = Number(customDays);
  const customValid = customDays.trim() !== '' && Number.isInteger(customValue) && customValue >= CUSTOM_MIN_DAYS && customValue <= CUSTOM_MAX_DAYS;
  const periodDays = choice === 'custom' ? (customValid ? customValue : null) : choice;

  const ready = witnesses !== null && witnesses.accepted >= 2 && witnesses.accepted >= witnesses.threshold;
  const canReview = recipients.length > 0 && periodDays !== null && ready;

  const resetAdd = () => {
    setEmail('');
    setContact(null);
    setVerified(false);
    setLookupError(null);
  };

  const check = async () => {
    if (!email.trim()) return;
    setChecking(true);
    setLookupError(null);
    try {
      const found = await lookupContact(email);
      setContact(found);
      setVerified(found.verifiedInPerson);
    } catch (e) {
      setContact(null);
      setLookupError(e instanceof Error ? e.message : toApiError(e).message);
    } finally {
      setChecking(false);
    }
  };

  const changeVerified = async (next: boolean) => {
    if (!contact) return;
    setTrusting(true);
    try {
      await setContactVerified(contact.id, next);
      setVerified(next);
      // Marking it checked is how a changed key is accepted: the server now holds the key in use.
      if (next && contact.keyChanged) setContact({ ...contact, keyChanged: false });
    } catch (e) {
      setLookupError(toApiError(e).message);
    } finally {
      setTrusting(false);
    }
  };

  const add = () => {
    if (!contact) return;
    if (recipients.some((r) => r.userId === contact.id)) {
      setLookupError('They are already in the list.');
      return;
    }
    setRecipients([...recipients, { userId: contact.id, email: contact.email, displayName: null, publicKey: contact.publicKey, fingerprint: contact.localFingerprint }]);
    resetAdd();
  };

  const witnessOverlap = recipients.filter((r) => witnesses?.acceptedUserIds.includes(r.userId));
  const dates = periodDays !== null ? reminderDates(new Date(), periodDays) : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Handoff rule" size="md">
      <div className="flex flex-col gap-5">
        <p className="-mt-2 text-sm text-ink-2">
          <span className="break-all font-medium text-ink">{item.name}</span> · {item.detail}
        </p>

        <section aria-label="Who receives it" className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-ink">Who receives it</h3>
          {recipients.length > 0 && (
            <RowList>
              {recipients.map((r) => (
                <ListRow
                  key={r.userId}
                  icon={<UserIcon className="h-5 w-5" />}
                  title={personName(r)}
                  meta={<span>Has an account · key <span className="font-mono">{shortKey(r.fingerprint)}</span></span>}
                  actions={
                    <button
                      type="button"
                      aria-label={`Remove ${r.email}`}
                      onClick={() => setRecipients(recipients.filter((x) => x.userId !== r.userId))}
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                    </button>
                  }
                />
              ))}
            </RowList>
          )}

          {witnessOverlap.map((r) => (
            <WitnessRecipientWarning key={r.userId} name={personName(r)} ruleName={item.name} />
          ))}

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                label="Add a recipient by email"
                type="email"
                placeholder="They need an account here"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setContact(null);
                  setVerified(false);
                  setLookupError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void check();
                }}
                error={lookupError ?? undefined}
              />
            </div>
            <Button variant="secondary" onClick={() => void check()} isLoading={checking} disabled={!email.trim() || contact !== null}>
              Check key
            </Button>
          </div>
          {contact?.keyChanged && <KeyChangedCallout name={contact.email} />}
          {contact && (
            <>
              <ContactKey email={contact.email} fingerprint={contact.localFingerprint} verified={verified} onVerifiedChange={(v) => void changeVerified(v)} disabled={trusting} />
              <div className="flex justify-end gap-2">
                <Button variant="quiet" onClick={resetAdd}>
                  Cancel
                </Button>
                <Button onClick={add} disabled={contact.keyChanged}>
                  Add recipient
                </Button>
              </div>
            </>
          )}
          <p className="text-[13px] leading-[18px] text-ink-3">They are told a rule exists for them, not what it covers.</p>
        </section>

        <section aria-label="Period" className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-ink">Release if I have not signed in for</h3>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Period">
            {PERIOD_CHOICES.map((p) => (
              <button key={p.days} type="button" aria-pressed={choice === p.days} onClick={() => setChoice(p.days)} className={chip(choice === p.days)}>
                {p.label}
              </button>
            ))}
            <button type="button" aria-pressed={choice === 'custom'} onClick={() => setChoice('custom')} className={chip(choice === 'custom')}>
              Custom
            </button>
          </div>
          {choice === 'custom' && (
            <Input
              label="Days"
              type="number"
              inputMode="numeric"
              min={CUSTOM_MIN_DAYS}
              max={CUSTOM_MAX_DAYS}
              value={customDays}
              onChange={(e) => setCustomDays(e.target.value)}
              helperText={`From ${CUSTOM_MIN_DAYS} to ${CUSTOM_MAX_DAYS} days.`}
              error={customDays !== '' && !customValid ? `Use a whole number of days from ${CUSTOM_MIN_DAYS} to ${CUSTOM_MAX_DAYS}.` : undefined}
            />
          )}
        </section>

        <div role="note" className="rounded-[10px] bg-surface-2 px-4 py-3.5 text-sm leading-5 text-ink-2">
          {witnesses === null ? (
            'Checking your witnesses…'
          ) : !ready ? (
            <>
              Your witnesses are not ready: {witnesses.accepted} accepted, and at least {Math.max(2, witnesses.threshold)} are needed.{' '}
              <Link to="/settings/witnesses" className="font-medium text-accent-text underline">
                Open witnesses
              </Link>
            </>
          ) : (
            <>
              Or sooner, if any {witnesses.threshold} of your {witnesses.accepted} witnesses agree.
              {dates
                ? ` You will get reminders on ${formatDay(dates.first)}, ${formatDay(dates.second)} and ${formatDay(dates.final)}.`
                : ' Choose a period to see your reminder dates.'}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!canReview} onClick={() => periodDays !== null && onReview({ recipients, periodDays })}>
            Review
          </Button>
        </div>
      </div>
    </Modal>
  );
};
