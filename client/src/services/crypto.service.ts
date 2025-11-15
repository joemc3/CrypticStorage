/**
 * CrypticStorage - Cryptographic Service
 * Provides client-side encryption using Web Crypto API
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface EncryptedData {
  data: string; // Base64 encoded encrypted data
  iv: string; // Base64 encoded initialization vector
  salt?: string; // Base64 encoded salt (for password-derived keys)
}

export interface KeyPair {
  publicKey: string; // Base64 encoded public key
  privateKey: string; // Base64 encoded encrypted private key
}

export interface DerivedKeyResult {
  key: CryptoKey;
  salt: Uint8Array;
}

// ============================================================================
// Constants
// ============================================================================

const PBKDF2_ITERATIONS = 100000;
const AES_KEY_LENGTH = 256;
const RSA_KEY_LENGTH = 4096;
const AES_ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12; // 96 bits for GCM
const CHUNK_SIZE = 64 * 1024 * 1024; // 64MB chunks for large files

// ============================================================================
// Helper Functions - ArrayBuffer/Base64 Conversions
// ============================================================================

/**
 * Convert ArrayBuffer to Base64 string
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert string to ArrayBuffer
 */
export function stringToArrayBuffer(str: string): ArrayBuffer {
  const encoder = new TextEncoder();
  return encoder.encode(str);
}

/**
 * Convert ArrayBuffer to string
 */
export function arrayBufferToString(buffer: ArrayBuffer): string {
  const decoder = new TextDecoder();
  return decoder.decode(buffer);
}

/**
 * Generate random bytes
 */
export function generateRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

// ============================================================================
// Key Derivation
// ============================================================================

/**
 * Derive a cryptographic key from a password using PBKDF2
 * @param password - User password
 * @param salt - Salt (if not provided, a new one will be generated)
 * @param iterations - Number of iterations (default: 100,000)
 * @returns Derived key and salt
 */
export async function deriveKeyFromPassword(
  password: string,
  salt?: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS
): Promise<DerivedKeyResult> {
  const usedSalt = salt || generateRandomBytes(32);

  // Import password as key material
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    stringToArrayBuffer(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  // Derive key using PBKDF2
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: usedSalt,
      iterations,
      hash: 'SHA-256',
    },
    passwordKey,
    {
      name: AES_ALGORITHM,
      length: AES_KEY_LENGTH,
    },
    true,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );

  return { key, salt: usedSalt };
}

// ============================================================================
// Master Key Generation
// ============================================================================

/**
 * Generate a new AES-256 master key
 * @returns CryptoKey for AES-256-GCM
 */
export async function generateMasterKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    {
      name: AES_ALGORITHM,
      length: AES_KEY_LENGTH,
    },
    true,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );
}

/**
 * Export master key as raw bytes
 */
export async function exportMasterKey(key: CryptoKey): Promise<ArrayBuffer> {
  return await crypto.subtle.exportKey('raw', key);
}

/**
 * Import master key from raw bytes
 */
export async function importMasterKey(keyData: ArrayBuffer): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    keyData,
    {
      name: AES_ALGORITHM,
      length: AES_KEY_LENGTH,
    },
    true,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );
}

// ============================================================================
// RSA Key Pair Generation
// ============================================================================

/**
 * Generate RSA-4096 key pair for asymmetric encryption
 * @returns Public and private key pair
 */
export async function generateRSAKeyPair(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: RSA_KEY_LENGTH,
      publicExponent: new Uint8Array([1, 0, 1]), // 65537
      hash: 'SHA-256',
    },
    true,
    ['wrapKey', 'unwrapKey']
  );
}

/**
 * Export RSA public key
 */
export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('spki', publicKey);
  return arrayBufferToBase64(exported);
}

/**
 * Import RSA public key
 */
export async function importPublicKey(publicKeyData: string): Promise<CryptoKey> {
  const keyData = base64ToArrayBuffer(publicKeyData);
  return await crypto.subtle.importKey(
    'spki',
    keyData,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    ['wrapKey']
  );
}

/**
 * Export RSA private key
 */
export async function exportPrivateKey(privateKey: CryptoKey): Promise<ArrayBuffer> {
  return await crypto.subtle.exportKey('pkcs8', privateKey);
}

/**
 * Import RSA private key
 */
export async function importPrivateKey(privateKeyData: ArrayBuffer): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'pkcs8',
    privateKeyData,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    ['unwrapKey']
  );
}

// ============================================================================
// Key Wrapping/Unwrapping
// ============================================================================

/**
 * Wrap (encrypt) a key with another key
 * @param keyToWrap - Key to be encrypted
 * @param wrappingKey - Key used for encryption
 * @returns Encrypted key data with IV
 */
export async function wrapKey(
  keyToWrap: CryptoKey,
  wrappingKey: CryptoKey
): Promise<EncryptedData> {
  const iv = generateRandomBytes(IV_LENGTH);

  const wrappedKey = await crypto.subtle.wrapKey(
    'raw',
    keyToWrap,
    wrappingKey,
    {
      name: AES_ALGORITHM,
      iv,
    }
  );

  return {
    data: arrayBufferToBase64(wrappedKey),
    iv: arrayBufferToBase64(iv),
  };
}

/**
 * Unwrap (decrypt) a key with another key
 * @param wrappedKeyData - Encrypted key data
 * @param unwrappingKey - Key used for decryption
 * @returns Decrypted CryptoKey
 */
export async function unwrapKey(
  wrappedKeyData: EncryptedData,
  unwrappingKey: CryptoKey
): Promise<CryptoKey> {
  const wrappedKey = base64ToArrayBuffer(wrappedKeyData.data);
  const iv = base64ToArrayBuffer(wrappedKeyData.iv);

  return await crypto.subtle.unwrapKey(
    'raw',
    wrappedKey,
    unwrappingKey,
    {
      name: AES_ALGORITHM,
      iv,
    },
    {
      name: AES_ALGORITHM,
      length: AES_KEY_LENGTH,
    },
    true,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );
}

// ============================================================================
// String Encryption/Decryption (for filenames, folder names)
// ============================================================================

/**
 * Encrypt a string (e.g., filename, folder name)
 * @param plaintext - String to encrypt
 * @param key - Encryption key
 * @returns Encrypted data with IV
 */
export async function encryptString(
  plaintext: string,
  key: CryptoKey
): Promise<EncryptedData> {
  const iv = generateRandomBytes(IV_LENGTH);
  const data = stringToArrayBuffer(plaintext);

  const encryptedData = await crypto.subtle.encrypt(
    {
      name: AES_ALGORITHM,
      iv,
    },
    key,
    data
  );

  return {
    data: arrayBufferToBase64(encryptedData),
    iv: arrayBufferToBase64(iv),
  };
}

/**
 * Decrypt a string
 * @param encryptedData - Encrypted data with IV
 * @param key - Decryption key
 * @returns Decrypted string
 */
export async function decryptString(
  encryptedData: EncryptedData,
  key: CryptoKey
): Promise<string> {
  const data = base64ToArrayBuffer(encryptedData.data);
  const iv = base64ToArrayBuffer(encryptedData.iv);

  const decryptedData = await crypto.subtle.decrypt(
    {
      name: AES_ALGORITHM,
      iv,
    },
    key,
    data
  );

  return arrayBufferToString(decryptedData);
}

// ============================================================================
// File Encryption/Decryption (chunked for large files)
// ============================================================================

/**
 * Encrypt a file with chunked processing for large files
 * @param file - File or Blob to encrypt
 * @param key - Encryption key
 * @param onProgress - Progress callback (0-100)
 * @returns Encrypted file blob and IV
 */
export async function encryptFile(
  file: File | Blob,
  key: CryptoKey,
  onProgress?: (progress: number) => void
): Promise<{ encryptedBlob: Blob; iv: string }> {
  const iv = generateRandomBytes(IV_LENGTH);
  const fileSize = file.size;
  const chunks: Blob[] = [];

  let offset = 0;

  while (offset < fileSize) {
    const chunk = file.slice(offset, offset + CHUNK_SIZE);
    const chunkBuffer = await chunk.arrayBuffer();

    const encryptedChunk = await crypto.subtle.encrypt(
      {
        name: AES_ALGORITHM,
        iv,
      },
      key,
      chunkBuffer
    );

    chunks.push(new Blob([encryptedChunk]));
    offset += CHUNK_SIZE;

    if (onProgress) {
      const progress = Math.min(100, (offset / fileSize) * 100);
      onProgress(progress);
    }
  }

  const encryptedBlob = new Blob(chunks);

  return {
    encryptedBlob,
    iv: arrayBufferToBase64(iv),
  };
}

/**
 * Decrypt a file with chunked processing for large files
 * @param encryptedBlob - Encrypted file blob
 * @param iv - Initialization vector (base64)
 * @param key - Decryption key
 * @param onProgress - Progress callback (0-100)
 * @returns Decrypted file blob
 */
export async function decryptFile(
  encryptedBlob: Blob,
  iv: string,
  key: CryptoKey,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const ivBuffer = base64ToArrayBuffer(iv);
  const fileSize = encryptedBlob.size;
  const chunks: Blob[] = [];

  let offset = 0;

  // AES-GCM adds 16 bytes authentication tag
  const encryptedChunkSize = CHUNK_SIZE + 16;

  while (offset < fileSize) {
    const chunk = encryptedBlob.slice(offset, offset + encryptedChunkSize);
    const chunkBuffer = await chunk.arrayBuffer();

    const decryptedChunk = await crypto.subtle.decrypt(
      {
        name: AES_ALGORITHM,
        iv: ivBuffer,
      },
      key,
      chunkBuffer
    );

    chunks.push(new Blob([decryptedChunk]));
    offset += encryptedChunkSize;

    if (onProgress) {
      const progress = Math.min(100, (offset / fileSize) * 100);
      onProgress(progress);
    }
  }

  return new Blob(chunks);
}

/**
 * Encrypt file in a single operation (for smaller files)
 * @param file - File or Blob to encrypt
 * @param key - Encryption key
 * @returns Encrypted file blob and IV
 */
export async function encryptFileSingle(
  file: File | Blob,
  key: CryptoKey
): Promise<{ encryptedBlob: Blob; iv: string }> {
  const iv = generateRandomBytes(IV_LENGTH);
  const fileBuffer = await file.arrayBuffer();

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: AES_ALGORITHM,
      iv,
    },
    key,
    fileBuffer
  );

  return {
    encryptedBlob: new Blob([encryptedBuffer]),
    iv: arrayBufferToBase64(iv),
  };
}

/**
 * Decrypt file in a single operation (for smaller files)
 * @param encryptedBlob - Encrypted file blob
 * @param iv - Initialization vector (base64)
 * @param key - Decryption key
 * @returns Decrypted file blob
 */
export async function decryptFileSingle(
  encryptedBlob: Blob,
  iv: string,
  key: CryptoKey
): Promise<Blob> {
  const ivBuffer = base64ToArrayBuffer(iv);
  const encryptedBuffer = await encryptedBlob.arrayBuffer();

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: AES_ALGORITHM,
      iv: ivBuffer,
    },
    key,
    encryptedBuffer
  );

  return new Blob([decryptedBuffer]);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a random filename for encrypted storage
 */
export function generateRandomFilename(extension: string = ''): string {
  const randomBytes = generateRandomBytes(16);
  const filename = arrayBufferToBase64(randomBytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return extension ? `${filename}.${extension}` : filename;
}

/**
 * Hash data using SHA-256
 */
export async function sha256(data: string | ArrayBuffer): Promise<string> {
  const buffer = typeof data === 'string' ? stringToArrayBuffer(data) : data;
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return arrayBufferToBase64(hashBuffer);
}

/**
 * Generate a fingerprint for a key (for verification)
 */
export async function generateKeyFingerprint(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('raw', key);
  const hash = await sha256(exported);
  return hash.substring(0, 16); // First 16 chars
}

// Export the service as a default object
const CryptoService = {
  // Conversion helpers
  arrayBufferToBase64,
  base64ToArrayBuffer,
  stringToArrayBuffer,
  arrayBufferToString,
  generateRandomBytes,

  // Key derivation
  deriveKeyFromPassword,

  // Master key
  generateMasterKey,
  exportMasterKey,
  importMasterKey,

  // RSA keys
  generateRSAKeyPair,
  exportPublicKey,
  importPublicKey,
  exportPrivateKey,
  importPrivateKey,

  // Key wrapping
  wrapKey,
  unwrapKey,

  // String encryption
  encryptString,
  decryptString,

  // File encryption
  encryptFile,
  decryptFile,
  encryptFileSingle,
  decryptFileSingle,

  // Utilities
  generateRandomFilename,
  sha256,
  generateKeyFingerprint,
};

export default CryptoService;
