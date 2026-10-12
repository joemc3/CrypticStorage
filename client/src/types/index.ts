/**
 * Shared type re-exports. The services own the canonical definitions.
 */

export type {
  ApiError,
  ApiResponse,
  PaginatedResponse,
  Tokens,
  UserProfile,
  FileMetadata,
  SharedFileMetadata,
  FolderMetadata,
  ShareLink,
  PublicShareInfo,
  UserShare,
  StorageStats,
  ActivityEntry,
} from '../services/api.service';

export type { AuthUser, LoginResult } from '../services/auth.service';
export type { UploadProgress, DownloadProgress, FileListItem, SharedFileListItem, FolderListItem, DecryptedFile } from '../services/file.service';
export type { ShareLinkWithKey, CreateLinkOptions, PublicSharedFile } from '../services/share.service';

export type LoadingState = 'idle' | 'loading' | 'success' | 'error';
export type FileAction = 'preview' | 'download' | 'share' | 'delete' | 'rename' | 'move';
