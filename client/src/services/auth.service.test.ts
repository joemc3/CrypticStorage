// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import ApiService from './api.service';
import AuthService from './auth.service';
import StorageService from './storage.service';

describe('auth.service refreshProfile', () => {
  it('carries the display name, lock period and verification time into the stored user', async () => {
    StorageService.setUserData({
      id: 'u1', email: 'a@b.co', publicKey: 'pk', storageUsed: 0, storageLimit: 1, twoFactorEnabled: false,
      displayName: null, lockAfterMinutes: 5, emailVerifiedAt: null, createdAt: '2026-01-01T00:00:00Z',
    });
    vi.spyOn(ApiService, 'getProfile').mockResolvedValue({
      email: 'a@b.co', storageUsed: 3, storageLimit: 9, twoFactorEnabled: false,
      displayName: 'Mara', lockAfterMinutes: 1, emailVerifiedAt: '2026-10-14T00:00:00Z',
    } as never);
    const user = await AuthService.refreshProfile();
    expect(user.lockAfterMinutes).toBe(1);
    expect(user.displayName).toBe('Mara');
    expect(user.emailVerifiedAt).toBe('2026-10-14T00:00:00Z');
    expect(StorageService.getUserData()!.lockAfterMinutes).toBe(1);
  });
});
