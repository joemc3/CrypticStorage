/**
 * CrypticStorage - Storage Service
 *
 * localStorage holds only what the server already knows (tokens, profile and
 * the encrypted vault blobs). Decrypted keys live in memory and vanish on reload.
 */

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

/** Encrypted key material returned by the server. Useless without the password. */
export interface VaultData {
  wrappedMasterKey: string;
  encryptedPrivateKey: string;
  publicKey: string;
  salt: string;
  kdfIterations: number;
}

const KEYS = {
  TOKENS: 'cs.tokens',
  USER: 'cs.user',
  VAULT: 'cs.vault',
} as const;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Failed to persist ${key}`, error);
  }
}

// ---------------------------------------------------------------------------
// In-memory secrets
// ---------------------------------------------------------------------------

let masterKey: CryptoKey | null = null;
let privateKey: CryptoKey | null = null;
const fileKeys = new Map<string, CryptoKey>();

export function setMasterKey(key: CryptoKey | null): void {
  masterKey = key;
}
export function getMasterKey(): CryptoKey | null {
  return masterKey;
}
export function setPrivateKey(key: CryptoKey | null): void {
  privateKey = key;
}
export function getPrivateKey(): CryptoKey | null {
  return privateKey;
}
export function hasMasterKey(): boolean {
  return masterKey !== null;
}

export function cacheFileKey(fileId: string, key: CryptoKey): void {
  fileKeys.set(fileId, key);
}
export function getCachedFileKey(fileId: string): CryptoKey | undefined {
  return fileKeys.get(fileId);
}
export function forgetFileKey(fileId: string): void {
  fileKeys.delete(fileId);
}

export function clearInMemoryData(): void {
  masterKey = null;
  privateKey = null;
  fileKeys.clear();
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

export function setTokens(tokens: TokenData): void {
  write(KEYS.TOKENS, tokens);
}
export function getTokens(): TokenData | null {
  return read<TokenData>(KEYS.TOKENS);
}
export function getAccessToken(): string | null {
  return getTokens()?.accessToken ?? null;
}
export function getRefreshToken(): string | null {
  return getTokens()?.refreshToken ?? null;
}
export function clearTokens(): void {
  localStorage.removeItem(KEYS.TOKENS);
}

// ---------------------------------------------------------------------------
// Profile and vault
// ---------------------------------------------------------------------------

export function setUserData(user: UserData): void {
  write(KEYS.USER, user);
}
export function getUserData(): UserData | null {
  return read<UserData>(KEYS.USER);
}
export function updateUserData(patch: Partial<UserData>): void {
  const current = getUserData();
  if (current) setUserData({ ...current, ...patch });
}

export function setVault(vault: VaultData): void {
  write(KEYS.VAULT, vault);
}
export function getVault(): VaultData | null {
  return read<VaultData>(KEYS.VAULT);
}

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

/** Tokens and vault are present; the user may still need to unlock. */
export function hasSession(): boolean {
  return getTokens() !== null && getUserData() !== null && getVault() !== null;
}

/** Fully usable: session present and master key in memory. */
export function isUnlocked(): boolean {
  return hasSession() && hasMasterKey();
}

export function clearAllData(): void {
  clearTokens();
  localStorage.removeItem(KEYS.USER);
  localStorage.removeItem(KEYS.VAULT);
  clearInMemoryData();
}

const StorageService = {
  setMasterKey,
  getMasterKey,
  setPrivateKey,
  getPrivateKey,
  hasMasterKey,
  cacheFileKey,
  getCachedFileKey,
  forgetFileKey,
  clearInMemoryData,
  setTokens,
  getTokens,
  getAccessToken,
  getRefreshToken,
  clearTokens,
  setUserData,
  getUserData,
  updateUserData,
  setVault,
  getVault,
  hasSession,
  isUnlocked,
  clearAllData,
};

export default StorageService;
