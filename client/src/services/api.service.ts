/**
 * CrypticStorage - API Service
 * Axios-based API client with interceptors and type-safe methods
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import StorageService from './storage.service';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface ApiError {
  message: string;
  statusCode: number;
  errors?: Record<string, string[]>;
}

export interface ApiResponse<T = any> {
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

// Auth types
export interface RegisterRequest {
  email: string;
  passwordHash: string;
  publicKey: string;
  encryptedPrivateKey: string;
  wrappedMasterKey: string;
  salt: string;
}

export interface RegisterResponse {
  user: {
    id: string;
    email: string;
    publicKey: string;
    createdAt: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}

export interface LoginRequest {
  email: string;
  passwordHash: string;
}

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    publicKey: string;
    encryptedPrivateKey: string;
    wrappedMasterKey: string;
    salt: string;
    storageUsed: number;
    storageLimit: number;
    twoFactorEnabled: boolean;
    createdAt: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
  requiresTwoFactor?: boolean;
}

export interface TwoFactorSetupResponse {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

export interface TwoFactorVerifyRequest {
  token: string;
  backupCode?: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// File types
export interface FileMetadata {
  id: string;
  encryptedName: string;
  encryptedNameIV: string;
  encryptedSize: number;
  mimeType: string;
  storageKey: string;
  iv: string;
  folderId?: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface UploadRequest {
  encryptedName: string;
  encryptedNameIV: string;
  encryptedSize: number;
  mimeType: string;
  iv: string;
  folderId?: string;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  fileId: string;
  storageKey: string;
}

// Folder types
export interface FolderMetadata {
  id: string;
  encryptedName: string;
  encryptedNameIV: string;
  parentId?: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFolderRequest {
  encryptedName: string;
  encryptedNameIV: string;
  parentId?: string;
}

// User types
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

export interface UpdateProfileRequest {
  email?: string;
  currentPasswordHash?: string;
  newPasswordHash?: string;
  salt?: string;
  wrappedMasterKey?: string;
  encryptedPrivateKey?: string;
}

// Share types
export interface ShareFileRequest {
  fileId: string;
  recipientEmail: string;
  encryptedFileKey: string;
  permissions: 'read' | 'write';
  expiresAt?: string;
}

export interface ShareResponse {
  id: string;
  fileId: string;
  recipientId: string;
  permissions: string;
  expiresAt?: string;
  createdAt: string;
}

// ============================================================================
// API Configuration
// ============================================================================

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
const API_TIMEOUT = 30000; // 30 seconds

// ============================================================================
// Axios Instance
// ============================================================================

class ApiService {
  private client: AxiosInstance;
  private isRefreshing = false;
  private refreshSubscribers: ((token: string) => void)[] = [];

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: API_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  // ============================================================================
  // Interceptors
  // ============================================================================

  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const token = StorageService.getAccessToken();

        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        return config;
      },
      (error: AxiosError) => {
        return Promise.reject(this.handleError(error));
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response: AxiosResponse) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & {
          _retry?: boolean;
        };

        // Handle 401 Unauthorized errors
        if (error.response?.status === 401 && !originalRequest._retry) {
          if (this.isRefreshing) {
            // Wait for token refresh
            return new Promise((resolve) => {
              this.refreshSubscribers.push((token: string) => {
                if (originalRequest.headers) {
                  originalRequest.headers.Authorization = `Bearer ${token}`;
                }
                resolve(this.client(originalRequest));
              });
            });
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          try {
            const refreshToken = StorageService.getRefreshToken();

            if (!refreshToken) {
              throw new Error('No refresh token available');
            }

            const response = await this.refreshToken(refreshToken);

            const { accessToken, refreshToken: newRefreshToken, expiresIn } = response;

            // Store new tokens
            StorageService.setTokens({
              accessToken,
              refreshToken: newRefreshToken,
              expiresAt: Date.now() + expiresIn * 1000,
            });

            // Retry all queued requests
            this.refreshSubscribers.forEach((callback) => callback(accessToken));
            this.refreshSubscribers = [];

            // Retry original request
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            }

            return this.client(originalRequest);
          } catch (refreshError) {
            // Refresh failed, logout user
            StorageService.clearAllData();
            window.location.href = '/login';
            return Promise.reject(this.handleError(error));
          } finally {
            this.isRefreshing = false;
          }
        }

        return Promise.reject(this.handleError(error));
      }
    );
  }

  // ============================================================================
  // Error Handling
  // ============================================================================

  private handleError(error: AxiosError): ApiError {
    if (error.response) {
      // Server responded with error
      const data = error.response.data as any;

      return {
        message: data?.message || error.message || 'An error occurred',
        statusCode: error.response.status,
        errors: data?.errors,
      };
    } else if (error.request) {
      // No response received
      return {
        message: 'No response from server. Please check your connection.',
        statusCode: 0,
      };
    } else {
      // Request setup error
      return {
        message: error.message || 'An error occurred',
        statusCode: 0,
      };
    }
  }

  // ============================================================================
  // Authentication Endpoints
  // ============================================================================

  async register(data: RegisterRequest): Promise<RegisterResponse> {
    const response = await this.client.post<ApiResponse<RegisterResponse>>(
      '/auth/register',
      data
    );
    return response.data.data;
  }

  async login(data: LoginRequest): Promise<LoginResponse> {
    const response = await this.client.post<ApiResponse<LoginResponse>>('/auth/login', data);
    return response.data.data;
  }

  async verifyTwoFactor(data: TwoFactorVerifyRequest): Promise<LoginResponse> {
    const response = await this.client.post<ApiResponse<LoginResponse>>(
      '/auth/verify-2fa',
      data
    );
    return response.data.data;
  }

  async logout(): Promise<void> {
    await this.client.post('/auth/logout');
  }

  async refreshToken(refreshToken: string): Promise<RefreshTokenResponse> {
    const response = await this.client.post<ApiResponse<RefreshTokenResponse>>(
      '/auth/refresh',
      { refreshToken }
    );
    return response.data.data;
  }

  // ============================================================================
  // User Endpoints
  // ============================================================================

  async getProfile(): Promise<UserProfile> {
    const response = await this.client.get<ApiResponse<UserProfile>>('/users/profile');
    return response.data.data;
  }

  async updateProfile(data: UpdateProfileRequest): Promise<UserProfile> {
    const response = await this.client.patch<ApiResponse<UserProfile>>('/users/profile', data);
    return response.data.data;
  }

  async deleteAccount(passwordHash: string): Promise<void> {
    await this.client.delete('/users/profile', {
      data: { passwordHash },
    });
  }

  // ============================================================================
  // Two-Factor Authentication Endpoints
  // ============================================================================

  async setupTwoFactor(): Promise<TwoFactorSetupResponse> {
    const response = await this.client.post<ApiResponse<TwoFactorSetupResponse>>(
      '/users/2fa/setup'
    );
    return response.data.data;
  }

  async enableTwoFactor(token: string): Promise<{ backupCodes: string[] }> {
    const response = await this.client.post<ApiResponse<{ backupCodes: string[] }>>(
      '/users/2fa/enable',
      { token }
    );
    return response.data.data;
  }

  async disableTwoFactor(token: string, passwordHash: string): Promise<void> {
    await this.client.post('/users/2fa/disable', { token, passwordHash });
  }

  async regenerateBackupCodes(passwordHash: string): Promise<{ backupCodes: string[] }> {
    const response = await this.client.post<ApiResponse<{ backupCodes: string[] }>>(
      '/users/2fa/backup-codes',
      { passwordHash }
    );
    return response.data.data;
  }

  // ============================================================================
  // File Endpoints
  // ============================================================================

  async getFiles(folderId?: string): Promise<FileMetadata[]> {
    const response = await this.client.get<ApiResponse<FileMetadata[]>>('/files', {
      params: { folderId },
    });
    return response.data.data;
  }

  async getFile(fileId: string): Promise<FileMetadata> {
    const response = await this.client.get<ApiResponse<FileMetadata>>(`/files/${fileId}`);
    return response.data.data;
  }

  async createUploadUrl(data: UploadRequest): Promise<UploadUrlResponse> {
    const response = await this.client.post<ApiResponse<UploadUrlResponse>>(
      '/files/upload-url',
      data
    );
    return response.data.data;
  }

  async uploadFile(uploadUrl: string, file: Blob): Promise<void> {
    await axios.put(uploadUrl, file, {
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    });
  }

  async confirmUpload(fileId: string): Promise<FileMetadata> {
    const response = await this.client.post<ApiResponse<FileMetadata>>(
      `/files/${fileId}/confirm`
    );
    return response.data.data;
  }

  async getDownloadUrl(fileId: string): Promise<{ downloadUrl: string }> {
    const response = await this.client.get<ApiResponse<{ downloadUrl: string }>>(
      `/files/${fileId}/download-url`
    );
    return response.data.data;
  }

  async downloadFile(downloadUrl: string): Promise<Blob> {
    const response = await axios.get(downloadUrl, {
      responseType: 'blob',
    });
    return response.data;
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.client.delete(`/files/${fileId}`);
  }

  async updateFileMetadata(
    fileId: string,
    data: { encryptedName?: string; encryptedNameIV?: string; folderId?: string }
  ): Promise<FileMetadata> {
    const response = await this.client.patch<ApiResponse<FileMetadata>>(
      `/files/${fileId}`,
      data
    );
    return response.data.data;
  }

  async moveFile(fileId: string, folderId?: string): Promise<FileMetadata> {
    const response = await this.client.post<ApiResponse<FileMetadata>>(
      `/files/${fileId}/move`,
      { folderId }
    );
    return response.data.data;
  }

  async copyFile(fileId: string, folderId?: string): Promise<FileMetadata> {
    const response = await this.client.post<ApiResponse<FileMetadata>>(
      `/files/${fileId}/copy`,
      { folderId }
    );
    return response.data.data;
  }

  // ============================================================================
  // Folder Endpoints
  // ============================================================================

  async getFolders(parentId?: string): Promise<FolderMetadata[]> {
    const response = await this.client.get<ApiResponse<FolderMetadata[]>>('/folders', {
      params: { parentId },
    });
    return response.data.data;
  }

  async getFolder(folderId: string): Promise<FolderMetadata> {
    const response = await this.client.get<ApiResponse<FolderMetadata>>(`/folders/${folderId}`);
    return response.data.data;
  }

  async createFolder(data: CreateFolderRequest): Promise<FolderMetadata> {
    const response = await this.client.post<ApiResponse<FolderMetadata>>('/folders', data);
    return response.data.data;
  }

  async updateFolder(
    folderId: string,
    data: { encryptedName?: string; encryptedNameIV?: string; parentId?: string }
  ): Promise<FolderMetadata> {
    const response = await this.client.patch<ApiResponse<FolderMetadata>>(
      `/folders/${folderId}`,
      data
    );
    return response.data.data;
  }

  async deleteFolder(folderId: string): Promise<void> {
    await this.client.delete(`/folders/${folderId}`);
  }

  async moveFolder(folderId: string, parentId?: string): Promise<FolderMetadata> {
    const response = await this.client.post<ApiResponse<FolderMetadata>>(
      `/folders/${folderId}/move`,
      { parentId }
    );
    return response.data.data;
  }

  // ============================================================================
  // Sharing Endpoints
  // ============================================================================

  async shareFile(data: ShareFileRequest): Promise<ShareResponse> {
    const response = await this.client.post<ApiResponse<ShareResponse>>('/shares', data);
    return response.data.data;
  }

  async getFileShares(fileId: string): Promise<ShareResponse[]> {
    const response = await this.client.get<ApiResponse<ShareResponse[]>>(`/files/${fileId}/shares`);
    return response.data.data;
  }

  async revokeShare(shareId: string): Promise<void> {
    await this.client.delete(`/shares/${shareId}`);
  }

  async getSharedWithMe(): Promise<FileMetadata[]> {
    const response = await this.client.get<ApiResponse<FileMetadata[]>>('/shares/with-me');
    return response.data.data;
  }

  // ============================================================================
  // Storage Endpoints
  // ============================================================================

  async getStorageStats(): Promise<{
    used: number;
    limit: number;
    fileCount: number;
    folderCount: number;
  }> {
    const response = await this.client.get<
      ApiResponse<{
        used: number;
        limit: number;
        fileCount: number;
        folderCount: number;
      }>
    >('/storage/stats');
    return response.data.data;
  }

  // ============================================================================
  // Activity Log Endpoints
  // ============================================================================

  async getActivityLog(page: number = 1, pageSize: number = 50): Promise<
    PaginatedResponse<{
      id: string;
      action: string;
      resourceType: string;
      resourceId: string;
      metadata: Record<string, any>;
      ipAddress: string;
      userAgent: string;
      createdAt: string;
    }>
  > {
    const response = await this.client.get<
      ApiResponse<
        PaginatedResponse<{
          id: string;
          action: string;
          resourceType: string;
          resourceId: string;
          metadata: Record<string, any>;
          ipAddress: string;
          userAgent: string;
          createdAt: string;
        }>
      >
    >('/activity', {
      params: { page, pageSize },
    });
    return response.data.data;
  }
}

// Export singleton instance
export default new ApiService();
