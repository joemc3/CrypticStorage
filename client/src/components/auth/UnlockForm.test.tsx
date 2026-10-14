import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UnlockForm } from './UnlockForm';

describe('UnlockForm', () => {
  it('states the consequence in serif, shows the email and the lock line', () => {
    render(<UnlockForm email="m.hale@fastmail.com" onUnlock={vi.fn()} lockAfterMinutes={7} />);
    const heading = screen.getByRole('heading', { name: 'Your safe is locked.' });
    expect(heading.className).toContain('font-serif');
    expect(screen.getByText('m.hale@fastmail.com')).toBeInTheDocument();
    expect(
      screen.getByText('Locks after 7 minutes idle and when you close the tab. Unlocking works offline.')
    ).toBeInTheDocument();
  });

  it('calls onUnlock with the typed password', async () => {
    const onUnlock = vi.fn().mockResolvedValue(undefined);
    render(<UnlockForm email="m.hale@fastmail.com" onUnlock={onUnlock} />);
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'lantern-orchard' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(onUnlock).toHaveBeenCalledWith('lantern-orchard'));
  });
});
