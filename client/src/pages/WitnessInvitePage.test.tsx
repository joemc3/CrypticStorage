import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ApiService from '../services/api.service';
import { useUIStore } from '../stores/ui.store';
import WitnessInvitePage from './WitnessInvitePage';

const owner = { id: 'o1', email: 'r.okafor@gmail.com', displayName: null };

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/witness/${id}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/witness/:id" element={<WitnessInvitePage />} />
        <Route path="/dashboard" element={<p>Dashboard</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('WitnessInvitePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useUIStore.setState({ toasts: [] });
    vi.spyOn(ApiService, 'getWitnessInvitations').mockResolvedValue({ invitations: [{ id: 'inv1', owner, invitedAt: '2026-10-13T00:00:00.000Z' }], serving: [] });
  });

  it('states the duty, then accepts and confirms calmly', async () => {
    const accept = vi.spyOn(ApiService, 'acceptWitnessInvitation').mockResolvedValue({} as never);
    renderAt('inv1');
    expect(await screen.findByRole('heading', { name: 'r.okafor@gmail.com is asking you to be a witness.' })).toBeInTheDocument();
    expect(screen.getByText('Together with others they name, you could release their items to the people they chose. You will never be able to read those items yourself unless you are also a recipient.')).toBeInTheDocument();
    expect(accept).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Accept the duty' }));
    await waitFor(() => expect(accept).toHaveBeenCalledWith('inv1'));
    expect(await screen.findByText('Nothing to do now. If a release is ever requested, the button will be on your dashboard.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Done' })).toHaveAttribute('href', '/dashboard');
  });

  it('declines and goes to the dashboard', async () => {
    const decline = vi.spyOn(ApiService, 'declineWitnessInvitation').mockResolvedValue({} as never);
    renderAt('inv1');
    fireEvent.click(await screen.findByRole('button', { name: 'Decline' }));
    await waitFor(() => expect(decline).toHaveBeenCalledWith('inv1'));
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
  });

  it('Decide later leaves without answering', async () => {
    const accept = vi.spyOn(ApiService, 'acceptWitnessInvitation');
    const decline = vi.spyOn(ApiService, 'declineWitnessInvitation');
    renderAt('inv1');
    fireEvent.click(await screen.findByRole('button', { name: 'Decide later' }));
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
    expect(accept).not.toHaveBeenCalled();
    expect(decline).not.toHaveBeenCalled();
  });

  it('says plainly when the invitation is not among the open ones', async () => {
    renderAt('gone');
    expect(await screen.findByRole('heading', { name: 'This invitation is no longer open' })).toBeInTheDocument();
  });
});
