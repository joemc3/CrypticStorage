/**
 * CrypticStorage - useEncryption Hook
 * Convenience access to the master key for components that need small crypto operations.
 */

import { useCallback } from 'react';
import CryptoService from '../services/crypto.service';
import StorageService from '../services/storage.service';

export const useEncryption = () => {
  const requireMasterKey = useCallback((): CryptoKey => {
    const key = StorageService.getMasterKey();
    if (!key) throw new Error('Your vault is locked');
    return key;
  }, []);

  const encryptString = useCallback((plaintext: string) => CryptoService.encryptString(plaintext, requireMasterKey()), [requireMasterKey]);
  const decryptString = useCallback((data: { data: string; iv: string }) => CryptoService.decryptString(data, requireMasterKey()), [requireMasterKey]);
  const generatePassword = useCallback((length = 20) => CryptoService.generatePassword(length), []);
  const generateFingerprint = useCallback(async (): Promise<string | null> => {
    const key = StorageService.getMasterKey();
    return key ? CryptoService.keyFingerprint(key) : null;
  }, []);

  return { isUnlocked: StorageService.hasMasterKey(), encryptString, decryptString, generatePassword, generateFingerprint };
};
