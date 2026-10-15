import React from 'react';
import type { ReleasePerson, ReleaseRequest } from '../../services/api.service';
import { awaitingRepair, type WitnessCard } from '../../services/release.service';
import { Button } from '../common/Button';
import { StateBadge } from '../common/StateBadge';
import { formatDayTime, personName } from './format';

const heading = 'font-sans text-lg font-semibold leading-6 text-ink';

/** The amber bar and its count: how far the request is from the owner's threshold. */
export const VoteBar: React.FC<{ votes: number; required: number }> = ({ votes, required }) => (
  <div className="flex items-center gap-2">
    <div
      role="progressbar"
      aria-label="Votes"
      aria-valuemin={0}
      aria-valuemax={required}
      aria-valuenow={Math.min(votes, required)}
      className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2"
    >
      <span className="block h-full rounded-full bg-warn-text" style={{ width: `${Math.min(100, (votes / Math.max(required, 1)) * 100)}%` }} />
    </div>
    <span className="whitespace-nowrap text-xs text-ink-2">{`${votes} of ${required} votes`}</span>
  </div>
);

const closedLine = (r: ReleaseRequest) =>
  r.state === 'completed' ? `Released ${formatDayTime(r.closedAt)}` : `Cancelled ${formatDayTime(r.closedAt)}`;

const Card: React.FC<{
  card: WitnessCard;
  meId?: string;
  onOpen: (owner: ReleasePerson) => void;
  onVote: (request: ReleaseRequest) => void;
}> = ({ card, meId, onOpen, onVote }) => {
  const { owner, open, closed } = card;
  const name = personName(owner);
  const repairing = open ? awaitingRepair(open) : false;
  return (
    <section aria-label={`Witness for ${name}`} className={`flex flex-col gap-4 rounded-xl border bg-surface p-5 ${open ? 'border-warn-line' : 'border-line'}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 break-words text-base font-semibold leading-[22px] text-ink">{name}</h3>
        {open && <span className="flex-none"><StateBadge state="warning" label="Request open" /></span>}
      </div>

      {open ? (
        <>
          <p className="text-sm text-ink-2">{`Opened by ${personName(open.openedBy)} · ${formatDayTime(open.openedAt)}`}</p>
          <ul className="flex flex-col gap-2 text-sm text-ink" aria-label="Who has voted">
            {open.votes.map((v) => (
              <li key={v.witnessUserId} className="flex items-center justify-between gap-2">
                <span className="min-w-0 break-words">{v.witnessUserId === meId ? 'You' : v.displayName || v.email}</span>
                <StateBadge state="active" label="Voted" />
              </li>
            ))}
            {!open.myVote && (
              <li className="flex items-center justify-between gap-2">
                <span>You</span>
                <StateBadge state="pending" label="Not yet" />
              </li>
            )}
          </ul>
          <VoteBar votes={open.votes.length} required={open.requiredVotes} />
          {!open.myVote && (
            <div className="flex flex-col items-start gap-2">
              <Button onClick={() => onVote(open)} disabled={repairing}>
                Add your vote
              </Button>
              {repairing && <p className="text-xs text-ink-3">{`${name} has to repair their rules before a vote can count. Try again later.`}</p>}
            </div>
          )}
          <p className="text-xs text-ink-3">{`If ${name} signs in, the request is cancelled.`}</p>
        </>
      ) : (
        <>
          <p className="text-sm text-ink-2">No release request is open.</p>
          <Button variant="secondary" className="self-start" onClick={() => onOpen(owner)}>
            Open a release request
          </Button>
        </>
      )}

      {closed.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-line pt-3 text-xs text-ink-3" aria-label="Earlier requests">
          {closed.slice(0, 3).map((r) => (
            <li key={r.id}>{closedLine(r)}</li>
          ))}
        </ul>
      )}
    </section>
  );
};

/** C6 on the witness's dashboard: one card per owner they serve. Draws nothing for a person who serves nobody. */
export const WitnessForSection: React.FC<{
  cards: WitnessCard[];
  meId?: string;
  onOpen: (owner: ReleasePerson) => void;
  onVote: (request: ReleaseRequest) => void;
}> = ({ cards, meId, onOpen, onVote }) => {
  if (cards.length === 0) return null;
  return (
    <section aria-label="You are a witness for" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className={heading}>You are a witness for</h2>
        <p className="text-sm text-ink-2">You cannot read their items. You can, with others, release them to the people they chose.</p>
      </div>
      <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))' }}>
        {cards.map((card) => (
          <Card key={card.owner.id} card={card} meId={meId} onOpen={onOpen} onVote={onVote} />
        ))}
      </div>
    </section>
  );
};
