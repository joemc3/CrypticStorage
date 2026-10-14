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
import { toApiError, type WitnessEntry, type WitnessSet } from '../services/api.service';
import * as WitnessService from '../services/witness.service';
import { NO_ACCOUNT_MESSAGE, type ContactLookup } from '../services/witness.service';
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

const WitnessesPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [set, setSet] = useState<WitnessSet | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [k, setK] = useState(MIN_K);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const [email, setEmail] = useState('');
  const [checking, setChecking] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [contact, setContact] = useState<ContactLookup | null>(null);
  const [verified, setVerified] = useState(false);
  const [trusting, setTrusting] = useState(false);
  const [inviting, setInviting] = useState(false);

  const apply = useCallback((next: WitnessSet) => {
    setSet(next);
    setK(next.threshold);
  }, []);

  useEffect(() => {
    let live = true;
    WitnessService.listWitnesses()
      .then((s) => live && apply(s))
      .catch((e) => live && setLoadError(toApiError(e).message));
    return () => {
      live = false;
    };
  }, [apply]);

  const counted = (set?.witnesses ?? []).filter((w) => w.status === 'invited' || w.status === 'accepted');
  const shown = (set?.witnesses ?? []).filter((w) => w.status !== 'removed');
  const n = counted.length;
  const maxK = Math.min(n, set?.maxN ?? n);
  const canStep = maxK >= MIN_K;
  const changed = set !== null && k !== set.threshold;

  const reload = async () => apply(await WitnessService.listWitnesses());

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
      const err = toApiError(e);
      setLookupError(err.statusCode === 404 || err.code === 'NO_ACCOUNT' ? NO_ACCOUNT_MESSAGE : err.message);
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

  const invite = async () => {
    if (!contact) return;
    setInviting(true);
    try {
      await WitnessService.invite(contact.email);
      toast.success(`Invitation sent to ${contact.email}`, 'They count once they accept.');
      resetAdd();
      await reload();
    } catch (e) {
      const err = toApiError(e);
      setLookupError(err.statusCode === 404 || err.code === 'NO_ACCOUNT' ? NO_ACCOUNT_MESSAGE : err.message);
    } finally {
      setInviting(false);
    }
  };

  const removeWitness = async (w: WitnessEntry) => {
    try {
      await WitnessService.remove(w.id);
      await reload();
    } catch (e) {
      toast.error('Could not remove them', toApiError(e).message);
    }
  };

  const saveThreshold = async () => {
    setSaving(true);
    try {
      apply(await WitnessService.setThreshold(k));
      setConfirming(false);
    } catch (e) {
      toast.error('Could not save', toApiError(e).message);
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  };

  if (confirming) {
    return (
      <OneFact
        fact={`Any ${k} of these ${n} people, together, can release everything you have marked for handoff.`}
        action={{ label: 'Save witnesses', onClick: () => void saveThreshold(), disabled: saving }}
        back={() => setConfirming(false)}
      >
        <ul role="list" className="border-t border-line">
          {counted.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-2 border-b border-line py-2.5 text-sm">
              <span className="break-all text-ink">{nameOf(w)}</span>
              <span className="flex-none text-ink-3">{badgeFor[w.status]?.label}</span>
            </li>
          ))}
        </ul>
      </OneFact>
    );
  }

  const blocked = contact !== null && contact.keyChanged && !verified;

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
        {!set && !loadError && <Spinner size="md" color="text-accent" label="Loading…" />}

        {set && (
          <>
            {shown.length > 0 && (
              <RowList>
                {shown.map((w) => {
                  const badge = badgeFor[w.status] ?? badgeFor.invited;
                  return (
                    <ListRow
                      key={w.id}
                      icon={<UserIcon className="h-5 w-5" />}
                      title={nameOf(w)}
                      meta={
                        <span className="flex flex-wrap items-center gap-x-3">
                          {w.user.displayName && <span className="break-all">{w.user.email}</span>}
                          <span className="font-mono">{shortFingerprint(w.user.fingerprint)}</span>
                        </span>
                      }
                      markers={<StateBadge state={badge.state} label={badge.label} />}
                      actions={
                        <button
                          type="button"
                          aria-label={`Remove ${nameOf(w)}`}
                          onClick={() => void removeWitness(w)}
                          className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                        >
                          <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                        </button>
                      }
                    />
                  );
                })}
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
                    <Button onClick={() => void invite()} isLoading={inviting} disabled={blocked}>
                      Invite
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
                  <button type="button" aria-label="Fewer" disabled={!canStep || k <= MIN_K} onClick={() => setK((v) => Math.max(MIN_K, v - 1))} className="h-11 w-11 text-lg text-ink-2 disabled:opacity-40">
                    −
                  </button>
                  <output className="w-8 text-center font-medium tabular-nums text-ink">{k}</output>
                  <button type="button" aria-label="More" disabled={!canStep || k >= maxK} onClick={() => setK((v) => Math.min(maxK, v + 1))} className="h-11 w-11 text-lg text-ink-2 disabled:opacity-40">
                    +
                  </button>
                </div>
                <span className="text-ink-2">of {n}</span>
              </div>
            </div>

            {changed && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="quiet" onClick={() => setK(set.threshold)}>
                  Discard
                </Button>
                <Button onClick={() => setConfirming(true)} disabled={!canStep}>
                  Review and save
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default WitnessesPage;
