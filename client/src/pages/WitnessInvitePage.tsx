/**
 * CrypticStorage - Witness invitation (the invited person's side)
 * Reached from an email, so it opens without app chrome. Sign-in sends the visitor back here.
 */

import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckIcon } from '@heroicons/react/24/outline';
import { OneFact } from '../components/common/OneFact';
import { Spinner } from '../components/common/Spinner';
import { PublicFrame } from '../layouts/PublicFrame';
import { toApiError } from '../services/api.service';
import * as WitnessService from '../services/witness.service';
import { useToast } from '../hooks/useToast';

type View = { kind: 'loading' } | { kind: 'ask'; ownerName: string; invitedAt: string } | { kind: 'accepted'; ownerName: string } | { kind: 'closed' } | { kind: 'error'; message: string };

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const primaryLink =
  'inline-flex h-11 w-full items-center justify-center rounded-lg bg-accent px-[18px] text-[15px] font-semibold text-accent-ink hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

const WitnessInvitePage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    WitnessService.invitations()
      .then(({ invitations }) => {
        if (!live) return;
        const found = invitations.find((i) => i.id === id);
        setView(found ? { kind: 'ask', ownerName: found.owner.displayName || found.owner.email, invitedAt: found.invitedAt } : { kind: 'closed' });
      })
      .catch((e) => live && setView({ kind: 'error', message: toApiError(e).message }));
    return () => {
      live = false;
    };
  }, [id]);

  const respond = async (decision: 'accept' | 'decline', ownerName: string) => {
    if (busy) return;
    setBusy(true);
    try {
      if (decision === 'accept') {
        await WitnessService.accept(id);
        setView({ kind: 'accepted', ownerName });
      } else {
        await WitnessService.decline(id);
        toast.info('Invitation declined', `${ownerName} will see that you declined.`);
        navigate('/dashboard', { replace: true });
      }
    } catch (e) {
      toast.error('Could not save your answer', toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  if (view.kind === 'loading') {
    return (
      <PublicFrame>
        <Spinner size="md" color="text-accent" label="Loading…" />
      </PublicFrame>
    );
  }

  if (view.kind === 'ask') {
    const { ownerName, invitedAt } = view;
    return (
      <OneFact
        eyebrow={`Witness invitation · ${formatDate(invitedAt)}`}
        fact={`${ownerName} is asking you to be a witness.`}
        supporting="Together with others they name, you could release their items to the people they chose. You will never be able to read those items yourself unless you are also a recipient."
        action={{ label: 'Accept the duty', onClick: () => void respond('accept', ownerName), disabled: busy }}
        back={() => void respond('decline', ownerName)}
        backLabel="Decline"
        backDisabled={busy}
        cancel={() => navigate('/dashboard')}
        cancelLabel="Decide later"
      />
    );
  }

  if (view.kind === 'accepted') {
    return (
      <PublicFrame>
        <div className="flex flex-col gap-5 pt-8">
          <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-accent-soft text-accent-text">
            <CheckIcon className="h-7 w-7" aria-hidden="true" />
          </span>
          <h1 className="text-2xl font-semibold leading-[30px] tracking-[-.01em] text-ink">You are a witness for {view.ownerName}.</h1>
          <p className="text-ink-2">Nothing is needed from you now. If the time comes, you can request a release from your dashboard.</p>
          <Link to="/dashboard" className={primaryLink}>
            Go to dashboard
          </Link>
        </div>
      </PublicFrame>
    );
  }

  return (
    <PublicFrame>
      <div className="flex flex-col gap-5 pt-8">
        <h1 className="text-2xl font-semibold leading-[30px] tracking-[-.01em] text-ink">
          {view.kind === 'closed' ? 'This invitation is no longer open' : 'We could not load this invitation'}
        </h1>
        <p className="text-ink-2">
          {view.kind === 'closed' ? 'It may have been answered already, or withdrawn by the person who sent it.' : view.message}
        </p>
        <Link to="/dashboard" className={primaryLink}>
          Go to dashboard
        </Link>
      </div>
    </PublicFrame>
  );
};

export default WitnessInvitePage;
