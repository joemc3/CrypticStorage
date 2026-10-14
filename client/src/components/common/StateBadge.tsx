import React from 'react';

export type BadgeState = 'active' | 'warning' | 'released' | 'revoked' | 'shared' | 'pending';

export interface StateBadgeProps {
  state: BadgeState;
  label?: string;
}

const styles: Record<BadgeState, { word: string; cls: string }> = {
  active: { word: 'Active', cls: 'bg-accent-soft text-accent-text' },
  warning: { word: 'Warning', cls: 'bg-warn-soft text-warn-text' },
  released: { word: 'Released', cls: 'bg-info-soft text-info-text' },
  shared: { word: 'Shared', cls: 'bg-info-soft text-info-text' },
  // Outlined with a hollow dot, so it is told apart from the filled states without relying on colour.
  revoked: { word: 'Revoked', cls: 'text-ink-3 ring-1 ring-inset ring-line-strong before:bg-transparent before:ring-[1.5px] before:ring-inset before:ring-current' },
  pending: { word: 'Pending', cls: 'bg-surface-2 text-ink-2 ring-1 ring-inset ring-line-strong' },
};

/** A dot plus a word. Colour never carries the meaning alone. */
export const StateBadge: React.FC<StateBadgeProps> = ({ state, label }) => (
  <span
    className={`inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-[5px] px-2 text-xs font-semibold leading-none before:h-1.5 before:w-1.5 before:flex-none before:rounded-full before:bg-current before:content-[''] ${styles[state].cls}`}
  >
    {label ?? styles[state].word}
  </span>
);
