import React from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Fingerprint } from '../common/Fingerprint';

/** Red, never silent: this person's key is not the one this account saw before. */
export const KeyChangedCallout: React.FC<{ name: string }> = ({ name }) => (
  <div role="alert" className="flex items-start gap-3 rounded-[10px] bg-danger-soft px-4 py-3.5 text-sm leading-5 text-danger-text">
    <ExclamationTriangleIcon className="h-5 w-5 flex-none" aria-hidden="true" />
    <div className="flex flex-col gap-1">
      <span className="font-semibold">{name} has a new key.</span>
      <span>It changed since you last shared with them. Check the fingerprint with them before you share again.</span>
    </div>
  </div>
);

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export interface ContactKeyProps {
  email: string;
  fingerprint: string;
  verified: boolean;
  onVerifiedChange: (verified: boolean) => void;
  disabled?: boolean;
}

/** The contact's full fingerprint and the "I have checked it with them" switch. */
export const ContactKey: React.FC<ContactKeyProps> = ({ email, fingerprint, verified, onVerifiedChange, disabled = false }) => (
  <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-4">
    <p className="break-all text-sm font-semibold text-ink">{email}</p>
    <Fingerprint value={fingerprint} verified={verified} />
    <p className="text-sm text-ink-2">Compare this with the Key fingerprint shown in their Settings, in person or on a call.</p>
    <label className="flex items-center gap-3 text-sm text-ink">
      <button
        type="button"
        role="switch"
        aria-checked={verified}
        aria-label="Mark as verified in person"
        disabled={disabled}
        onClick={() => onVerifiedChange(!verified)}
        className={`relative h-6 w-10 flex-none rounded-full transition-colors disabled:opacity-50 ${focus} ${verified ? 'bg-accent' : 'bg-line-strong'}`}
      >
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-surface transition-transform ${verified ? 'translate-x-4' : ''}`} />
      </button>
      I have checked it with them
    </label>
  </div>
);
