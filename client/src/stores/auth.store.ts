import { create } from 'zustand';
import StorageService from '../services/storage.service';
import type { AuthUser } from '../services/auth.service';

/**
 * - anonymous: no session
 * - locked:    session and vault stored, but keys are not in memory (page reload)
 * - unlocked:  ready to use
 */
export type AuthStatus = 'anonymous' | 'locked' | 'unlocked';

export interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  isLoading: boolean;
  /** Email of the account awaiting a 2FA code after password login. */
  pendingTwoFactorEmail: string | null;

  hydrate: () => void;
  setUnlocked: (user: AuthUser) => void;
  setLocked: () => void;
  setAnonymous: () => void;
  setPendingTwoFactor: (email: string | null) => void;
  updateUser: (patch: Partial<AuthUser>) => void;
  setLoading: (isLoading: boolean) => void;
}

function currentStatus(): AuthStatus {
  if (!StorageService.hasSession()) return 'anonymous';
  return StorageService.hasMasterKey() ? 'unlocked' : 'locked';
}

export const useAuthStore = create<AuthState>((set) => ({
  user: StorageService.getUserData(),
  status: currentStatus(),
  isLoading: false,
  pendingTwoFactorEmail: null,

  hydrate: () => set({ user: StorageService.getUserData(), status: currentStatus() }),
  setUnlocked: (user) => set({ user, status: 'unlocked', pendingTwoFactorEmail: null }),
  setLocked: () => set({ status: 'locked' }),
  setAnonymous: () => set({ user: null, status: 'anonymous', pendingTwoFactorEmail: null }),
  setPendingTwoFactor: (email) => set({ pendingTwoFactorEmail: email }),
  updateUser: (patch) =>
    set((state) => {
      if (!state.user) return {};
      const user = { ...state.user, ...patch };
      StorageService.setUserData(user);
      return { user };
    }),
  setLoading: (isLoading) => set({ isLoading }),
}));

// A failed token refresh anywhere in the app drops the session.
if (typeof window !== 'undefined') {
  window.addEventListener('cs:session-expired', () => useAuthStore.getState().setAnonymous());
}
