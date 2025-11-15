/**
 * CrypticStorage - Services Index
 * Central export point for all services
 */

export { default as CryptoService } from './crypto.service';
export { default as StorageService } from './storage.service';
export { default as ApiService } from './api.service';
export { default as AuthService } from './auth.service';
export { default as FileService } from './file.service';

// Re-export types
export type {
  EncryptedData,
  KeyPair,
  DerivedKeyResult,
} from './crypto.service';

export type {
  UserData,
  TokenData,
} from './storage.service';

export type {
  ApiError,
  ApiResponse,
  PaginatedResponse,
  RegisterRequest,
  RegisterResponse,
  LoginRequest,
  LoginResponse,
  TwoFactorSetupResponse,
  TwoFactorVerifyRequest,
  RefreshTokenResponse,
  FileMetadata,
  UploadRequest,
  UploadUrlResponse,
  FolderMetadata,
  CreateFolderRequest,
  UserProfile,
  UpdateProfileRequest,
  ShareFileRequest,
  ShareResponse,
} from './api.service';

export type {
  RegisterData,
  LoginData,
  TwoFactorData,
  ChangePasswordData,
  AuthUser,
  TwoFactorSetup,
} from './auth.service';

export type {
  UploadProgress,
  DownloadProgress,
  DecryptedFile,
  DecryptedFolder,
  FileListItem,
  FolderListItem,
} from './file.service';
