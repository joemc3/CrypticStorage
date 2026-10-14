import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ApiService from '../services/api.service';
import VerifyPage from './VerifyPage';

const renderPage = () =>
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/verify/tok123']}>
      <Routes>
        <Route path="/verify/:token" element={<VerifyPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('VerifyPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('confirms the email on success', async () => {
    const spy = vi.spyOn(ApiService, 'verifyEmail').mockResolvedValue({ email: 'm.hale@fastmail.com' });
    renderPage();
    expect(await screen.findByText('Your email is verified.')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith('tok123');
    expect(screen.getByText(/m\.hale@fastmail\.com/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('offers a new link on failure', async () => {
    vi.spyOn(ApiService, 'verifyEmail').mockRejectedValue(new Error('nope'));
    const resend = vi.spyOn(ApiService, 'resendVerification').mockResolvedValue(undefined);
    renderPage();
    expect(await screen.findByText('This link has expired or was already used.')).toBeInTheDocument();
    const field = screen.getByLabelText('Your email');
    expect(field).toBeInTheDocument();
    fireEvent.change(field, { target: { value: 'a@b.co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send a new link' }));
    await waitFor(() => expect(resend).toHaveBeenCalledWith('a@b.co'));
    expect(await screen.findByText(/new link is on its way/i)).toBeInTheDocument();
  });
});
