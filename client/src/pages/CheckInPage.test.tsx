import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ApiService from '../services/api.service';
import CheckInPage from './CheckInPage';

const tree = (
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/check-in/tok123']}>
    <Routes>
      <Route path="/check-in/:token" element={<CheckInPage />} />
    </Routes>
  </MemoryRouter>
);

describe('CheckInPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resets the clock from the link and says nothing else is needed', async () => {
    const spy = vi.spyOn(ApiService, 'checkIn').mockResolvedValue({ ok: true });
    render(tree);
    expect(await screen.findByRole('heading', { name: 'Your clock is reset.' })).toBeInTheDocument();
    expect(screen.getByText('Nothing else is needed.')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith('tok123');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('says the link is invalid or expired, and still offers sign in', async () => {
    vi.spyOn(ApiService, 'checkIn').mockRejectedValue(new Error('gone'));
    render(tree);
    expect(await screen.findByRole('heading', { name: 'This link is invalid or has expired.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('uses the token once under StrictMode', async () => {
    const spy = vi.spyOn(ApiService, 'checkIn').mockResolvedValue({ ok: true });
    render(<React.StrictMode>{tree}</React.StrictMode>);
    await screen.findByRole('heading', { name: 'Your clock is reset.' });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
