import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ApiService, { type WitnessEntry, type WitnessSet } from '../services/api.service';
import { useUIStore } from '../stores/ui.store';
import WitnessesPage from './WitnessesPage';

vi.mock('../layouts/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const fp = (c: string) => c.repeat(64);
function entry(id: string, email: string, status: WitnessEntry['status']): WitnessEntry {
  return { id, status, invitedAt: '2026-10-01T00:00:00.000Z', respondedAt: null, user: { id: `u-${id}`, email, displayName: null, publicKey: 'K', fingerprint: fp('9') } };
}
function set(threshold: number, witnesses: WitnessEntry[]): WitnessSet {
  return { threshold, minN: 2, maxN: 7, witnesses };
}
const three = [entry('w1', 'priya@x.co', 'accepted'), entry('w2', 'tom@x.co', 'accepted'), entry('w3', 'lena@x.co', 'invited')];

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <WitnessesPage />
    </MemoryRouter>
  );
}

describe('WitnessesPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useUIStore.setState({ toasts: [] });
  });

  it('lists the set with status and the start of each fingerprint', async () => {
    vi.spyOn(ApiService, 'getWitnesses').mockResolvedValue(set(2, three));
    renderPage();
    expect(await screen.findByText('priya@x.co')).toBeInTheDocument();
    expect(screen.getAllByText('Accepted')).toHaveLength(2);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getAllByText('9999 9999 9999 9999 …')).toHaveLength(3);
    expect(screen.getByText('of 3')).toBeInTheDocument();
  });

  it('does not let the threshold go above the number of witnesses or below two', async () => {
    vi.spyOn(ApiService, 'getWitnesses').mockResolvedValue(set(3, three));
    renderPage();
    await screen.findByText('priya@x.co');
    expect(screen.getByRole('button', { name: 'More' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Fewer' }));
    expect(screen.getByRole('status')).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: 'Fewer' })).toBeDisabled();
  });

  it('asks with the verbatim sentence and the people, then saves the new threshold', async () => {
    vi.spyOn(ApiService, 'getWitnesses').mockResolvedValue(set(2, three));
    const save = vi.spyOn(ApiService, 'setWitnessThreshold').mockResolvedValue({ ...set(3, three), activeRules: [] });
    renderPage();
    await screen.findByText('priya@x.co');
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review and save' }));

    expect(await screen.findByRole('heading', { name: 'Any 3 of these 3 people, together, can release everything you have marked for handoff.' })).toBeInTheDocument();
    for (const email of ['priya@x.co', 'tom@x.co', 'lena@x.co']) expect(screen.getByText(email)).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save witnesses' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(3));
    expect(await screen.findByText('Release needs')).toBeInTheDocument();
  });

  it('shows the key and invites only after the person has seen it', async () => {
    vi.spyOn(ApiService, 'getWitnesses').mockResolvedValue(set(2, three));
    vi.spyOn(ApiService, 'getPublicKey').mockResolvedValue({ id: 'u9', email: 'new@x.co', publicKey: 'K', fingerprint: fp('a'), trust: null });
    vi.spyOn(ApiService, 'markContactSeen').mockResolvedValue({} as never);
    const inviteSpy = vi.spyOn(ApiService, 'inviteWitness').mockResolvedValue(entry('w4', 'new@x.co', 'invited'));
    const { default: CryptoService } = await import('../services/crypto.service');
    vi.spyOn(CryptoService, 'publicKeyFingerprint').mockResolvedValue('aaaa '.repeat(8).trim());
    renderPage();
    await screen.findByText('priya@x.co');
    fireEvent.change(screen.getByLabelText('Add a witness by email'), { target: { value: 'new@x.co' } });
    expect(inviteSpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Check key' }));
    expect(await screen.findByLabelText(/^Key fingerprint AAAA/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));
    await waitFor(() => expect(inviteSpy).toHaveBeenCalledWith('new@x.co'));
  });

  it('draws the red callout when the key changed and holds the invitation until it is re-trusted', async () => {
    vi.spyOn(ApiService, 'getWitnesses').mockResolvedValue(set(2, three));
    vi.spyOn(ApiService, 'getPublicKey').mockResolvedValue({
      id: 'u9', email: 'new@x.co', publicKey: 'K', fingerprint: fp('a'),
      trust: { fingerprint: fp('b'), verifiedInPerson: true, firstSeenAt: 'a', lastSeenAt: 'b' },
    });
    const seen = vi.spyOn(ApiService, 'markContactSeen').mockResolvedValue({} as never);
    const trust = vi.spyOn(ApiService, 'setContactTrust').mockResolvedValue({} as never);
    const { default: CryptoService } = await import('../services/crypto.service');
    vi.spyOn(CryptoService, 'publicKeyFingerprint').mockResolvedValue('aaaa '.repeat(8).trim());
    renderPage();
    await screen.findByText('priya@x.co');
    fireEvent.change(screen.getByLabelText('Add a witness by email'), { target: { value: 'new@x.co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check key' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('new@x.co has a new key.');
    expect(seen).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Invite' })).toBeDisabled();
    fireEvent.click(screen.getByRole('switch', { name: 'Mark as verified in person' }));
    await waitFor(() => expect(trust).toHaveBeenCalledWith('u9', true));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Invite' })).toBeEnabled());
    expect(within(document.body).queryByRole('alert')).toBeNull();
  });

  it('says plainly when the email has no verified account', async () => {
    vi.spyOn(ApiService, 'getWitnesses').mockResolvedValue(set(2, three));
    vi.spyOn(ApiService, 'getPublicKey').mockRejectedValue({ message: 'No user', statusCode: 404, code: 'NO_ACCOUNT' });
    renderPage();
    await screen.findByText('priya@x.co');
    fireEvent.change(screen.getByLabelText('Add a witness by email'), { target: { value: 'nobody@x.co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check key' }));
    expect(await screen.findByText('No account with that email, or it is not verified yet.')).toBeInTheDocument();
  });
});
