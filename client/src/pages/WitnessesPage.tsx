/**
 * CrypticStorage - Witnesses (Settings › Witnesses)
 * The people who, k of n together, can release what you marked for handoff.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { ListRow, RowList } from '../components/common/ListRow';
import { OneFact } from '../components/common/OneFact';
import { Spinner } from '../components/common/Spinner';
import { StateBadge, type BadgeState } from '../components/common/StateBadge';
import { ContactKey, KeyChangedCallout } from '../components/handoff/ContactKey';
import { WitnessRecipientWarning } from '../components/handoff/WitnessRecipientWarning';
import ApiService, { toApiError, type WitnessEntry, type WitnessSet } from '../services/api.service';
import * as WitnessService from '../services/witness.service';
import type { ContactLookup } from '../services/witness.service';
import { useToast } from '../hooks/useToast';

const MIN_K = 2;

const badgeFor: Record<string, { state: BadgeState; label: string }> = {
  accepted: { state: 'active', label: 'Accepted' },
  invited: { state: 'pending', label: 'Pending' },
  declined: { state: 'revoked', label: 'Declined' },
};

/** "91C2 7F3A …": the first sixteen hex digits, enough to recognise a key at a glance. */
const shortFingerprint = (hex: string) => `${(hex.slice(0, 16).toUpperCase().match(/.{4}/g) ?? []).join(' ')} …`;
const nameOf = (w: WitnessEntry) => w.user.displayName || w.user.email;

interface StagedWitness {
  userId: string;
  email: string;
  fingerprint: string;
}

const WitnessesPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [set, setSet] = useState<WitnessSet | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Everything below is staged. Nothing reaches the server until the one confirmation.
  const [k, setK] = useState(MIN_K);
  const [staged, setStaged] = useState<StagedWitness[]>([]);
  const [removals, setRemovals] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveProblems, setSaveProblems] = useState<string[]>([]);

  const [email, setEmail] = useState('');
  const [checking, setChecking] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [contact, setContact] = useState<ContactLookup | null>(null);
  const [verified, setVerified] = useState(false);
  const [trusting, setTrusting] = useState(false);
  const [resending, setResending] = useState<string | null>(null);
  // Who receives something from an open rule, so a witness who is also a recipient can be named (decision 6).
  const [recipientIds, setRecipientIds] = useState<Set<string>>(new Set());

  const apply = useCallback((next: WitnessSet) => {
    setSet(next);
    setK(next.threshold);
    setStaged([]);
    setRemovals([]);
  }, []);

  useEffect(() => {
    let live = true;
    WitnessService.listWitnesses()
      .then((s) => live && apply(s))
      .catch((e) => live && setLoadError(toApiError(e).message));
    ApiService.listHandoffRules()
      .then((rules) => {
        if (!live) return;
        const open = rules.filter((r) => r.state === 'active' || r.state === 'warning');
        setRecipientIds(new Set(open.flatMap((r) => r.recipients.map((x) => x.userId))));
      })
      // Without the rules the page still works; it just cannot warn.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [apply]);

  const alsoRecipient = (userId: string) => recipientIds.has(userId);

  const resend = async (w: WitnessEntry) => {
    setResending(w.id);
    try {
      await WitnessService.resend(w.id);
      toast.success('Invitation sent again', `${nameOf(w)} has a new email with the link.`);
    } catch (e) {
      toast.error('Could not send the invitation', toApiError(e).message);
    } finally {
      setResending(null);
    }
  };

  const current = (set?.witnesses ?? []).filter((w) => w.status === 'invited' || w.status === 'accepted');
  const shown = (set?.witnesses ?? []).filter((w) => w.status !== 'removed');
  const staying = current.filter((w) => !removals.includes(w.id));
  // The resulting set: who stays plus who is new.
  const n = staying.length + staged.length;
  const maxN = set?.maxN ?? n;
  const maxK = Math.min(n, maxN);
  const canStep = maxK >= MIN_K;
  const effectiveK = canStep ? Math.min(Math.max(k, MIN_K), maxK) : k;
  const changed = set !== null && (staged.length > 0 || removals.length > 0 || effectiveK !== set.threshold);

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
      const found = await WitnessService.lookupContact(email);
      setContact(found);
      setVerified(found.verifiedInPerson);
    } catch (e) {
      setContact(null);
      setLookupError(e instanceof Error ? e.message : 'Could not look that up');
    } finally {
      setChecking(false);
    }
  };

  const changeVerified = async (next: boolean) => {
    if (!contact) return;
    setTrusting(true);
    try {
      await WitnessService.setContactVerified(contact.id, next);
      setVerified(next);
      // Marking it checked is how a changed key is accepted: the server now holds the key in use.
      if (next && contact.keyChanged) setContact({ ...contact, keyChanged: false });
    } catch (e) {
      toast.error('Could not save that', toApiError(e).message);
    } finally {
      setTrusting(false);
    }
  };

  const stage = () => {
    if (!contact) return;
    const already = [...current.map((w) => w.user.email), ...staged.map((s) => s.email)].some((e) => e.toLowerCase() === contact.email.toLowerCase());
    if (already) {
      setLookupError('They are already in the list.');
      return;
    }
    if (n >= maxN) {
      setLookupError(`You can name at most ${maxN} witnesses.`);
      return;
    }
    setStaged([...staged, { userId: contact.id, email: contact.email, fingerprint: contact.fingerprint }]);
    resetAdd();
  };

  const toggleRemoval = (id: string) => setRemovals((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));

  /** Removals first, then invitations, then the threshold. Failures are collected, not fatal. */
  const save = async () => {
    setSaving(true);
    const problems: string[] = [];
    for (const id of removals) {
      const w = current.find((x) => x.id === id);
      try {
        await WitnessService.remove(id);
      } catch (e) {
        problems.push(`Could not remove ${w ? nameOf(w) : 'a witness'}: ${toApiError(e).message}`);
      }
    }
    for (const s of staged) {
      try {
        await WitnessService.invite(s.email);
      } catch (e) {
        problems.push(`Could not invite ${s.email}: ${toApiError(e).message}`);
      }
    }
    try {
      const fresh = await WitnessService.listWitnesses();
      if (canStep && fresh.threshold !== effectiveK) {
        try {
          apply(await WitnessService.setThreshold(effectiveK));
        } catch (e) {
          problems.push(`Could not set the threshold: ${toApiError(e).message}`);
          apply(fresh);
        }
      } else {
        apply(fresh);
      }
    } catch (e) {
      problems.push(`Could not reload the list: ${toApiError(e).message}`);
    }
    setSaveProblems(problems);
    if (problems.length === 0) toast.success('Witnesses saved', staged.length ? 'New witnesses count once they accept.' : undefined);
    setConfirming(false);
    setSaving(false);
  };

  if (confirming) {
    return (
      <OneFact
        fact={`Any ${effectiveK} of these ${n} people, together, can release everything you have marked for handoff.`}
        supporting="New witnesses get an invitation and must accept before they count."
        action={{ label: 'Save witnesses', onClick: () => void save(), disabled: saving }}
        back={() => setConfirming(false)}
        backDisabled={saving}
      >
        <ul role="list" className="border-t border-line">
          {staying.map((w) => (
            <React.Fragment key={w.id}>
              <li className="flex items-center justify-between gap-2 border-b border-line py-2.5 text-sm">
                <span className="break-all text-ink">{nameOf(w)}</span>
                <span className="flex-none text-ink-3">{badgeFor[w.status]?.label}</span>
              </li>
              {alsoRecipient(w.user.id) && (
                <li className="border-b border-line py-2.5">
                  <WitnessRecipientWarning name={nameOf(w)} />
                </li>
              )}
            </React.Fragment>
          ))}
          {staged.map((s) => (
            <React.Fragment key={s.email}>
              <li className="flex items-center justify-between gap-2 border-b border-line py-2.5 text-sm">
                <span className="break-all text-ink">{s.email}</span>
                <span className="flex-none text-ink-3">Invitation pending</span>
              </li>
              {alsoRecipient(s.userId) && (
                <li className="border-b border-line py-2.5">
                  <WitnessRecipientWarning name={s.email} />
                </li>
              )}
            </React.Fragment>
          ))}
        </ul>
      </OneFact>
    );
  }

  const blocked = contact !== null && contact.keyChanged && !verified;
  const iconButton =
    'flex h-11 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

  return (
    <DashboardLayout>
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
        <Breadcrumbs items={[{ label: 'Settings', href: '/settings', onClick: () => navigate('/settings') }, { label: 'Witnesses' }]} />
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold leading-[30px] tracking-[-.01em] text-ink">Witnesses</h1>
          <p className="max-w-[56ch] text-ink-2">
            Together they can release what you marked for handoff, early. None of them can read anything unless they are also a recipient.
          </p>
        </div>

        {loadError && <p role="alert" className="text-sm text-danger-text">{loadError}</p>}
        {saveProblems.length > 0 && (
          <div role="alert" className="rounded-[10px] bg-danger-soft px-4 py-3.5 text-sm leading-5 text-danger-text">
            <p className="font-semibold">Some changes did not go through.</p>
            <ul className="mt-1 list-disc pl-5">
              {saveProblems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}
        {!set && !loadError && <Spinner size="md" color="text-accent" label="Loading…" />}

        {set && (
          <>
            {(shown.length > 0 || staged.length > 0) && (
              <RowList>
                {shown.map((w) => {
                  const badge = badgeFor[w.status] ?? badgeFor.invited;
                  const going = removals.includes(w.id);
                  return (
                    <React.Fragment key={w.id}>
                      <ListRow
                        icon={<UserIcon className="h-5 w-5" />}
                        title={nameOf(w)}
                        meta={
                          <span className="flex flex-wrap items-center gap-x-3">
                            {w.user.displayName && <span className="break-all">{w.user.email}</span>}
                            <span className="font-mono">{shortFingerprint(w.user.fingerprint)}</span>
                          </span>
                        }
                        markers={going ? <StateBadge state="revoked" label="Will be removed" /> : <StateBadge state={badge.state} label={badge.label} />}
                        actions={
                          going ? (
                            <button type="button" aria-label={`Keep ${nameOf(w)}`} onClick={() => toggleRemoval(w.id)} className={`${iconButton} px-3 text-sm font-medium`}>
                              Undo
                            </button>
                          ) : (
                            <span className="flex items-center gap-1">
                              {w.status === 'invited' && (
                                <button
                                  type="button"
                                  aria-label={`Resend the invitation to ${nameOf(w)}`}
                                  onClick={() => void resend(w)}
                                  disabled={resending === w.id}
                                  className={`${iconButton} px-3 text-sm font-medium disabled:opacity-40`}
                                >
                                  Resend
                                </button>
                              )}
                              <button type="button" aria-label={`Remove ${nameOf(w)}`} onClick={() => toggleRemoval(w.id)} className={`${iconButton} w-11`}>
                                <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                              </button>
                            </span>
                          )
                        }
                      />
                      {alsoRecipient(w.user.id) && (
                        <li className="border-t border-line px-4 py-3">
                          <WitnessRecipientWarning name={nameOf(w)} />
                        </li>
                      )}
                    </React.Fragment>
                  );
                })}
                {staged.map((s) => (
                  <React.Fragment key={`new-${s.email}`}>
                    <ListRow
                      icon={<UserIcon className="h-5 w-5" />}
                      title={s.email}
                      meta={<span className="font-mono">{shortFingerprint(s.fingerprint)}</span>}
                      markers={<StateBadge state="pending" label="New · invited when you save" />}
                      actions={
                        <button type="button" aria-label={`Do not add ${s.email}`} onClick={() => setStaged(staged.filter((x) => x.email !== s.email))} className={`${iconButton} w-11`}>
                          <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                        </button>
                      }
                    />
                    {alsoRecipient(s.userId) && (
                      <li className="border-t border-line px-4 py-3">
                        <WitnessRecipientWarning name={s.email} />
                      </li>
                    )}
                  </React.Fragment>
                ))}
              </RowList>
            )}

            <div className="flex flex-col gap-4">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    label="Add a witness by email"
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
                    <Button onClick={stage} disabled={blocked}>
                      Add
                    </Button>
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface p-4">
              <div className="flex max-w-[34ch] flex-col gap-1">
                <span className="text-sm font-medium text-ink">Release needs</span>
                <span className="text-[13px] leading-[18px] text-ink-3">
                  {canStep
                    ? `Between ${MIN_K} and ${maxK}. Never 1, so no single person can release anything.`
                    : `Add at least ${Math.max(MIN_K, set.minN)} witnesses first. The number is never 1, so no single person can release anything.`}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center rounded-lg border border-line-strong bg-surface">
                  <button type="button" aria-label="Fewer" disabled={!canStep || effectiveK <= MIN_K} onClick={() => setK(Math.max(MIN_K, effectiveK - 1))} className="h-11 w-11 text-lg text-ink-2 disabled:opacity-40">
                    −
                  </button>
                  <output className="w-8 text-center font-medium tabular-nums text-ink">{effectiveK}</output>
                  <button type="button" aria-label="More" disabled={!canStep || effectiveK >= maxK} onClick={() => setK(Math.min(maxK, effectiveK + 1))} className="h-11 w-11 text-lg text-ink-2 disabled:opacity-40">
                    +
                  </button>
                </div>
                <span className="text-ink-2">of {n}</span>
              </div>
            </div>

            {changed && (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-sm text-ink-3">Nothing is saved until you confirm.</p>
                <div className="flex gap-2">
                  <Button
                    variant="quiet"
                    onClick={() => {
                      setStaged([]);
                      setRemovals([]);
                      setK(set.threshold);
                    }}
                  >
                    Discard
                  </Button>
                  <Button onClick={() => setConfirming(true)} disabled={!canStep}>
                    Review and save
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default WitnessesPage;
