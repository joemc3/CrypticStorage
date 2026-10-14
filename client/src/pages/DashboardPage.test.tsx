import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ApiService from '../services/api.service';
import AuthService from '../services/auth.service';
import { useAuthStore } from '../stores/auth.store';
import DashboardPage from './DashboardPage';

vi.mock('../layouts/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../hooks/useFiles', () => ({
  useFiles: () => ({
    files: [
      { id: 'f1', name: 'House deed scan.jpg', mimeType: 'image/jpeg', size: 2048, createdAt: '2026-10-10T09:00:00.000Z' },
    ],
    isLoading: false,
    loadFiles: vi.fn().mockResolvedValue(undefined),
    sharedWithMe: [],
    loadSharedWithMe: vi.fn().mockResolvedValue(undefined),
    downloadFile: vi.fn(),
  }),
}));

const user = {
  id: 'u1',
  email: 'a@b.co',
  displayName: null,
  lockAfterMinutes: 5,
  emailVerifiedAt: '2026-10-14T00:00:00.000Z',
  createdAt: '2026-10-14T00:00:00.000Z',
  storageUsed: 0,
  storageLimit: 1073741824,
} as never;

describe('DashboardPage', () => {
  beforeEach(() => {
    useAuthStore.setState({ user, status: 'unlocked' });
    vi.spyOn(AuthService, 'refreshProfile').mockResolvedValue(user);
    vi.spyOn(ApiService, 'getStorageStats').mockResolvedValue({
      used: 40000000,
      limit: 1073741824,
      fileCount: 10,
      folderCount: 4,
    });
  });

  it('shows storage used, the item count and recent items, and no placeholders', async () => {
    const { container } = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DashboardPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('38.15 MB')).toBeInTheDocument());
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('in 4 folders')).toBeInTheDocument();
    expect(screen.getByText('House deed scan.jpg')).toBeInTheDocument();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/coming soon/i);
    expect(text).not.toMatch(/placeholder/i);
  });
});
