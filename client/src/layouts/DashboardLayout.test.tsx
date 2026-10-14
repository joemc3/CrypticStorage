import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';
import { DashboardLayout } from './DashboardLayout';

const user = {
  id: 'u1',
  email: 'a@b.co',
  displayName: 'Mara',
  lockAfterMinutes: 5,
  emailVerifiedAt: '2026-10-14T00:00:00.000Z',
  createdAt: '2026-10-14T00:00:00.000Z',
  storageUsed: 0,
  storageLimit: 1000,
} as never;

describe('DashboardLayout', () => {
  beforeEach(() => {
    useAuthStore.setState({ user, status: 'unlocked' });
  });

  it('shows the four destinations, the lock state and Lock now', () => {
    render(
      <MemoryRouter initialEntries={['/files']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DashboardLayout>
          <p>content</p>
        </DashboardLayout>
      </MemoryRouter>
    );
    for (const label of ['Home', 'Files', 'Shared', 'Settings']) {
      expect(screen.getAllByRole('link', { name: label }).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('Unlocked · locks after 5 min idle')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Lock now' }).length).toBeGreaterThan(0);
    expect(screen.getByText('content')).toBeInTheDocument();
  });
});
