import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AuthService from '../services/auth.service';
import { useUIStore } from '../stores/ui.store';
import LoginPage from './LoginPage';

describe('LoginPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useUIStore.setState({ toasts: [] });
  });

  it('shows check-your-email, with no error toast, for an unverified account', async () => {
    vi.spyOn(AuthService, 'login').mockRejectedValue(Object.assign(new Error('Verify your email'), { code: 'EMAIL_UNVERIFIED' }));
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <LoginPage />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByPlaceholderText('Your password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resend the email' })).toBeInTheDocument();
    expect(useUIStore.getState().toasts).toHaveLength(0);
  });
});
