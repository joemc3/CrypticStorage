import React from 'react';
import { StateBadge } from './StateBadge';

export interface FingerprintProps {
  /** Hex digits, with or without spaces. */
  value: string;
  verified?: boolean;
}

/** A key fingerprint in mono, eight groups of four in a grid, so two people can read it aloud and compare. */
export const Fingerprint: React.FC<FingerprintProps> = ({ value, verified = false }) => {
  const groups = value.replace(/\s+/g, '').toUpperCase().match(/.{1,4}/g) ?? [];
  return (
    <div className="flex flex-col items-start gap-3">
      <div
        role="group"
        aria-label={`Key fingerprint ${groups.join(' ')}`}
        className="grid grid-cols-[repeat(4,max-content)] gap-x-3.5 gap-y-1 font-mono text-sm font-medium leading-[22px] tracking-[0.06em] text-ink"
      >
        {groups.map((g, i) => (
          <span key={i}>{g}</span>
        ))}
      </div>
      {verified && <StateBadge state="active" label="Verified" />}
    </div>
  );
};
