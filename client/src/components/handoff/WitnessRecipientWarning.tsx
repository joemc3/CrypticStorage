import React from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

/**
 * Amber callout for a witness who is also a recipient of a rule (design decision 6).
 * Built now and unused until rules exist; the Witnesses page and the rule form will render it.
 */
export const WitnessRecipientWarning: React.FC<{ name: string }> = ({ name }) => (
  <div role="note" className="flex items-start gap-3 rounded-[10px] bg-warn-soft px-4 py-3.5 text-sm leading-5 text-warn-text">
    <ExclamationTriangleIcon className="h-5 w-5 flex-none" aria-hidden="true" />
    <span>{name} is also a recipient of one of your rules. They would hold both a share of the release and the destination.</span>
  </div>
);
