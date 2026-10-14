import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StateBadge } from './StateBadge';

describe('StateBadge', () => {
  it.each([
    ['active', 'Active', 'bg-accent-soft'],
    ['warning', 'Warning', 'bg-warn-soft'],
    ['released', 'Released', 'bg-info-soft'],
    ['shared', 'Shared', 'bg-info-soft'],
    ['revoked', 'Revoked', 'text-ink-3'],
    ['pending', 'Pending', 'bg-surface-2'],
  ] as const)('%s defaults to the word %s with its colour', (state, word, cls) => {
    render(<StateBadge state={state} />);
    expect(screen.getByText(word)).toHaveClass(cls);
  });

  it('shows a custom label', () => {
    render(<StateBadge state="released" label="Released by timer" />);
    expect(screen.getByText('Released by timer')).toBeInTheDocument();
  });
});
