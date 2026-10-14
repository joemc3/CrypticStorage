import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ShareDialog } from './ShareDialog';

// Headless UI's Dialog observes its panel; jsdom has no ResizeObserver.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const file = { id: 'f1', name: 'House deed scan.jpg' };
const base = { isOpen: true, onClose: () => {}, file, onCreateShare: vi.fn() };

describe('ShareDialog', () => {
  it('shows only the link form when there is no user share handler', () => {
    render(<ShareDialog {...base} />);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByRole('button', { name: 'Create link' })).toBeInTheDocument();
  });

  it('looks up a key, shows its fingerprint, and shares', async () => {
    const onLookupRecipient = vi.fn().mockResolvedValue({ email: 'sam@example.com', publicKey: 'SPKI-B64', fingerprint: '3c61e0f79a24b1d87f3a91c20b4ed58a' });
    const onShareWithUser = vi.fn().mockResolvedValue(undefined);
    render(<ShareDialog {...base} onLookupRecipient={onLookupRecipient} onShareWithUser={onShareWithUser} />);

    expect(screen.getByRole('tab', { name: 'With a person' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Their account email'), { target: { value: 'sam@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check key' }));
    expect(await screen.findByLabelText('Key fingerprint 3C61 E0F7 9A24 B1D8 7F3A 91C2 0B4E D58A')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'Mark as verified in person' }));
    expect(screen.getByText('Verified')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(onShareWithUser).toHaveBeenCalledWith('sam@example.com', 'SPKI-B64'));
  });

  it('draws the key-changed callout only when told a key changed', () => {
    const handlers = { onLookupRecipient: vi.fn(), onShareWithUser: vi.fn() };
    const { rerender } = render(<ShareDialog {...base} {...handlers} />);
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(<ShareDialog {...base} {...handlers} keyChangedFor="sam@example.com" />);
    expect(screen.getByRole('alert')).toHaveTextContent('sam@example.com has a new key.');
  });

  it('creates a link with the chosen options', async () => {
    const onCreateShare = vi.fn().mockResolvedValue({ id: 's1', url: 'https://x/s/abc', createdAt: new Date(), downloadCount: 0, maxDownloads: 3, password: true });
    render(<ShareDialog {...base} onCreateShare={onCreateShare} />);
    fireEvent.change(screen.getByLabelText('Password (optional)'), { target: { value: 'harbour-9' } });
    fireEvent.click(screen.getByRole('button', { name: '1 day' }));
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    await waitFor(() => expect(onCreateShare).toHaveBeenCalledTimes(1));
    const options = onCreateShare.mock.calls[0]![0];
    expect(options).toMatchObject({ fileId: 'f1', password: 'harbour-9', maxDownloads: 3 });
    expect(options.expiresAt).toBeInstanceOf(Date);
    expect(await screen.findByDisplayValue('https://x/s/abc')).toBeInTheDocument();
    expect(screen.getByText(/Anyone with this URL can open the file/)).toBeInTheDocument();
  });
});
