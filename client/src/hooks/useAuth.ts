/**
 * CrypticStorage - useAuth Hook
 * Binds the auth service to the auth store and surfaces toasts for outcomes.
 */

import { useCallback } from 'react';
import { useAuthStore } from '../stores/auth.store';
import { useUIStore } from '../stores/ui.store';
import AuthService from '../services/auth.service';

export interface LoginInput {
  email: string;
  password: string;
}

export const useAuth = () => {
  const { user, status, isLoading, pendingTwoFactorEmail, setUnlocked, setLocked, setAnonymous, setPendingTwoFactor, updateUser, setLoading } =
    useAuthStore();
  const addToast = useUIStore((s) => s.addToast);

  const run = useCallback(
    async <T,>(action: () => Promise<T>, failure: string): Promise<T> => {
      setLoading(true);
      try {
        return await action();
      } catch (error) {
        addToast({ type: 'error', message: failure, description: error instanceof Error ? error.message : undefined });
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [addToast, setLoading]
  );

  const register = useCallback(
    (email: string, password: string) =>
      run(async () => {
        const created = await AuthService.register(email, password);
        setUnlocked(created);
        addToast({ type: 'success', message: 'Welcome to CrypticStorage', description: 'Your keys were generated on this device.' });
        return created;
      }, 'Registration failed'),
    [run, setUnlocked, addToast]
  );

  const loginUser = useCallback(
    (input: LoginInput) =>
      run(async () => {
        const result = await AuthService.login(input.email, input.password);
        if (result.requiresTwoFactor) {
          setPendingTwoFactor(input.email);
          return { requiresTwoFactor: true as const };
        }
        setUnlocked(result.user);
        addToast({ type: 'success', message: 'Signed in' });
        return { requiresTwoFactor: false as const };
      }, 'Sign in failed'),
    [run, setPendingTwoFactor, setUnlocked, addToast]
  );

  const verifyTwoFactor = useCallback(
    (code: string) =>
      run(async () => {
        const verified = await AuthService.completeTwoFactor(code);
        setUnlocked(verified);
        addToast({ type: 'success', message: 'Signed in' });
      }, 'Verification failed'),
    [run, setUnlocked, addToast]
  );

  const cancelTwoFactor = useCallback(() => {
    AuthService.cancelTwoFactor();
    setPendingTwoFactor(null);
  }, [setPendingTwoFactor]);

  const unlock = useCallback(
    (password: string) =>
      run(async () => {
        setUnlocked(await AuthService.unlock(password));
      }, 'Could not unlock'),
    [run, setUnlocked]
  );

  const lock = useCallback(() => {
    AuthService.lock();
    setLocked();
  }, [setLocked]);

  const logoutUser = useCallback(async () => {
    await AuthService.logout();
    setAnonymous();
    addToast({ type: 'info', message: 'Signed out' });
  }, [setAnonymous, addToast]);

  const refreshProfile = useCallback(async () => {
    const profile = await AuthService.refreshProfile();
    updateUser(profile);
    return profile;
  }, [updateUser]);

  const changePassword = useCallback(
    (currentPassword: string, newPassword: string) =>
      run(async () => {
        await AuthService.changePassword(currentPassword, newPassword);
        addToast({ type: 'success', message: 'Password changed', description: 'Other sessions have been signed out.' });
      }, 'Password change failed'),
    [run, addToast]
  );

  const deleteAccount = useCallback(
    (password: string) =>
      run(async () => {
        await AuthService.deleteAccount(password);
        setAnonymous();
      }, 'Account deletion failed'),
    [run, setAnonymous]
  );

  const setupTwoFactor = useCallback(() => run(() => AuthService.setupTwoFactor(), 'Could not start 2FA setup'), [run]);

  const enableTwoFactor = useCallback(
    (token: string) =>
      run(async () => {
        const codes = await AuthService.enableTwoFactor(token);
        updateUser({ twoFactorEnabled: true });
        addToast({ type: 'success', message: 'Two-factor authentication enabled' });
        return codes;
      }, 'Could not enable 2FA'),
    [run, updateUser, addToast]
  );

  const disableTwoFactor = useCallback(
    (token: string, password: string) =>
      run(async () => {
        await AuthService.disableTwoFactor(token, password);
        updateUser({ twoFactorEnabled: false });
        addToast({ type: 'success', message: 'Two-factor authentication disabled' });
      }, 'Could not disable 2FA'),
    [run, updateUser, addToast]
  );

  const regenerateBackupCodes = useCallback(
    (password: string) => run(() => AuthService.regenerateBackupCodes(password), 'Could not regenerate backup codes'),
    [run]
  );

  return {
    user,
    status,
    isAuthenticated: status === 'unlocked',
    isLoading,
    pendingTwoFactorEmail,
    register,
    loginUser,
    verifyTwoFactor,
    cancelTwoFactor,
    unlock,
    lock,
    logoutUser,
    refreshProfile,
    changePassword,
    deleteAccount,
    setupTwoFactor,
    enableTwoFactor,
    disableTwoFactor,
    regenerateBackupCodes,
  };
};
