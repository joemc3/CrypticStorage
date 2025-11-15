import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  username: string;
  createdAt: string;
  updatedAt: string;
}

interface AuthState {
  // State
  user: User | null;
  isAuthenticated: boolean;
  masterKey: string | null; // In memory only, never persisted
  isLoading: boolean;

  // Actions
  login: (user: User, masterKey: string) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
  setMasterKey: (masterKey: string | null) => void;
  setLoading: (isLoading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  // Initial state
  user: null,
  isAuthenticated: false,
  masterKey: null, // NEVER persist this - kept in memory only
  isLoading: false,

  // Actions
  login: (user, masterKey) =>
    set({
      user,
      isAuthenticated: true,
      masterKey, // Stored in memory only during session
    }),

  logout: () =>
    set({
      user: null,
      isAuthenticated: false,
      masterKey: null, // Clear from memory on logout
      isLoading: false,
    }),

  updateUser: (userData) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...userData } : null,
    })),

  setMasterKey: (masterKey) =>
    set({ masterKey }),

  setLoading: (isLoading) =>
    set({ isLoading }),
}));
