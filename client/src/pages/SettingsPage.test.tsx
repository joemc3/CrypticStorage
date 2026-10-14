import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ApiService from '../services/api.service';
import AuthService from '../services/auth.service';
import { useAuthStore } from '../stores/auth.store';
import { useUIStore } from '../stores/ui.store';
import SettingsPage from './SettingsPage';

vi.mock('../layouts/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../components/auth/TwoFactorSettings', () => ({ TwoFactorSettings: () => null }));

const user = {
  id: 'u1',
  email: 'a@b.co',
  displayName: null,
  lockAfterMinutes: 5,
  emailVerifiedAt: '2026-10-14T00:00:00.000Z',
  createdAt: '2026-10-14T00:00:00.000Z',
  storageUsed: 0,
  storageLimit: 1000,
} as never;

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SettingsPage />
    </MemoryRouter>
  );
}

describe('SettingsPage: Lock and look', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(ApiService, 'getStorageStats').mockResolvedValue({ used: 0, limit: 1000, fileCount: 0, folderCount: 0 } as never);
    useAuthStore.setState({ user, status: 'unlocked' });
    useUIStore.setState({ toasts: [], theme: 'system' });
  });

  it('saves the lock period straight away', async () => {
    const update = vi.spyOn(ApiService, 'updateProfile').mockResolvedValue({ lockAfterMinutes: 10 } as never);
    vi.spyOn(AuthService, 'refreshProfile').mockResolvedValue({ ...(user as object), lockAfterMinutes: 10 } as never);
    renderPage();
    fireEvent.change(screen.getByLabelText('Lock after'), { target: { value: '10' } });
    await waitFor(() => expect(update).toHaveBeenCalledWith({ lockAfterMinutes: 10 }));
    await waitFor(() => expect(useAuthStore.getState().user?.lockAfterMinutes).toBe(10));
  });

  it('saves the display name', async () => {
    const update = vi.spyOn(ApiService, 'updateProfile').mockResolvedValue({} as never);
    vi.spyOn(AuthService, 'refreshProfile').mockResolvedValue(user);
    renderPage();
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Mara' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ displayName: 'Mara' }));
  });

  it('sets the theme on the page', () => {
    renderPage();
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    fireEvent.click(screen.getByRole('radio', { name: 'System' }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
