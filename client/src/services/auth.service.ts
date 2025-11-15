/**
 * CrypticStorage - Authentication Service
 * Handles user registration, login, and authentication operations
 */

import CryptoService from './crypto.service';
import ApiService from './api.service';
import StorageService from './storage.service';
import type { UserData } from './storage.service';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface RegisterData {
  email: string;
  password: string;
}

export interface LoginData {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface TwoFactorData {
  token: string;
  backupCode?: string;
}

export interface ChangePasswordData {
  currentPassword: string;
  newPassword: string;
}

export interface AuthUser {
  id: string;
  email: string;
  publicKey: string;
  storageUsed: number;
  storageLimit: number;
  twoFactorEnabled: boolean;
  createdAt: string;
}

export interface TwoFactorSetup {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Register a new user with client-side key generation
 * @param data - Registration data (email and password)
 * @returns Authenticated user
 */
export async function register(data: RegisterData): Promise<AuthUser> {
  try {
    const { email, password } = data;

    // 1. Derive key from password
    const { key: passwordDerivedKey, salt } = await CryptoService.deriveKeyFromPassword(password);

    // 2. Generate master encryption key
    const masterKey = await CryptoService.generateMasterKey();

    // 3. Generate RSA key pair
    const rsaKeyPair = await CryptoService.generateRSAKeyPair();

    // 4. Export keys
    const publicKey = await CryptoService.exportPublicKey(rsaKeyPair.publicKey);
    const privateKeyRaw = await CryptoService.exportPrivateKey(rsaKeyPair.privateKey);
    const masterKeyRaw = await CryptoService.exportMasterKey(masterKey);

    // 5. Wrap (encrypt) master key with password-derived key
    const wrappedMasterKey = await CryptoService.wrapKey(masterKey, passwordDerivedKey);

    // 6. Encrypt private key with master key
    const encryptedPrivateKey = await CryptoService.encryptString(
      CryptoService.arrayBufferToBase64(privateKeyRaw),
      masterKey
    );

    // 7. Create password hash for server authentication
    const passwordHash = await CryptoService.sha256(password + email.toLowerCase());

    // 8. Register with server
    const response = await ApiService.register({
      email,
      passwordHash,
      publicKey,
      encryptedPrivateKey: JSON.stringify(encryptedPrivateKey),
      wrappedMasterKey: JSON.stringify(wrappedMasterKey),
      salt: CryptoService.arrayBufferToBase64(salt),
    });

    // 9. Store tokens
    StorageService.setTokens({
      accessToken: response.tokens.accessToken,
      refreshToken: response.tokens.refreshToken,
      expiresAt: Date.now() + response.tokens.expiresIn * 1000,
    });

    // 10. Store user data
    const userData: UserData = {
      id: response.user.id,
      email: response.user.email,
      publicKey: response.user.publicKey,
      storageUsed: 0,
      storageLimit: 10 * 1024 * 1024 * 1024, // 10GB default
      twoFactorEnabled: false,
      createdAt: response.user.createdAt,
    };
    StorageService.setUserData(userData);

    // 11. Store wrapped master key and encrypted private key
    StorageService.setWrappedMasterKey(JSON.stringify(wrappedMasterKey));
    StorageService.setEncryptedPrivateKey(JSON.stringify(encryptedPrivateKey));
    StorageService.setPublicKey(publicKey);

    // 12. Store master key and private key in memory
    StorageService.setMasterKey(masterKey);
    StorageService.setPrivateKey(rsaKeyPair.privateKey);

    return {
      id: response.user.id,
      email: response.user.email,
      publicKey: response.user.publicKey,
      storageUsed: 0,
      storageLimit: 10 * 1024 * 1024 * 1024,
      twoFactorEnabled: false,
      createdAt: response.user.createdAt,
    };
  } catch (error: any) {
    console.error('Registration failed:', error);
    throw new Error(error.message || 'Registration failed');
  }
}

// ============================================================================
// Login
// ============================================================================

/**
 * Login user and decrypt keys
 * @param data - Login data (email, password, rememberMe)
 * @returns Authenticated user or requires 2FA
 */
export async function login(
  data: LoginData
): Promise<{ user: AuthUser; requiresTwoFactor: boolean }> {
  try {
    const { email, password, rememberMe = false } = data;

    // 1. Create password hash for server authentication
    const passwordHash = await CryptoService.sha256(password + email.toLowerCase());

    // 2. Login with server
    const response = await ApiService.login({
      email,
      passwordHash,
    });

    // 3. Check if 2FA is required
    if (response.requiresTwoFactor) {
      // Store temporary data for 2FA verification
      StorageService.setTokens({
        accessToken: response.tokens.accessToken,
        refreshToken: response.tokens.refreshToken,
        expiresAt: Date.now() + response.tokens.expiresIn * 1000,
      });

      return {
        user: {
          id: response.user.id,
          email: response.user.email,
          publicKey: response.user.publicKey,
          storageUsed: response.user.storageUsed,
          storageLimit: response.user.storageLimit,
          twoFactorEnabled: response.user.twoFactorEnabled,
          createdAt: response.user.createdAt,
        },
        requiresTwoFactor: true,
      };
    }

    // 4. Store tokens
    StorageService.setTokens({
      accessToken: response.tokens.accessToken,
      refreshToken: response.tokens.refreshToken,
      expiresAt: Date.now() + response.tokens.expiresIn * 1000,
    });

    // 5. Store user data
    const userData: UserData = {
      id: response.user.id,
      email: response.user.email,
      publicKey: response.user.publicKey,
      storageUsed: response.user.storageUsed,
      storageLimit: response.user.storageLimit,
      twoFactorEnabled: response.user.twoFactorEnabled,
      createdAt: response.user.createdAt,
    };
    StorageService.setUserData(userData);

    // 6. Store wrapped master key and encrypted private key
    StorageService.setWrappedMasterKey(response.user.wrappedMasterKey);
    StorageService.setEncryptedPrivateKey(response.user.encryptedPrivateKey);
    StorageService.setPublicKey(response.user.publicKey);

    // 7. Derive key from password
    const salt = CryptoService.base64ToArrayBuffer(response.user.salt);
    const { key: passwordDerivedKey } = await CryptoService.deriveKeyFromPassword(password, new Uint8Array(salt));

    // 8. Unwrap master key
    const wrappedMasterKey = JSON.parse(response.user.wrappedMasterKey);
    const masterKey = await CryptoService.unwrapKey(wrappedMasterKey, passwordDerivedKey);

    // 9. Decrypt private key
    const encryptedPrivateKey = JSON.parse(response.user.encryptedPrivateKey);
    const privateKeyBase64 = await CryptoService.decryptString(encryptedPrivateKey, masterKey);
    const privateKeyRaw = CryptoService.base64ToArrayBuffer(privateKeyBase64);
    const privateKey = await CryptoService.importPrivateKey(privateKeyRaw);

    // 10. Store keys in memory
    StorageService.setMasterKey(masterKey);
    StorageService.setPrivateKey(privateKey);

    // 11. Store remember me preference
    StorageService.setRememberMe(rememberMe);

    return {
      user: {
        id: response.user.id,
        email: response.user.email,
        publicKey: response.user.publicKey,
        storageUsed: response.user.storageUsed,
        storageLimit: response.user.storageLimit,
        twoFactorEnabled: response.user.twoFactorEnabled,
        createdAt: response.user.createdAt,
      },
      requiresTwoFactor: false,
    };
  } catch (error: any) {
    console.error('Login failed:', error);
    throw new Error(error.message || 'Login failed');
  }
}

// ============================================================================
// Two-Factor Authentication
// ============================================================================

/**
 * Verify two-factor authentication code
 * @param data - 2FA token or backup code
 * @param loginData - Original login data for key derivation
 * @returns Authenticated user
 */
export async function verifyTwoFactor(
  data: TwoFactorData,
  loginData: LoginData
): Promise<AuthUser> {
  try {
    // 1. Verify with server
    const response = await ApiService.verifyTwoFactor({
      token: data.token,
      backupCode: data.backupCode,
    });

    // 2. Update tokens
    StorageService.setTokens({
      accessToken: response.tokens.accessToken,
      refreshToken: response.tokens.refreshToken,
      expiresAt: Date.now() + response.tokens.expiresIn * 1000,
    });

    // 3. Derive key from password and decrypt keys (same as login)
    const { email, password, rememberMe = false } = loginData;
    const salt = CryptoService.base64ToArrayBuffer(response.user.salt);
    const { key: passwordDerivedKey } = await CryptoService.deriveKeyFromPassword(
      password,
      new Uint8Array(salt)
    );

    // 4. Unwrap master key
    const wrappedMasterKey = JSON.parse(response.user.wrappedMasterKey);
    const masterKey = await CryptoService.unwrapKey(wrappedMasterKey, passwordDerivedKey);

    // 5. Decrypt private key
    const encryptedPrivateKey = JSON.parse(response.user.encryptedPrivateKey);
    const privateKeyBase64 = await CryptoService.decryptString(encryptedPrivateKey, masterKey);
    const privateKeyRaw = CryptoService.base64ToArrayBuffer(privateKeyBase64);
    const privateKey = await CryptoService.importPrivateKey(privateKeyRaw);

    // 6. Store keys in memory
    StorageService.setMasterKey(masterKey);
    StorageService.setPrivateKey(privateKey);

    // 7. Store remember me preference
    StorageService.setRememberMe(rememberMe);

    return {
      id: response.user.id,
      email: response.user.email,
      publicKey: response.user.publicKey,
      storageUsed: response.user.storageUsed,
      storageLimit: response.user.storageLimit,
      twoFactorEnabled: response.user.twoFactorEnabled,
      createdAt: response.user.createdAt,
    };
  } catch (error: any) {
    console.error('2FA verification failed:', error);
    throw new Error(error.message || '2FA verification failed');
  }
}

/**
 * Setup two-factor authentication
 * @returns Setup data with QR code and backup codes
 */
export async function setupTwoFactor(): Promise<TwoFactorSetup> {
  try {
    const response = await ApiService.setupTwoFactor();
    return response;
  } catch (error: any) {
    console.error('2FA setup failed:', error);
    throw new Error(error.message || '2FA setup failed');
  }
}

/**
 * Enable two-factor authentication
 * @param token - TOTP token from authenticator app
 * @returns Backup codes
 */
export async function enableTwoFactor(token: string): Promise<string[]> {
  try {
    const response = await ApiService.enableTwoFactor(token);

    // Update user data
    StorageService.updateUserData({ twoFactorEnabled: true });

    return response.backupCodes;
  } catch (error: any) {
    console.error('2FA enable failed:', error);
    throw new Error(error.message || 'Failed to enable 2FA');
  }
}

/**
 * Disable two-factor authentication
 * @param token - TOTP token from authenticator app
 * @param password - User password for verification
 */
export async function disableTwoFactor(token: string, password: string): Promise<void> {
  try {
    const userData = StorageService.getUserData();
    if (!userData) {
      throw new Error('User not authenticated');
    }

    const passwordHash = await CryptoService.sha256(password + userData.email.toLowerCase());

    await ApiService.disableTwoFactor(token, passwordHash);

    // Update user data
    StorageService.updateUserData({ twoFactorEnabled: false });
  } catch (error: any) {
    console.error('2FA disable failed:', error);
    throw new Error(error.message || 'Failed to disable 2FA');
  }
}

/**
 * Regenerate backup codes
 * @param password - User password for verification
 * @returns New backup codes
 */
export async function regenerateBackupCodes(password: string): Promise<string[]> {
  try {
    const userData = StorageService.getUserData();
    if (!userData) {
      throw new Error('User not authenticated');
    }

    const passwordHash = await CryptoService.sha256(password + userData.email.toLowerCase());

    const response = await ApiService.regenerateBackupCodes(passwordHash);
    return response.backupCodes;
  } catch (error: any) {
    console.error('Backup codes regeneration failed:', error);
    throw new Error(error.message || 'Failed to regenerate backup codes');
  }
}

// ============================================================================
// Logout
// ============================================================================

/**
 * Logout user and clear all data
 */
export async function logout(): Promise<void> {
  try {
    // Call logout endpoint
    await ApiService.logout();
  } catch (error) {
    console.error('Logout API call failed:', error);
  } finally {
    // Clear all stored data regardless of API call result
    StorageService.clearAllData();
  }
}

/**
 * Lock session (clear in-memory keys but keep tokens)
 */
export function lockSession(): void {
  StorageService.clearInMemoryData();
}

/**
 * Unlock session with password
 * @param password - User password
 */
export async function unlockSession(password: string): Promise<AuthUser> {
  try {
    const userData = StorageService.getUserData();
    const wrappedMasterKeyData = StorageService.getWrappedMasterKey();
    const encryptedPrivateKeyData = StorageService.getEncryptedPrivateKey();

    if (!userData || !wrappedMasterKeyData || !encryptedPrivateKeyData) {
      throw new Error('Session data not found. Please login again.');
    }

    // Get user profile from server to get salt
    const profile = await ApiService.getProfile();

    // Derive key from password using stored salt
    // Note: In production, the salt should be stored with the wrapped key
    const passwordHash = await CryptoService.sha256(password + userData.email.toLowerCase());

    // For now, we'll need to get the salt from somewhere - ideally it should be stored
    // Let's assume we can derive it or it's stored separately
    // This is a simplified version - in production you'd need proper salt storage

    // Attempt to unwrap the master key
    // If this fails, the password is incorrect
    const response = await ApiService.login({
      email: userData.email,
      passwordHash,
    });

    const salt = CryptoService.base64ToArrayBuffer(response.user.salt);
    const { key: passwordDerivedKey } = await CryptoService.deriveKeyFromPassword(
      password,
      new Uint8Array(salt)
    );

    const wrappedMasterKey = JSON.parse(wrappedMasterKeyData);
    const masterKey = await CryptoService.unwrapKey(wrappedMasterKey, passwordDerivedKey);

    const encryptedPrivateKey = JSON.parse(encryptedPrivateKeyData);
    const privateKeyBase64 = await CryptoService.decryptString(encryptedPrivateKey, masterKey);
    const privateKeyRaw = CryptoService.base64ToArrayBuffer(privateKeyBase64);
    const privateKey = await CryptoService.importPrivateKey(privateKeyRaw);

    // Store keys in memory
    StorageService.setMasterKey(masterKey);
    StorageService.setPrivateKey(privateKey);

    return {
      id: userData.id,
      email: userData.email,
      publicKey: userData.publicKey,
      storageUsed: userData.storageUsed,
      storageLimit: userData.storageLimit,
      twoFactorEnabled: userData.twoFactorEnabled,
      createdAt: userData.createdAt,
    };
  } catch (error: any) {
    console.error('Unlock session failed:', error);
    throw new Error(error.message || 'Failed to unlock session');
  }
}

// ============================================================================
// User Profile
// ============================================================================

/**
 * Get current user profile
 */
export async function getProfile(): Promise<AuthUser> {
  try {
    const profile = await ApiService.getProfile();

    // Update local storage
    StorageService.updateUserData({
      storageUsed: profile.storageUsed,
      storageLimit: profile.storageLimit,
      twoFactorEnabled: profile.twoFactorEnabled,
    });

    return profile;
  } catch (error: any) {
    console.error('Get profile failed:', error);
    throw new Error(error.message || 'Failed to get profile');
  }
}

/**
 * Update user email
 * @param newEmail - New email address
 * @param password - Current password for verification
 */
export async function updateEmail(newEmail: string, password: string): Promise<AuthUser> {
  try {
    const userData = StorageService.getUserData();
    if (!userData) {
      throw new Error('User not authenticated');
    }

    const passwordHash = await CryptoService.sha256(password + userData.email.toLowerCase());

    const profile = await ApiService.updateProfile({
      email: newEmail,
      currentPasswordHash: passwordHash,
    });

    // Update local storage
    StorageService.updateUserData({ email: newEmail });

    return profile;
  } catch (error: any) {
    console.error('Update email failed:', error);
    throw new Error(error.message || 'Failed to update email');
  }
}

/**
 * Change password and re-encrypt keys
 * @param data - Current and new password
 */
export async function changePassword(data: ChangePasswordData): Promise<void> {
  try {
    const userData = StorageService.getUserData();
    const masterKey = StorageService.getMasterKey();
    const privateKey = StorageService.getPrivateKey();

    if (!userData || !masterKey || !privateKey) {
      throw new Error('User not authenticated or keys not available');
    }

    // 1. Derive new key from new password
    const { key: newPasswordDerivedKey, salt: newSalt } =
      await CryptoService.deriveKeyFromPassword(data.newPassword);

    // 2. Re-wrap master key with new password-derived key
    const newWrappedMasterKey = await CryptoService.wrapKey(masterKey, newPasswordDerivedKey);

    // 3. Create password hashes
    const currentPasswordHash = await CryptoService.sha256(
      data.currentPassword + userData.email.toLowerCase()
    );
    const newPasswordHash = await CryptoService.sha256(
      data.newPassword + userData.email.toLowerCase()
    );

    // 4. Update on server
    await ApiService.updateProfile({
      currentPasswordHash,
      newPasswordHash,
      salt: CryptoService.arrayBufferToBase64(newSalt),
      wrappedMasterKey: JSON.stringify(newWrappedMasterKey),
    });

    // 5. Update local storage
    StorageService.setWrappedMasterKey(JSON.stringify(newWrappedMasterKey));
  } catch (error: any) {
    console.error('Change password failed:', error);
    throw new Error(error.message || 'Failed to change password');
  }
}

/**
 * Delete user account
 * @param password - User password for verification
 */
export async function deleteAccount(password: string): Promise<void> {
  try {
    const userData = StorageService.getUserData();
    if (!userData) {
      throw new Error('User not authenticated');
    }

    const passwordHash = await CryptoService.sha256(password + userData.email.toLowerCase());

    await ApiService.deleteAccount(passwordHash);

    // Clear all data
    StorageService.clearAllData();
  } catch (error: any) {
    console.error('Delete account failed:', error);
    throw new Error(error.message || 'Failed to delete account');
  }
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return StorageService.isAuthenticated();
}

/**
 * Check if user has valid session
 */
export function hasValidSession(): boolean {
  return StorageService.hasValidSession();
}

/**
 * Get current user from storage
 */
export function getCurrentUser(): AuthUser | null {
  const userData = StorageService.getUserData();
  if (!userData) return null;

  return {
    id: userData.id,
    email: userData.email,
    publicKey: userData.publicKey,
    storageUsed: userData.storageUsed,
    storageLimit: userData.storageLimit,
    twoFactorEnabled: userData.twoFactorEnabled,
    createdAt: userData.createdAt,
  };
}

// Export the service as a default object
const AuthService = {
  register,
  login,
  verifyTwoFactor,
  setupTwoFactor,
  enableTwoFactor,
  disableTwoFactor,
  regenerateBackupCodes,
  logout,
  lockSession,
  unlockSession,
  getProfile,
  updateEmail,
  changePassword,
  deleteAccount,
  isAuthenticated,
  hasValidSession,
  getCurrentUser,
};

export default AuthService;
