/**
 * CrypticStorage - Authentication Service
 * Registration, login, 2FA and vault unlock. The password never leaves this module.
 */

import CryptoService from './crypto.service';
import ApiService, { toApiError, type AuthResponse, type Tokens, type VaultUser } from './api.service';
import StorageService, { type UserData } from './storage.service';

export interface AuthUser extends UserData {}

export interface LoginResult {
  user: AuthUser;
  requiresTwoFactor: boolean;
}

/** Wrapping key held between password login and 2FA completion. */
let pendingWrappingKey: CryptoKey | null = null;

function toUserData(user: VaultUser): UserData {
  return {
    id: user.id,
    email: user.email,
    publicKey: user.publicKey,
    storageUsed: user.storageUsed,
    storageLimit: user.storageLimit,
    twoFactorEnabled: user.twoFactorEnabled,
    createdAt: user.createdAt,
  };
}

function persistTokens(tokens: Tokens): void {
  StorageService.setTokens({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: Date.now() + tokens.expiresIn * 1000 });
}

/** Unwrap the vault with the wrapping key and load the secrets into memory. */
async function openVault(user: VaultUser, wrappingKey: CryptoKey): Promise<void> {
  let masterKey: CryptoKey;
  try {
    masterKey = await CryptoService.unwrapKey(JSON.parse(user.wrappedMasterKey), wrappingKey);
  } catch {
    throw new Error('Incorrect password');
  }
  const privateKeyBytes = await CryptoService.decryptBytes(JSON.parse(user.encryptedPrivateKey), masterKey);
  const privateKey = await CryptoService.importPrivateKey(privateKeyBytes);

  StorageService.setVault({
    wrappedMasterKey: user.wrappedMasterKey,
    encryptedPrivateKey: user.encryptedPrivateKey,
    publicKey: user.publicKey,
    salt: user.salt,
    kdfIterations: user.kdfIterations,
  });
  StorageService.setUserData(toUserData(user));
  StorageService.setMasterKey(masterKey);
  StorageService.setPrivateKey(privateKey);
}

// ============================================================================
// Registration
// ============================================================================

export async function register(email: string, password: string): Promise<AuthUser> {
  const normalizedEmail = email.trim().toLowerCase();
  const salt = await CryptoService.saltForEmail(normalizedEmail);
  const derived = await CryptoService.deriveKeys(password, salt);

  const masterKey = await CryptoService.generateMasterKey();
  const rsa = await CryptoService.generateRSAKeyPair();
  const publicKey = await CryptoService.exportPublicKey(rsa.publicKey);
  const wrappedMasterKey = await CryptoService.wrapKey(masterKey, derived.wrappingKey);
  const encryptedPrivateKey = await CryptoService.encryptBytes(await CryptoService.exportPrivateKey(rsa.privateKey), masterKey);

  try {
    await ApiService.register({
      email: normalizedEmail,
      passwordHash: derived.authHash,
      publicKey,
      encryptedPrivateKey: JSON.stringify(encryptedPrivateKey),
      wrappedMasterKey: JSON.stringify(wrappedMasterKey),
      salt,
      kdfIterations: derived.iterations,
      contractPhrase: 'I understand there is no way back', // task 5 rewrites this
    });
  } catch (error) {
    throw new Error(toApiError(error).message);
  }

  // task 5 rewrites this: registration no longer returns tokens or opens the vault.
  throw new Error('Check your email to verify your account');
}

// ============================================================================
// Login
// ============================================================================

export async function login(email: string, password: string): Promise<LoginResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const salt = await CryptoService.saltForEmail(normalizedEmail);
  const derived = await CryptoService.deriveKeys(password, salt);

  let response: AuthResponse;
  try {
    response = await ApiService.login(normalizedEmail, derived.authHash);
  } catch (error) {
    const apiError = toApiError(error);
    throw new Error(apiError.statusCode === 401 ? 'Invalid email or password' : apiError.message);
  }

  if (response.requiresTwoFactor) {
    pendingWrappingKey = derived.wrappingKey;
    persistTokens(response.tokens); // short-lived challenge token
    return { user: toUserData(response.user), requiresTwoFactor: true };
  }

  persistTokens(response.tokens);
  await openVault(response.user, derived.wrappingKey);
  return { user: toUserData(response.user), requiresTwoFactor: false };
}

export async function completeTwoFactor(code: string): Promise<AuthUser> {
  if (!pendingWrappingKey) throw new Error('Start by signing in with your password');
  const trimmed = code.trim();
  const payload = /^\d{6}$/.test(trimmed) ? { token: trimmed } : { backupCode: trimmed };

  let response: AuthResponse;
  try {
    response = await ApiService.verifyTwoFactor(payload);
  } catch (error) {
    throw new Error(toApiError(error).message);
  }

  persistTokens(response.tokens);
  await openVault(response.user, pendingWrappingKey);
  pendingWrappingKey = null;
  return toUserData(response.user);
}

export function cancelTwoFactor(): void {
  pendingWrappingKey = null;
  StorageService.clearTokens();
}

// ============================================================================
// Lock / unlock (page reload keeps the session but drops the keys)
// ============================================================================

export function lock(): void {
  StorageService.clearInMemoryData();
}

/** Unlock offline with the stored vault; no network round trip needed. */
export async function unlock(password: string): Promise<AuthUser> {
  const user = StorageService.getUserData();
  const vault = StorageService.getVault();
  if (!user || !vault) throw new Error('No saved session. Please sign in again.');

  const derived = await CryptoService.deriveKeys(password, vault.salt, vault.kdfIterations);
  await openVault({ ...user, ...vault, updatedAt: user.createdAt }, derived.wrappingKey);
  return user;
}

// ============================================================================
// Logout
// ============================================================================

export async function logout(): Promise<void> {
  try {
    if (StorageService.getAccessToken()) await ApiService.logout();
  } catch {
    // The local session is cleared regardless.
  } finally {
    pendingWrappingKey = null;
    StorageService.clearAllData();
  }
}

// ============================================================================
// Profile and credentials
// ============================================================================

export async function refreshProfile(): Promise<AuthUser> {
  const profile = await ApiService.getProfile();
  StorageService.updateUserData({
    email: profile.email,
    storageUsed: profile.storageUsed,
    storageLimit: profile.storageLimit,
    twoFactorEnabled: profile.twoFactorEnabled,
  });
  return StorageService.getUserData()!;
}

/** Re-derive the current credential; used by actions that require password confirmation. */
export async function currentAuthHash(password: string): Promise<string> {
  const vault = StorageService.getVault();
  if (!vault) throw new Error('No saved session');
  const derived = await CryptoService.deriveKeys(password, vault.salt, vault.kdfIterations);
  // Confirm locally before sending anything.
  try {
    await CryptoService.unwrapKey(JSON.parse(vault.wrappedMasterKey), derived.wrappingKey);
  } catch {
    throw new Error('Incorrect password');
  }
  return derived.authHash;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const vault = StorageService.getVault();
  const masterKey = StorageService.getMasterKey();
  const user = StorageService.getUserData();
  if (!vault || !masterKey || !user) throw new Error('Unlock your vault first');

  const currentPasswordHash = await currentAuthHash(currentPassword);
  const next = await CryptoService.deriveKeys(newPassword, vault.salt);
  const wrappedMasterKey = await CryptoService.wrapKey(masterKey, next.wrappingKey);

  try {
    await ApiService.updateProfile({
      currentPasswordHash,
      newPasswordHash: next.authHash,
      salt: next.salt,
      kdfIterations: next.iterations,
      wrappedMasterKey: JSON.stringify(wrappedMasterKey),
    });
  } catch (error) {
    throw new Error(toApiError(error).message);
  }
  StorageService.setVault({ ...vault, wrappedMasterKey: JSON.stringify(wrappedMasterKey), kdfIterations: next.iterations });
}

export async function deleteAccount(password: string): Promise<void> {
  const passwordHash = await currentAuthHash(password);
  try {
    await ApiService.deleteAccount(passwordHash);
  } catch (error) {
    throw new Error(toApiError(error).message);
  }
  StorageService.clearAllData();
}

// ============================================================================
// Two-factor management
// ============================================================================

export async function setupTwoFactor(): Promise<{ secret: string; qrCode: string }> {
  try {
    return await ApiService.setupTwoFactor();
  } catch (error) {
    throw new Error(toApiError(error).message);
  }
}

export async function enableTwoFactor(token: string): Promise<string[]> {
  try {
    const { backupCodes } = await ApiService.enableTwoFactor(token);
    StorageService.updateUserData({ twoFactorEnabled: true });
    return backupCodes;
  } catch (error) {
    throw new Error(toApiError(error).message);
  }
}

export async function disableTwoFactor(token: string, password: string): Promise<void> {
  const passwordHash = await currentAuthHash(password);
  try {
    await ApiService.disableTwoFactor(token, passwordHash);
    StorageService.updateUserData({ twoFactorEnabled: false });
  } catch (error) {
    throw new Error(toApiError(error).message);
  }
}

export async function regenerateBackupCodes(password: string): Promise<string[]> {
  const passwordHash = await currentAuthHash(password);
  try {
    return (await ApiService.regenerateBackupCodes(passwordHash)).backupCodes;
  } catch (error) {
    throw new Error(toApiError(error).message);
  }
}

export function getCurrentUser(): AuthUser | null {
  return StorageService.getUserData();
}

const AuthService = {
  register,
  login,
  completeTwoFactor,
  cancelTwoFactor,
  lock,
  unlock,
  logout,
  refreshProfile,
  changePassword,
  deleteAccount,
  setupTwoFactor,
  enableTwoFactor,
  disableTwoFactor,
  regenerateBackupCodes,
  getCurrentUser,
};

export default AuthService;
