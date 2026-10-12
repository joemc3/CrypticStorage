/**
 * CrypticStorage - API Service
 * Typed HTTP client for the CrypticStorage API. Every field that starts with
 * "encrypted" or "wrapped" is ciphertext produced by crypto.service.
 */

import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import StorageService from './storage.service';

// ============================================================================
// Types
// ============================================================================

export interface ApiError {
  message: string;
  statusCode: number;
  code?: string;
  errors?: Record<string, string[]>;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserProfile {
  id: string;
  email: string;
  publicKey: string;
  storageUsed: number;
  storageLimit: number;
  twoFactorEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VaultUser extends UserProfile {
  encryptedPrivateKey: string;
  wrappedMasterKey: string;
  salt: string;
  kdfIterations: number;
}

export interface RegisterRequest {
  email: string;
  passwordHash: string;
  publicKey: string;
  encryptedPrivateKey: string;
  wrappedMasterKey: string;
  salt: string;
  kdfIterations: number;
}

export interface AuthResponse {
  user: VaultUser;
  tokens: Tokens;
  requiresTwoFactor?: boolean;
}

export interface UpdateProfileRequest {
  email?: string;
  currentPasswordHash?: string;
  newPasswordHash?: string;
  salt?: string;
  kdfIterations?: number;
  wrappedMasterKey?: string;
  encryptedPrivateKey?: string;
}

export interface FileMetadata {
  id: string;
  userId: string;
  folderId?: string;
  encryptedName: string;
  encryptedNameIV: string;
  encryptedFileKey: string;
  fileKeyIV: string;
  iv: string;
  encryptedSize: number;
  mimeType: string;
  status: 'PENDING' | 'READY';
  createdAt: string;
  updatedAt: string;
}

export interface SharedFileMetadata extends FileMetadata {
  shareId: string;
  permissions: string;
  expiresAt?: string;
  sharedBy: { id: string; email: string };
}

export interface UploadRequest {
  encryptedName: string;
  encryptedNameIV: string;
  encryptedFileKey: string;
  fileKeyIV: string;
  iv: string;
  encryptedSize: number;
  mimeType: string;
  folderId?: string;
}

export interface UploadUrlResponse {
  fileId: string;
  uploadUrl: string;
  storageKey: string;
  method: 'PUT';
  expiresIn: number;
}

export interface FolderMetadata {
  id: string;
  userId: string;
  parentId?: string;
  encryptedName: string;
  encryptedNameIV: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShareLink {
  id: string;
  fileId: string;
  token: string;
  url: string;
  passwordProtected: boolean;
  expiresAt?: string;
  maxDownloads?: number;
  downloadCount: number;
  revokedAt?: string;
  createdAt: string;
}

export interface PublicShareInfo {
  token: string;
  fileId: string;
  encryptedName: string;
  encryptedNameIV: string;
  encryptedSize: number;
  mimeType: string;
  iv: string;
  passwordProtected: boolean;
  expiresAt?: string;
  downloadsRemaining?: number;
  sharedBy: string;
}

export interface UserShare {
  id: string;
  fileId: string;
  ownerId: string;
  recipientId: string;
  recipientEmail?: string;
  permissions: string;
  expiresAt?: string;
  createdAt: string;
}

export interface StorageStats {
  used: number;
  limit: number;
  fileCount: number;
  folderCount: number;
}

export interface ActivityEntry {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  createdAt: string;
}

export type ProgressHandler = (loaded: number, total: number) => void;

// ============================================================================
// Client
// ============================================================================

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

class ApiService {
  private readonly client: AxiosInstance;
  private refreshing: Promise<Tokens> | null = null;

  constructor() {
    this.client = axios.create({ baseURL: API_BASE_URL, timeout: 30_000, headers: { 'Content-Type': 'application/json' } });

    this.client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      const token = StorageService.getAccessToken();
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
        const isAuthRoute = original?.url?.startsWith('/auth/') ?? false;
        if (error.response?.status === 401 && original && !original._retried && !isAuthRoute) {
          const refreshToken = StorageService.getRefreshToken();
          if (refreshToken) {
            try {
              const tokens = await this.refreshOnce(refreshToken);
              original._retried = true;
              original.headers.Authorization = `Bearer ${tokens.accessToken}`;
              return this.client(original);
            } catch {
              StorageService.clearAllData();
              window.dispatchEvent(new CustomEvent('cs:session-expired'));
            }
          }
        }
        return Promise.reject(toApiError(error));
      }
    );
  }

  private refreshOnce(refreshToken: string): Promise<Tokens> {
    if (!this.refreshing) {
      this.refreshing = this.refresh(refreshToken)
        .then((tokens) => {
          StorageService.setTokens({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: Date.now() + tokens.expiresIn * 1000 });
          return tokens;
        })
        .finally(() => {
          this.refreshing = null;
        });
    }
    return this.refreshing;
  }

  private async get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    return (await this.client.get<ApiResponse<T>>(url, { params })).data.data;
  }
  private async post<T>(url: string, body?: unknown): Promise<T> {
    return (await this.client.post<ApiResponse<T>>(url, body)).data.data;
  }
  private async patch<T>(url: string, body?: unknown): Promise<T> {
    return (await this.client.patch<ApiResponse<T>>(url, body)).data.data;
  }
  private async delete<T>(url: string, body?: unknown): Promise<T> {
    return (await this.client.delete<ApiResponse<T>>(url, { data: body })).data.data;
  }

  // --- Auth ------------------------------------------------------------------

  register(data: RegisterRequest): Promise<AuthResponse> {
    return this.post('/auth/register', data);
  }
  login(email: string, passwordHash: string): Promise<AuthResponse> {
    return this.post('/auth/login', { email, passwordHash });
  }
  verifyTwoFactor(data: { token?: string; backupCode?: string }): Promise<AuthResponse> {
    return this.post('/auth/verify-2fa', data);
  }
  refresh(refreshToken: string): Promise<Tokens> {
    return this.post('/auth/refresh', { refreshToken });
  }
  logout(): Promise<unknown> {
    return this.post('/auth/logout');
  }

  // --- Users -----------------------------------------------------------------

  getProfile(): Promise<UserProfile> {
    return this.get('/users/profile');
  }
  updateProfile(data: UpdateProfileRequest): Promise<UserProfile> {
    return this.patch('/users/profile', data);
  }
  deleteAccount(passwordHash: string): Promise<unknown> {
    return this.delete('/users/profile', { passwordHash });
  }
  getPublicKey(email: string): Promise<{ id: string; email: string; publicKey: string }> {
    return this.get('/users/public-key', { email });
  }
  setupTwoFactor(): Promise<{ secret: string; qrCode: string }> {
    return this.post('/users/2fa/setup');
  }
  enableTwoFactor(token: string): Promise<{ backupCodes: string[] }> {
    return this.post('/users/2fa/enable', { token });
  }
  disableTwoFactor(token: string, passwordHash: string): Promise<unknown> {
    return this.post('/users/2fa/disable', { token, passwordHash });
  }
  regenerateBackupCodes(passwordHash: string): Promise<{ backupCodes: string[] }> {
    return this.post('/users/2fa/backup-codes', { passwordHash });
  }
  getStorageStats(): Promise<StorageStats> {
    return this.get('/storage/stats');
  }
  getActivity(page = 1, pageSize = 50): Promise<PaginatedResponse<ActivityEntry>> {
    return this.get('/activity', { page, pageSize });
  }

  // --- Files -----------------------------------------------------------------

  getFiles(folderId?: string): Promise<FileMetadata[]> {
    return this.get('/files', { folderId });
  }
  getFile(fileId: string): Promise<FileMetadata> {
    return this.get(`/files/${fileId}`);
  }
  createUploadUrl(data: UploadRequest): Promise<UploadUrlResponse> {
    return this.post('/files/upload-url', data);
  }
  async uploadContent(uploadUrl: string, blob: Blob, onProgress?: ProgressHandler): Promise<void> {
    await axios.put(uploadUrl, blob, {
      headers: { 'Content-Type': 'application/octet-stream' },
      timeout: 0,
      onUploadProgress: (e) => onProgress?.(e.loaded, e.total ?? blob.size),
    });
  }
  confirmUpload(fileId: string): Promise<FileMetadata> {
    return this.post(`/files/${fileId}/confirm`);
  }
  getDownloadUrl(fileId: string): Promise<{ downloadUrl: string; expiresIn: number }> {
    return this.get(`/files/${fileId}/download-url`);
  }
  async downloadContent(downloadUrl: string, onProgress?: ProgressHandler): Promise<Blob> {
    // arraybuffer works in browsers and Node alike; 'blob' is browser-only.
    const res = await axios.get<ArrayBuffer>(downloadUrl, {
      responseType: 'arraybuffer',
      timeout: 0,
      onDownloadProgress: (e) => onProgress?.(e.loaded, e.total ?? e.loaded),
    });
    return new Blob([res.data], { type: 'application/octet-stream' });
  }
  updateFile(fileId: string, data: { encryptedName?: string; encryptedNameIV?: string; folderId?: string | null }): Promise<FileMetadata> {
    return this.patch(`/files/${fileId}`, data);
  }
  moveFile(fileId: string, folderId: string | null): Promise<FileMetadata> {
    return this.post(`/files/${fileId}/move`, { folderId });
  }
  copyFile(fileId: string, folderId?: string | null): Promise<FileMetadata> {
    return this.post(`/files/${fileId}/copy`, { folderId });
  }
  deleteFile(fileId: string): Promise<unknown> {
    return this.delete(`/files/${fileId}`);
  }

  // --- Folders ---------------------------------------------------------------

  getFolders(parentId?: string): Promise<FolderMetadata[]> {
    return this.get('/folders', { parentId });
  }
  getFolder(folderId: string): Promise<FolderMetadata> {
    return this.get(`/folders/${folderId}`);
  }
  createFolder(data: { encryptedName: string; encryptedNameIV: string; parentId?: string }): Promise<FolderMetadata> {
    return this.post('/folders', data);
  }
  updateFolder(folderId: string, data: { encryptedName?: string; encryptedNameIV?: string; parentId?: string | null }): Promise<FolderMetadata> {
    return this.patch(`/folders/${folderId}`, data);
  }
  moveFolder(folderId: string, parentId: string | null): Promise<FolderMetadata> {
    return this.post(`/folders/${folderId}/move`, { parentId });
  }
  deleteFolder(folderId: string): Promise<unknown> {
    return this.delete(`/folders/${folderId}`);
  }

  // --- Sharing ---------------------------------------------------------------

  createShareLink(data: { fileId: string; password?: string; expiresAt?: string; maxDownloads?: number }): Promise<ShareLink> {
    return this.post('/shares/links', data);
  }
  getFileShareLinks(fileId: string): Promise<ShareLink[]> {
    return this.get(`/files/${fileId}/links`);
  }
  revokeShareLink(linkId: string): Promise<unknown> {
    return this.delete(`/shares/links/${linkId}`);
  }
  getPublicShare(token: string): Promise<PublicShareInfo> {
    return this.get(`/shares/public/${token}`);
  }
  getPublicShareDownloadUrl(token: string, password?: string): Promise<{ downloadUrl: string; expiresIn: number }> {
    return this.post(`/shares/public/${token}/download-url`, { password });
  }
  shareWithUser(data: { fileId: string; recipientEmail: string; encryptedFileKey: string; permissions: 'read' | 'write'; expiresAt?: string }): Promise<UserShare> {
    return this.post('/shares', data);
  }
  getFileShares(fileId: string): Promise<UserShare[]> {
    return this.get(`/files/${fileId}/shares`);
  }
  revokeUserShare(shareId: string): Promise<unknown> {
    return this.delete(`/shares/${shareId}`);
  }
  getSharedWithMe(): Promise<SharedFileMetadata[]> {
    return this.get('/shares/with-me');
  }
}

export function toApiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      const data = error.response.data as { message?: string; code?: string; errors?: Record<string, string[]> } | undefined;
      return { message: data?.message || error.message, statusCode: error.response.status, code: data?.code, errors: data?.errors };
    }
    return { message: 'Cannot reach the server. Check your connection.', statusCode: 0 };
  }
  if (error && typeof error === 'object' && 'statusCode' in error) return error as ApiError;
  return { message: error instanceof Error ? error.message : 'Unexpected error', statusCode: 0 };
}

export default new ApiService();
