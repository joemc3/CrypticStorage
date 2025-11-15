/**
 * CrypticStorage - useEncryption Hook
 * Custom hook for encryption operations
 */

import { useCallback } from 'react';
import { useAuthStore } from '../stores/auth.store';
import { useUIStore } from '../stores/ui.store';
import CryptoService from '../services/crypto.service';
import StorageService from '../services/storage.service';

export const useEncryption = () => {
  const { masterKey } = useAuthStore();
  const { addToast } = useUIStore();

  /**
   * Get master key from store or storage
   */
  const getMasterKey = useCallback(async (): Promise<CryptoKey | null> => {
    // Try to get from in-memory storage first
    const key = StorageService.getMasterKey();

    if (!key) {
      addToast({
        type: 'error',
        message: 'Master key not available',
        description: 'Please login again',
      });
      return null;
    }

    return key;
  }, [addToast]);

  /**
   * Encrypt a string
   */
  const encryptString = useCallback(
    async (plaintext: string): Promise<{ data: string; iv: string } | null> => {
      try {
        const key = await getMasterKey();
        if (!key) return null;

        return await CryptoService.encryptString(plaintext, key);
      } catch (error: any) {
        console.error('Encryption error:', error);
        addToast({
          type: 'error',
          message: 'Encryption failed',
          description: error.message || 'Failed to encrypt data',
        });
        return null;
      }
    },
    [getMasterKey, addToast]
  );

  /**
   * Decrypt a string
   */
  const decryptString = useCallback(
    async (encryptedData: { data: string; iv: string }): Promise<string | null> => {
      try {
        const key = await getMasterKey();
        if (!key) return null;

        return await CryptoService.decryptString(encryptedData, key);
      } catch (error: any) {
        console.error('Decryption error:', error);
        addToast({
          type: 'error',
          message: 'Decryption failed',
          description: error.message || 'Failed to decrypt data',
        });
        return null;
      }
    },
    [getMasterKey, addToast]
  );

  /**
   * Encrypt a file
   */
  const encryptFile = useCallback(
    async (
      file: File | Blob,
      onProgress?: (progress: number) => void
    ): Promise<{ encryptedBlob: Blob; iv: string } | null> => {
      try {
        const key = await getMasterKey();
        if (!key) return null;

        return await CryptoService.encryptFile(file, key, onProgress);
      } catch (error: any) {
        console.error('File encryption error:', error);
        addToast({
          type: 'error',
          message: 'File encryption failed',
          description: error.message || 'Failed to encrypt file',
        });
        return null;
      }
    },
    [getMasterKey, addToast]
  );

  /**
   * Decrypt a file
   */
  const decryptFile = useCallback(
    async (
      encryptedBlob: Blob,
      iv: string,
      onProgress?: (progress: number) => void
    ): Promise<Blob | null> => {
      try {
        const key = await getMasterKey();
        if (!key) return null;

        return await CryptoService.decryptFile(encryptedBlob, iv, key, onProgress);
      } catch (error: any) {
        console.error('File decryption error:', error);
        addToast({
          type: 'error',
          message: 'File decryption failed',
          description: error.message || 'Failed to decrypt file',
        });
        return null;
      }
    },
    [getMasterKey, addToast]
  );

  /**
   * Generate a secure random password
   */
  const generatePassword = useCallback((length: number = 16): string => {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    const randomBytes = CryptoService.generateRandomBytes(length);
    let password = '';

    for (let i = 0; i < length; i++) {
      password += charset[randomBytes[i] % charset.length];
    }

    return password;
  }, []);

  /**
   * Hash a string using SHA-256
   */
  const hashString = useCallback(async (data: string): Promise<string> => {
    return await CryptoService.sha256(data);
  }, []);

  /**
   * Generate a fingerprint for verification
   */
  const generateFingerprint = useCallback(async (): Promise<string | null> => {
    try {
      const key = await getMasterKey();
      if (!key) return null;

      return await CryptoService.generateKeyFingerprint(key);
    } catch (error: any) {
      console.error('Fingerprint generation error:', error);
      return null;
    }
  }, [getMasterKey]);

  return {
    // String operations
    encryptString,
    decryptString,

    // File operations
    encryptFile,
    decryptFile,

    // Utilities
    generatePassword,
    hashString,
    generateFingerprint,
  };
};
