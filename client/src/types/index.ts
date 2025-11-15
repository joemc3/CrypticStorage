/**
 * TypeScript Type Definitions for CrypticStorage
 */

// User and Authentication Types
export interface User {
  id: string;
  email: string;
  username: string;
  createdAt: string;
  updatedAt: string;
  storageUsed: number;
  storageLimit: number;
  twoFactorEnabled: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
  twoFactorCode?: string;
}

export interface RegisterCredentials {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  refreshToken?: string;
}

export interface TwoFactorSetup {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

// File and Storage Types
export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  encryptedSize: number;
  uploadedAt: string;
  updatedAt: string;
  isShared: boolean;
  sharedWith?: string[];
  tags?: string[];
  folderId?: string;
  thumbnailUrl?: string;
}

export interface Folder {
  id: string;
  name: string;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
}

export interface UploadProgress {
  fileId: string;
  fileName: string;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'complete' | 'error';
  error?: string;
}

export interface FileShare {
  id: string;
  fileId: string;
  sharedWith: string;
  permissions: 'view' | 'download' | 'edit';
  expiresAt?: string;
  createdAt: string;
}

export interface DownloadProgress {
  fileId: string;
  fileName: string;
  progress: number;
  status: 'downloading' | 'decrypting' | 'complete' | 'error';
  error?: string;
}

// Encryption Types
export interface EncryptionKeys {
  publicKey: string;
  privateKey: string;
  symmetricKey: string;
}

export interface EncryptedData {
  data: ArrayBuffer;
  iv: Uint8Array;
  salt: Uint8Array;
}

// Storage and Statistics Types
export interface StorageStats {
  used: number;
  limit: number;
  fileCount: number;
  folderCount: number;
  percentUsed: number;
}

export interface FileTypeStats {
  type: string;
  count: number;
  size: number;
  color: string;
}

export interface ActivityLog {
  id: string;
  type: 'upload' | 'download' | 'delete' | 'share' | 'login';
  description: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

// UI State Types
export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

export interface Modal {
  id: string;
  isOpen: boolean;
  title?: string;
  content?: React.ReactNode;
  onClose?: () => void;
}

export interface Theme {
  mode: 'light' | 'dark';
  primaryColor: string;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Search and Filter Types
export interface SearchFilters {
  query?: string;
  fileType?: string[];
  dateFrom?: string;
  dateTo?: string;
  sizeMin?: number;
  sizeMax?: number;
  tags?: string[];
  folderId?: string;
}

export interface SortOptions {
  field: 'name' | 'size' | 'uploadedAt' | 'updatedAt';
  order: 'asc' | 'desc';
}

// Error Types
export interface AppError {
  code: string;
  message: string;
  details?: any;
  timestamp: string;
}

// Route Types
export interface RouteConfig {
  path: string;
  element: React.ReactNode;
  requiresAuth?: boolean;
  title?: string;
}

// Form Types
export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'password' | 'number' | 'file' | 'select' | 'textarea';
  placeholder?: string;
  required?: boolean;
  validation?: (value: any) => string | undefined;
}

// WebCrypto Types
export interface CryptoKeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

// Settings Types
export interface UserSettings {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  notifications: {
    email: boolean;
    push: boolean;
    security: boolean;
  };
  privacy: {
    shareAnalytics: boolean;
    showActivity: boolean;
  };
  security: {
    sessionTimeout: number;
    requireTwoFactor: boolean;
  };
}

// Utility Types
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

export type FileAction = 'view' | 'download' | 'share' | 'delete' | 'rename' | 'move';

export type PermissionLevel = 'owner' | 'editor' | 'viewer';
