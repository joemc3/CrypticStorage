import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ApiService, { type HandoffRule, type WitnessEntry, type WitnessSet } from '../services/api.service';
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
    vi.spyOn(ApiService, 'listHandoffRules').mockResolvedValue([]);
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

  it('stages an invitation and a removal, makes no call until the confirmation, then calls in order', async () => {
    vi.spyOn(ApiService, 'getWitnesses').mockResolvedValue(set(2, three));
    vi.spyOn(ApiService, 'getPublicKey').mockResolvedValue({ id: 'u9', email: 'new@x.co', publicKey: 'K', fingerprint: fp('a'), trust: null });
    vi.spyOn(ApiService, 'markContactSeen').mockResolvedValue({} as never);
    const calls: string[] = [];
    const inviteSpy = vi.spyOn(ApiService, 'inviteWitness').mockImplementation(async () => { calls.push('invite'); return entry('w4', 'new@x.co', 'invited'); });
    const removeSpy = vi.spyOn(ApiService, 'removeWitness').mockImplementation(async () => { calls.push('remove'); return { threshold: 2, activeRules: [] }; });
    const thresholdSpy = vi.spyOn(ApiService, 'setWitnessThreshold').mockImplementation(async () => { calls.push('threshold'); return { ...set(3, three), activeRules: [] }; });
    const { default: CryptoService } = await import('../services/crypto.service');
    vi.spyOn(CryptoService, 'publicKeyFingerprint').mockResolvedValue('aaaa '.repeat(8).trim());
    renderPage();
    await screen.findByText('priya@x.co');

    fireEvent.change(screen.getByLabelText('Add a witness by email'), { target: { value: 'new@x.co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check key' }));
    expect(await screen.findByLabelText(/^Key fingerprint AAAA/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('New · invited when you save')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove lena@x.co' }));
    expect(screen.getByText('Will be removed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(inviteSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Review and save' }));
    // Resulting set: priya, tom, new = 3 people, k raised to 3.
    expect(await screen.findByRole('heading', { name: 'Any 3 of these 3 people, together, can release everything you have marked for handoff.' })).toBeInTheDocument();
    expect(screen.getByText('new@x.co')).toBeInTheDocument();
    expect(screen.getByText('Invitation pending')).toBeInTheDocument();
    expect(screen.queryByText('lena@x.co')).toBeNull();
    expect(inviteSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save witnesses' }));
    await waitFor(() => expect(thresholdSpy).toHaveBeenCalledWith(3));
    expect(removeSpy).toHaveBeenCalledWith('w3');
    expect(inviteSpy).toHaveBeenCalledWith('new@x.co');
    expect(calls).toEqual(['remove', 'invite', 'threshold']);
  });

  it('undoes a staged removal and bounds the threshold by the resulting number', async () => {
    vi.spyOn(ApiService, 'getWitnesses').mockResolvedValue(set(3, three));
    const removeSpy = vi.spyOn(ApiService, 'removeWitness');
    renderPage();
    await screen.findByText('priya@x.co');
    fireEvent.click(screen.getByRole('button', { name: 'Remove tom@x.co' }));
    expect(screen.getByText('of 2')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('2');
    fireEvent.click(screen.getByRole('button', { name: 'Keep tom@x.co' }));
    expect(screen.getByText('of 3')).toBeInTheDocument();
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it('reports a partial failure plainly', async () => {
    vi.spyOn(ApiService, 'getWitnesses').mockResolvedValue(set(2, three));
    vi.spyOn(ApiService, 'removeWitness').mockRejectedValue({ message: 'Nope', statusCode: 500 });
    renderPage();
    await screen.findByText('priya@x.co');
    fireEvent.click(screen.getByRole('button', { name: 'Remove lena@x.co' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review and save' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save witnesses' }));
    expect(await screen.findByText('Some changes did not go through.')).toBeInTheDocument();
    expect(screen.getByText('Could not remove lena@x.co: Nope')).toBeInTheDocument();
  });

  it('draws the red callout when the key changed and holds the add until it is re-trusted', async () => {
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
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    fireEvent.click(screen.getByRole('switch', { name: 'Mark as verified in person' }));
    await waitFor(() => expect(trust).toHaveBeenCalledWith('u9', true));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled());
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

  describe('a witness who is also a recipient (decision 6)', () => {
    const openRule = (recipientUserIds: string[], state: HandoffRule['state'] = 'active'): HandoffRule => ({
      id: `r-${recipientUserIds.join('-')}-${state}`, fileId: 'f', periodDays: 30, state, createdAt: '', nextCheckInAt: null, warningAt: null, sharesStale: false, coverageGaps: 0,
      recipients: recipientUserIds.map((userId) => ({ userId, email: `${userId}@x.co`, displayName: null, notifiedAt: null })),
    });
    const warning = /also receives one of your rules/;

    it('warns at the row and in the confirmation for an existing witness who receives an open rule, and for nobody else', async () => {
      vi.spyOn(ApiService, 'getWitnesses').mockResolvedValue(set(2, three));
      // priya receives an open rule; tom only a revoked one.
      vi.spyOn(ApiService, 'listHandoffRules').mockResolvedValue([openRule(['u-w1']), openRule(['u-w2'], 'revoked')]);
      renderPage();
      await screen.findByText('priya@x.co');
      await waitFor(() => expect(screen.getAllByText(warning)).toHaveLength(1));
      expect(screen.getByRole('note')).toHaveTextContent('priya@x.co also receives one of your rules.');

      fireEvent.click(screen.getByRole('button', { name: 'More' }));
      fireEvent.click(screen.getByRole('button', { name: 'Review and save' }));
      await screen.findByRole('heading', { name: /Any 3 of these 3 people/ });
      expect(screen.getAllByRole('note')).toHaveLength(1);
      expect(screen.getByRole('note')).toHaveTextContent('priya@x.co also receives');
    });

    it('warns for a staged witness who is a recipient', async () => {
      vi.spyOn(ApiService, 'getWitnesses').mockResolvedValue(set(2, three));
      vi.spyOn(ApiService, 'listHandoffRules').mockResolvedValue([openRule(['u9'])]);
      vi.spyOn(ApiService, 'getPublicKey').mockResolvedValue({ id: 'u9', email: 'new@x.co', publicKey: 'K', fingerprint: fp('a'), trust: null });
      vi.spyOn(ApiService, 'markContactSeen').mockResolvedValue({} as never);
      const { default: CryptoService } = await import('../services/crypto.service');
      vi.spyOn(CryptoService, 'publicKeyFingerprint').mockResolvedValue('aaaa '.repeat(8).trim());
      renderPage();
      await screen.findByText('priya@x.co');
      expect(screen.queryByText(warning)).toBeNull();
      fireEvent.change(screen.getByLabelText('Add a witness by email'), { target: { value: 'new@x.co' } });
      fireEvent.click(screen.getByRole('button', { name: 'Check key' }));
      await screen.findByLabelText(/^Key fingerprint AAAA/);
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      expect(screen.getByRole('note')).toHaveTextContent('new@x.co also receives one of your rules.');
      fireEvent.click(screen.getByRole('button', { name: 'Review and save' }));
      await screen.findByRole('heading', { name: /Any 2 of these 4 people/ });
      expect(screen.getByRole('note')).toHaveTextContent('new@x.co also receives');
    });
  });

  describe('resending an invitation', () => {
    it('offers Resend on invited rows only, and sends it', async () => {
      vi.spyOn(ApiService, 'getWitnesses').mockResolvedValue(set(2, three));
      const resend = vi.spyOn(ApiService, 'resendWitnessInvitation').mockResolvedValue(three[2]!);
      renderPage();
      await screen.findByText('priya@x.co');
      expect(screen.queryByRole('button', { name: 'Resend the invitation to priya@x.co' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Resend the invitation to tom@x.co' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Resend the invitation to lena@x.co' }));
      await waitFor(() => expect(resend).toHaveBeenCalledWith('w3'));
      await waitFor(() => expect(useUIStore.getState().toasts.some((t) => t.type === 'success' && t.message === 'Invitation sent again')).toBe(true));
    });

    it('says so when the invitation could not be sent', async () => {
      vi.spyOn(ApiService, 'getWitnesses').mockResolvedValue(set(2, three));
      vi.spyOn(ApiService, 'resendWitnessInvitation').mockRejectedValue({ message: 'The invitation could not be sent. Try again later.', statusCode: 502, code: 'MAIL_FAILED' });
      renderPage();
      await screen.findByText('lena@x.co');
      fireEvent.click(screen.getByRole('button', { name: 'Resend the invitation to lena@x.co' }));
      await waitFor(() => expect(useUIStore.getState().toasts.some((t) => t.type === 'error')).toBe(true));
    });
  });
});
