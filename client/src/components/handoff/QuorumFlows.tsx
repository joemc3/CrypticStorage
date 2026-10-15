import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { OneFact } from '../common/OneFact';
import type { ReleasePerson, ReleaseRequest } from '../../services/api.service';
import { toApiError } from '../../services/api.service';
import { openRequest, vote } from '../../services/release.service';
import { useToast } from '../../hooks/useToast';
import { personName } from './format';

export type QuorumIntent = { kind: 'open'; owner: ReleasePerson } | { kind: 'vote'; request: ReleaseRequest };

/** Full screen over the app chrome, because an irreversible act gets nothing but its sentence (decision 4). */
const FullScreen: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  createPortal(<div className="fixed inset-0 z-[70] overflow-y-auto bg-bg">{children}</div>, document.body);

const messageOf = (error: unknown) => (error instanceof Error ? error.message : toApiError(error).message);

/** Open a release request, or add a vote to one, each as a full-screen one-fact page. */
export const QuorumFlows: React.FC<{ intent: QuorumIntent | null; onClose: () => void; onChanged: () => void }> = ({ intent, onClose, onChanged }) =>
  // Closing sets the intent to null, so each opening mounts afresh with nothing carried over.
  intent ? <Flow intent={intent} onClose={onClose} onChanged={onChanged} /> : null;

const Flow: React.FC<{ intent: QuorumIntent; onClose: () => void; onChanged: () => void }> = ({ intent, onClose, onChanged }) => {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const owner = intent.kind === 'open' ? intent.owner : intent.request.owner;
  const name = personName(owner);

  const open = async () => {
    if (intent.kind !== 'open') return;
    setBusy(true);
    try {
      await openRequest(intent.owner.id);
      toast.success('The request is open.', `${name} and the other witnesses have been told.`);
      onChanged();
      onClose();
    } catch (error) {
      toast.error('Could not open the request', messageOf(error));
      setBusy(false);
    }
  };

  const addVote = async () => {
    if (intent.kind !== 'vote') return;
    setBusy(true);
    try {
      const result = await vote(intent.request);
      onChanged();
      if (result.state === 'completed') {
        setDone(true);
        setBusy(false);
        return;
      }
      toast.success(`Your vote is in. ${result.votes.length} of ${result.requiredVotes}.`);
      onClose();
    } catch (error) {
      toast.error('Could not add your vote', messageOf(error));
      setBusy(false);
    }
  };

  if (done) {
    return (
      <FullScreen>
        <OneFact fact={`The items have gone to the people ${name} chose.`} action={{ label: 'Back to the dashboard', onClick: onClose }} />
      </FullScreen>
    );
  }

  if (intent.kind === 'open') {
    return (
      <FullScreen>
        <OneFact
          eyebrow="Witness · open a release request"
          fact={`You are asking to release ${name}'s items now.`}
          supporting={`${name} and the other witnesses will be told. If ${name} signs in, the request is cancelled.`}
          action={{ label: 'Open the request', onClick: () => void open(), disabled: busy }}
          back={onClose}
          backLabel="Not now"
          backDisabled={busy}
        />
      </FullScreen>
    );
  }

  const { request } = intent;
  return (
    <FullScreen>
      <OneFact
        eyebrow={`Witness · vote ${request.votes.length + 1} of ${request.requiredVotes}`}
        fact={`Add your vote to release ${name}'s items.`}
        supporting={`Once ${request.requiredVotes} votes are in, the items go to the people ${name} chose. This cannot be undone.`}
        action={{ label: 'Add my vote', onClick: () => void addVote(), disabled: busy, danger: true }}
        back={onClose}
        backLabel="Not now"
        backDisabled={busy}
      />
    </FullScreen>
  );
};
