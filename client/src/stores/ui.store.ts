import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';

export type ModalType =
  | 'upload'
  | 'createFolder'
  | 'rename'
  | 'delete'
  | 'share'
  | 'move'
  | 'fileDetails'
  | null;

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  description?: string;
  duration?: number; // milliseconds, default 3000
}

interface ModalState {
  type: ModalType;
  data?: any; // Modal-specific data (e.g., file to delete, folder to create in)
}

export interface UIState {
  // State
  theme: Theme;
  sidebarOpen: boolean;
  modal: ModalState;
  toasts: Toast[];
  isLoading: Record<string, boolean>; // Named loading states (e.g., 'uploadFile', 'deleteFile')

  // Actions
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  openModal: (type: ModalType, data?: any) => void;
  closeModal: () => void;

  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;

  setLoading: (key: string, isLoading: boolean) => void;
  clearLoading: () => void;
}

/** Explicit themes set data-theme on <html>; system removes it so the media query decides. */
function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

/** localStorage that degrades to a no-op when it is missing or throws (private mode, quota, blocked). */
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      /* keep working in memory */
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Initial state
      theme: 'system',
      sidebarOpen: true,
      modal: { type: null },
      toasts: [],
      isLoading: {},

      // Theme actions
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },

      // Sidebar actions
      toggleSidebar: () =>
        set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      // Modal actions
      openModal: (type, data) =>
        set({ modal: { type, data } }),

      closeModal: () =>
        set({ modal: { type: null, data: undefined } }),

      // Toast actions
      addToast: (toast) =>
        set((state) => {
          const id = `toast-${Date.now()}-${Math.random()}`;
          const newToast: Toast = {
            id,
            ...toast,
            duration: toast.duration ?? 3000,
          };
          return { toasts: [...state.toasts, newToast] };
        }),

      removeToast: (id) =>
        set((state) => ({
          toasts: state.toasts.filter((toast) => toast.id !== id),
        })),

      clearToasts: () => set({ toasts: [] }),

      // Loading actions
      setLoading: (key, isLoading) =>
        set((state) => ({
          isLoading: { ...state.isLoading, [key]: isLoading },
        })),

      clearLoading: () => set({ isLoading: {} }),
    }),
    {
      name: 'cryptic-storage-ui', // localStorage key
      storage: createJSONStorage(() => safeStorage),
      onRehydrateStorage: () => (state) => applyTheme(state?.theme ?? 'system'),
      // Only persist UI preferences, not runtime state
      partialize: (state) => ({
        theme: state.theme,
        sidebarOpen: state.sidebarOpen,
        // DO NOT persist: modal, toasts, isLoading (runtime state)
      }),
    }
  )
);
