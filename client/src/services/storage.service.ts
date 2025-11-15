/**
 * CrypticStorage - Storage Service
 * Manages localStorage and in-memory secure storage
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface UserData {
  id: string;
  email: string;
  publicKey: string;
  storageUsed: number;
  storageLimit: number;
  twoFactorEnabled: boolean;
  createdAt: string;
}

export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

// ============================================================================
// Storage Keys
// ============================================================================

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'crypticstorage_access_token',
  REFRESH_TOKEN: 'crypticstorage_refresh_token',
  TOKEN_EXPIRES_AT: 'crypticstorage_token_expires_at',
  USER_DATA: 'crypticstorage_user_data',
  WRAPPED_MASTER_KEY: 'crypticstorage_wrapped_master_key',
  ENCRYPTED_PRIVATE_KEY: 'crypticstorage_encrypted_private_key',
  PUBLIC_KEY: 'crypticstorage_public_key',
  REMEMBER_ME: 'crypticstorage_remember_me',
} as const;

// ============================================================================
// In-Memory Storage (for sensitive data)
// ============================================================================

/**
 * In-memory storage for master key (never persisted to disk)
 * This is cleared when the page is refreshed or closed
 */
class InMemoryStorage {
  private masterKey: CryptoKey | null = null;
  private privateKey: CryptoKey | null = null;

  setMasterKey(key: CryptoKey): void {
    this.masterKey = key;
  }

  getMasterKey(): CryptoKey | null {
    return this.masterKey;
  }

  setPrivateKey(key: CryptoKey): void {
    this.privateKey = key;
  }

  getPrivateKey(): CryptoKey | null {
    return this.privateKey;
  }

  clear(): void {
    this.masterKey = null;
    this.privateKey = null;
  }

  hasMasterKey(): boolean {
    return this.masterKey !== null;
  }

  hasPrivateKey(): boolean {
    return this.privateKey !== null;
  }
}

const memoryStorage = new InMemoryStorage();

// ============================================================================
// Token Management
// ============================================================================

/**
 * Store authentication tokens
 */
export function setTokens(tokens: TokenData): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokens.accessToken);
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken);
    localStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRES_AT, tokens.expiresAt.toString());
  } catch (error) {
    console.error('Failed to store tokens:', error);
    throw new Error('Failed to store authentication tokens');
  }
}

/**
 * Get authentication tokens
 */
export function getTokens(): TokenData | null {
  try {
    const accessToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
    const expiresAt = localStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRES_AT);

    if (!accessToken || !refreshToken || !expiresAt) {
      return null;
    }

    return {
      accessToken,
      refreshToken,
      expiresAt: parseInt(expiresAt, 10),
    };
  } catch (error) {
    console.error('Failed to get tokens:', error);
    return null;
  }
}

/**
 * Get access token
 */
export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  } catch (error) {
    console.error('Failed to get access token:', error);
    return null;
  }
}

/**
 * Get refresh token
 */
export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
  } catch (error) {
    console.error('Failed to get refresh token:', error);
    return null;
  }
}

/**
 * Check if token is expired
 */
export function isTokenExpired(): boolean {
  const expiresAt = localStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRES_AT);
  if (!expiresAt) return true;

  const expiryTime = parseInt(expiresAt, 10);
  const currentTime = Date.now();

  // Consider token expired if less than 5 minutes remaining
  return currentTime >= expiryTime - 5 * 60 * 1000;
}

/**
 * Clear authentication tokens
 */
export function clearTokens(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRES_AT);
  } catch (error) {
    console.error('Failed to clear tokens:', error);
  }
}

// ============================================================================
// User Data Management
// ============================================================================

/**
 * Store user data
 */
export function setUserData(userData: UserData): void {
  try {
    localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
  } catch (error) {
    console.error('Failed to store user data:', error);
    throw new Error('Failed to store user data');
  }
}

/**
 * Get user data
 */
export function getUserData(): UserData | null {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.USER_DATA);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Failed to get user data:', error);
    return null;
  }
}

/**
 * Update user data (partial update)
 */
export function updateUserData(updates: Partial<UserData>): void {
  try {
    const currentData = getUserData();
    if (!currentData) {
      throw new Error('No user data found');
    }

    const updatedData = { ...currentData, ...updates };
    setUserData(updatedData);
  } catch (error) {
    console.error('Failed to update user data:', error);
    throw new Error('Failed to update user data');
  }
}

/**
 * Clear user data
 */
export function clearUserData(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.USER_DATA);
  } catch (error) {
    console.error('Failed to clear user data:', error);
  }
}

// ============================================================================
// Key Storage
// ============================================================================

/**
 * Store wrapped master key (encrypted with password-derived key)
 */
export function setWrappedMasterKey(wrappedKey: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.WRAPPED_MASTER_KEY, wrappedKey);
  } catch (error) {
    console.error('Failed to store wrapped master key:', error);
    throw new Error('Failed to store wrapped master key');
  }
}

/**
 * Get wrapped master key
 */
export function getWrappedMasterKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.WRAPPED_MASTER_KEY);
  } catch (error) {
    console.error('Failed to get wrapped master key:', error);
    return null;
  }
}

/**
 * Store encrypted private key
 */
export function setEncryptedPrivateKey(encryptedKey: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ENCRYPTED_PRIVATE_KEY, encryptedKey);
  } catch (error) {
    console.error('Failed to store encrypted private key:', error);
    throw new Error('Failed to store encrypted private key');
  }
}

/**
 * Get encrypted private key
 */
export function getEncryptedPrivateKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.ENCRYPTED_PRIVATE_KEY);
  } catch (error) {
    console.error('Failed to get encrypted private key:', error);
    return null;
  }
}

/**
 * Store public key
 */
export function setPublicKey(publicKey: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PUBLIC_KEY, publicKey);
  } catch (error) {
    console.error('Failed to store public key:', error);
    throw new Error('Failed to store public key');
  }
}

/**
 * Get public key
 */
export function getPublicKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.PUBLIC_KEY);
  } catch (error) {
    console.error('Failed to get public key:', error);
    return null;
  }
}

// ============================================================================
// In-Memory Key Management (Master Key & Private Key)
// ============================================================================

/**
 * Store master key in memory (never persisted)
 */
export function setMasterKey(key: CryptoKey): void {
  memoryStorage.setMasterKey(key);
}

/**
 * Get master key from memory
 */
export function getMasterKey(): CryptoKey | null {
  return memoryStorage.getMasterKey();
}

/**
 * Store private key in memory (never persisted)
 */
export function setPrivateKey(key: CryptoKey): void {
  memoryStorage.setPrivateKey(key);
}

/**
 * Get private key from memory
 */
export function getPrivateKey(): CryptoKey | null {
  return memoryStorage.getPrivateKey();
}

/**
 * Check if master key is available in memory
 */
export function hasMasterKey(): boolean {
  return memoryStorage.hasMasterKey();
}

/**
 * Check if private key is available in memory
 */
export function hasPrivateKey(): boolean {
  return memoryStorage.hasPrivateKey();
}

// ============================================================================
// Remember Me
// ============================================================================

/**
 * Set remember me preference
 */
export function setRememberMe(remember: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.REMEMBER_ME, remember.toString());
  } catch (error) {
    console.error('Failed to set remember me:', error);
  }
}

/**
 * Get remember me preference
 */
export function getRememberMe(): boolean {
  try {
    const value = localStorage.getItem(STORAGE_KEYS.REMEMBER_ME);
    return value === 'true';
  } catch (error) {
    console.error('Failed to get remember me:', error);
    return false;
  }
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  const tokens = getTokens();
  if (!tokens) return false;

  // Check if token is not expired
  if (isTokenExpired()) {
    return false;
  }

  // Check if master key is available in memory
  return hasMasterKey();
}

/**
 * Check if user has valid session (has tokens but may need to unlock)
 */
export function hasValidSession(): boolean {
  const tokens = getTokens();
  return tokens !== null && !isTokenExpired();
}

// ============================================================================
// Clear All Data
// ============================================================================

/**
 * Clear all stored data (logout)
 */
export function clearAllData(): void {
  try {
    // Clear localStorage
    clearTokens();
    clearUserData();
    localStorage.removeItem(STORAGE_KEYS.WRAPPED_MASTER_KEY);
    localStorage.removeItem(STORAGE_KEYS.ENCRYPTED_PRIVATE_KEY);
    localStorage.removeItem(STORAGE_KEYS.PUBLIC_KEY);
    localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME);

    // Clear in-memory storage
    memoryStorage.clear();
  } catch (error) {
    console.error('Failed to clear all data:', error);
    throw new Error('Failed to clear all data');
  }
}

/**
 * Clear only in-memory data (lock session)
 */
export function clearInMemoryData(): void {
  memoryStorage.clear();
}

/**
 * Clear everything including persistent data
 */
export function clearPersistentData(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.WRAPPED_MASTER_KEY);
    localStorage.removeItem(STORAGE_KEYS.ENCRYPTED_PRIVATE_KEY);
    localStorage.removeItem(STORAGE_KEYS.PUBLIC_KEY);
  } catch (error) {
    console.error('Failed to clear persistent data:', error);
  }
}

// ============================================================================
// Storage Info
// ============================================================================

/**
 * Get storage usage information
 */
export function getStorageInfo(): {
  used: number;
  available: number;
  percentage: number;
} {
  try {
    let used = 0;
    for (const key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        used += localStorage[key].length + key.length;
      }
    }

    // localStorage typically has 5-10MB limit
    const available = 10 * 1024 * 1024; // 10MB estimate
    const percentage = (used / available) * 100;

    return {
      used,
      available,
      percentage,
    };
  } catch (error) {
    console.error('Failed to get storage info:', error);
    return {
      used: 0,
      available: 0,
      percentage: 0,
    };
  }
}

// Export the service as a default object
const StorageService = {
  // Token management
  setTokens,
  getTokens,
  getAccessToken,
  getRefreshToken,
  isTokenExpired,
  clearTokens,

  // User data
  setUserData,
  getUserData,
  updateUserData,
  clearUserData,

  // Key storage (persistent)
  setWrappedMasterKey,
  getWrappedMasterKey,
  setEncryptedPrivateKey,
  getEncryptedPrivateKey,
  setPublicKey,
  getPublicKey,

  // Key storage (in-memory)
  setMasterKey,
  getMasterKey,
  setPrivateKey,
  getPrivateKey,
  hasMasterKey,
  hasPrivateKey,

  // Remember me
  setRememberMe,
  getRememberMe,

  // Session management
  isAuthenticated,
  hasValidSession,

  // Clear data
  clearAllData,
  clearInMemoryData,
  clearPersistentData,

  // Storage info
  getStorageInfo,
};

export default StorageService;
