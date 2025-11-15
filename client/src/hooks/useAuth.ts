/**
 * CrypticStorage - useAuth Hook
 * Custom hook for authentication operations
 */

import { useAuthStore } from '../stores/auth.store';
import { useUIStore } from '../stores/ui.store';
import AuthService from '../services/auth.service';
import type { LoginData, RegisterData } from '../services/auth.service';

export const useAuth = () => {
  const { user, isAuthenticated, masterKey, isLoading, login, logout, setLoading } = useAuthStore();
  const { addToast } = useUIStore();

  /**
   * Register a new user
   */
  const register = async (data: RegisterData) => {
    try {
      setLoading(true);
      const user = await AuthService.register(data);

      // Get the master key from storage service
      const StorageService = (await import('../services/storage.service')).default;
      const masterKey = StorageService.getMasterKey();

      if (!masterKey) {
        throw new Error('Failed to retrieve master key');
      }

      // Export master key as base64 for storage
      const CryptoService = (await import('../services/crypto.service')).default;
      const masterKeyRaw = await CryptoService.exportMasterKey(masterKey);
      const masterKeyBase64 = CryptoService.arrayBufferToBase64(masterKeyRaw);

      login(
        {
          id: user.id,
          email: user.email,
          username: user.email.split('@')[0],
          createdAt: user.createdAt,
          updatedAt: user.createdAt,
        },
        masterKeyBase64
      );

      addToast({
        type: 'success',
        message: 'Account created successfully',
        description: 'Welcome to CrypticStorage!',
      });
    } catch (error: any) {
      console.error('Registration error:', error);
      addToast({
        type: 'error',
        message: 'Registration failed',
        description: error.message || 'An error occurred during registration',
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Login user
   */
  const loginUser = async (data: LoginData) => {
    try {
      setLoading(true);
      const result = await AuthService.login({
        email: data.email,
        password: data.password,
        rememberMe: data.rememberMe,
      });

      if (result.requiresTwoFactor) {
        addToast({
          type: 'info',
          message: 'Two-factor authentication required',
          description: 'Please enter your 2FA code',
        });
        return { requiresTwoFactor: true };
      }

      // Get the master key from storage service
      const StorageService = (await import('../services/storage.service')).default;
      const masterKey = StorageService.getMasterKey();

      if (!masterKey) {
        throw new Error('Failed to retrieve master key');
      }

      // Export master key as base64 for storage
      const CryptoService = (await import('../services/crypto.service')).default;
      const masterKeyRaw = await CryptoService.exportMasterKey(masterKey);
      const masterKeyBase64 = CryptoService.arrayBufferToBase64(masterKeyRaw);

      login(
        {
          id: result.user.id,
          email: result.user.email,
          username: result.user.email.split('@')[0],
          createdAt: result.user.createdAt,
          updatedAt: result.user.createdAt,
        },
        masterKeyBase64
      );

      addToast({
        type: 'success',
        message: 'Welcome back!',
        description: 'You have been logged in successfully',
      });

      return { requiresTwoFactor: false };
    } catch (error: any) {
      console.error('Login error:', error);
      addToast({
        type: 'error',
        message: 'Login failed',
        description: error.message || 'Invalid credentials',
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Logout user
   */
  const logoutUser = async () => {
    try {
      await AuthService.logout();
      logout();
      addToast({
        type: 'success',
        message: 'Logged out',
        description: 'You have been logged out successfully',
      });
    } catch (error: any) {
      console.error('Logout error:', error);
      addToast({
        type: 'error',
        message: 'Logout failed',
        description: error.message || 'An error occurred during logout',
      });
    }
  };

  /**
   * Get current user profile
   */
  const refreshProfile = async () => {
    try {
      const profile = await AuthService.getProfile();
      // Update user in store if needed
      return profile;
    } catch (error: any) {
      console.error('Failed to refresh profile:', error);
      throw error;
    }
  };

  /**
   * Setup two-factor authentication
   */
  const setupTwoFactor = async () => {
    try {
      return await AuthService.setupTwoFactor();
    } catch (error: any) {
      console.error('2FA setup error:', error);
      addToast({
        type: 'error',
        message: '2FA setup failed',
        description: error.message || 'Failed to setup two-factor authentication',
      });
      throw error;
    }
  };

  /**
   * Enable two-factor authentication
   */
  const enableTwoFactor = async (token: string) => {
    try {
      const backupCodes = await AuthService.enableTwoFactor(token);
      addToast({
        type: 'success',
        message: '2FA enabled',
        description: 'Two-factor authentication has been enabled',
      });
      return backupCodes;
    } catch (error: any) {
      console.error('Enable 2FA error:', error);
      addToast({
        type: 'error',
        message: 'Failed to enable 2FA',
        description: error.message || 'Invalid token',
      });
      throw error;
    }
  };

  /**
   * Disable two-factor authentication
   */
  const disableTwoFactor = async (token: string, password: string) => {
    try {
      await AuthService.disableTwoFactor(token, password);
      addToast({
        type: 'success',
        message: '2FA disabled',
        description: 'Two-factor authentication has been disabled',
      });
    } catch (error: any) {
      console.error('Disable 2FA error:', error);
      addToast({
        type: 'error',
        message: 'Failed to disable 2FA',
        description: error.message || 'Invalid credentials',
      });
      throw error;
    }
  };

  /**
   * Change password
   */
  const changePassword = async (currentPassword: string, newPassword: string) => {
    try {
      await AuthService.changePassword({ currentPassword, newPassword });
      addToast({
        type: 'success',
        message: 'Password changed',
        description: 'Your password has been updated successfully',
      });
    } catch (error: any) {
      console.error('Change password error:', error);
      addToast({
        type: 'error',
        message: 'Failed to change password',
        description: error.message || 'Invalid current password',
      });
      throw error;
    }
  };

  return {
    // State
    user,
    isAuthenticated,
    masterKey,
    isLoading,

    // Actions
    register,
    loginUser,
    logoutUser,
    refreshProfile,
    setupTwoFactor,
    enableTwoFactor,
    disableTwoFactor,
    changePassword,
  };
};
