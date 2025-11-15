/**
 * CrypticStorage - useToast Hook
 * Custom hook for toast notifications
 */

import { useUIStore, Toast } from '../stores/ui.store';
import { useCallback } from 'react';

export const useToast = () => {
  const { toasts, addToast, removeToast, clearToasts } = useUIStore();

  /**
   * Show success toast
   */
  const success = useCallback(
    (message: string, description?: string, duration?: number) => {
      addToast({
        type: 'success',
        message,
        description,
        duration,
      });
    },
    [addToast]
  );

  /**
   * Show error toast
   */
  const error = useCallback(
    (message: string, description?: string, duration?: number) => {
      addToast({
        type: 'error',
        message,
        description,
        duration,
      });
    },
    [addToast]
  );

  /**
   * Show warning toast
   */
  const warning = useCallback(
    (message: string, description?: string, duration?: number) => {
      addToast({
        type: 'warning',
        message,
        description,
        duration,
      });
    },
    [addToast]
  );

  /**
   * Show info toast
   */
  const info = useCallback(
    (message: string, description?: string, duration?: number) => {
      addToast({
        type: 'info',
        message,
        description,
        duration,
      });
    },
    [addToast]
  );

  /**
   * Show custom toast
   */
  const show = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      addToast(toast);
    },
    [addToast]
  );

  /**
   * Remove a specific toast
   */
  const dismiss = useCallback(
    (id: string) => {
      removeToast(id);
    },
    [removeToast]
  );

  /**
   * Clear all toasts
   */
  const dismissAll = useCallback(() => {
    clearToasts();
  }, [clearToasts]);

  return {
    // Toast list
    toasts,

    // Actions
    success,
    error,
    warning,
    info,
    show,
    dismiss,
    dismissAll,
  };
};
