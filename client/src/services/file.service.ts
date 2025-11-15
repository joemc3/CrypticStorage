/**
 * CrypticStorage - File Service
 * Handles file operations with client-side encryption
 */

import CryptoService from './crypto.service';
import ApiService from './api.service';
import StorageService from './storage.service';
import type { FileMetadata, FolderMetadata } from './api.service';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface UploadProgress {
  fileId?: string;
  fileName: string;
  totalSize: number;
  uploadedSize: number;
  percentage: number;
  status: 'preparing' | 'encrypting' | 'uploading' | 'confirming' | 'completed' | 'failed';
  error?: string;
}

export interface DownloadProgress {
  fileId: string;
  fileName: string;
  totalSize: number;
  downloadedSize: number;
  percentage: number;
  status: 'downloading' | 'decrypting' | 'completed' | 'failed';
  error?: string;
}

export interface DecryptedFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  blob: Blob;
  folderId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DecryptedFolder {
  id: string;
  name: string;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FileListItem {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  folderId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FolderListItem {
  id: string;
  name: string;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// File Upload
// ============================================================================

/**
 * Upload a file with client-side encryption
 * @param file - File to upload
 * @param folderId - Optional folder ID
 * @param onProgress - Progress callback
 * @returns Uploaded file metadata
 */
export async function uploadFile(
  file: File,
  folderId?: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<FileListItem> {
  try {
    const masterKey = StorageService.getMasterKey();
    if (!masterKey) {
      throw new Error('Master key not available. Please login again.');
    }

    // Initialize progress
    const progress: UploadProgress = {
      fileName: file.name,
      totalSize: file.size,
      uploadedSize: 0,
      percentage: 0,
      status: 'preparing',
    };
    onProgress?.(progress);

    // 1. Encrypt file name
    progress.status = 'encrypting';
    onProgress?.(progress);

    const encryptedFileName = await CryptoService.encryptString(file.name, masterKey);

    // 2. Encrypt file content
    const { encryptedBlob, iv } = await CryptoService.encryptFile(
      file,
      masterKey,
      (encryptionProgress) => {
        progress.percentage = encryptionProgress * 0.3; // 0-30% for encryption
        onProgress?.(progress);
      }
    );

    // 3. Create upload URL
    progress.status = 'uploading';
    progress.percentage = 30;
    onProgress?.(progress);

    const uploadData = await ApiService.createUploadUrl({
      encryptedName: encryptedFileName.data,
      encryptedNameIV: encryptedFileName.iv,
      encryptedSize: encryptedBlob.size,
      mimeType: file.type || 'application/octet-stream',
      iv,
      folderId,
    });

    progress.fileId = uploadData.fileId;

    // 4. Upload encrypted file
    await ApiService.uploadFile(uploadData.uploadUrl, encryptedBlob);

    progress.percentage = 90;
    progress.status = 'confirming';
    onProgress?.(progress);

    // 5. Confirm upload
    const metadata = await ApiService.confirmUpload(uploadData.fileId);

    // 6. Complete
    progress.percentage = 100;
    progress.status = 'completed';
    progress.uploadedSize = file.size;
    onProgress?.(progress);

    return {
      id: metadata.id,
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      folderId: metadata.folderId,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
    };
  } catch (error: any) {
    console.error('File upload failed:', error);

    if (onProgress) {
      onProgress({
        fileName: file.name,
        totalSize: file.size,
        uploadedSize: 0,
        percentage: 0,
        status: 'failed',
        error: error.message || 'Upload failed',
      });
    }

    throw new Error(error.message || 'Failed to upload file');
  }
}

/**
 * Upload multiple files
 * @param files - Files to upload
 * @param folderId - Optional folder ID
 * @param onProgress - Progress callback for each file
 * @returns Array of uploaded file metadata
 */
export async function uploadMultipleFiles(
  files: File[],
  folderId?: string,
  onProgress?: (fileIndex: number, progress: UploadProgress) => void
): Promise<FileListItem[]> {
  const results: FileListItem[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const result = await uploadFile(file, folderId, (progress) => {
        onProgress?.(i, progress);
      });
      results.push(result);
    } catch (error) {
      console.error(`Failed to upload file ${file.name}:`, error);
      // Continue with next file
    }
  }

  return results;
}

// ============================================================================
// File Download
// ============================================================================

/**
 * Download and decrypt a file
 * @param fileId - File ID to download
 * @param onProgress - Progress callback
 * @returns Decrypted file
 */
export async function downloadFile(
  fileId: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<DecryptedFile> {
  try {
    const masterKey = StorageService.getMasterKey();
    if (!masterKey) {
      throw new Error('Master key not available. Please login again.');
    }

    // 1. Get file metadata
    const metadata = await ApiService.getFile(fileId);

    // Initialize progress
    const progress: DownloadProgress = {
      fileId,
      fileName: '(encrypted)',
      totalSize: metadata.encryptedSize,
      downloadedSize: 0,
      percentage: 0,
      status: 'downloading',
    };
    onProgress?.(progress);

    // 2. Decrypt file name
    const fileName = await CryptoService.decryptString(
      {
        data: metadata.encryptedName,
        iv: metadata.encryptedNameIV,
      },
      masterKey
    );

    progress.fileName = fileName;
    onProgress?.(progress);

    // 3. Get download URL
    const { downloadUrl } = await ApiService.getDownloadUrl(fileId);

    // 4. Download encrypted file
    const encryptedBlob = await ApiService.downloadFile(downloadUrl);

    progress.percentage = 50;
    progress.downloadedSize = encryptedBlob.size;
    onProgress?.(progress);

    // 5. Decrypt file
    progress.status = 'decrypting';
    onProgress?.(progress);

    const decryptedBlob = await CryptoService.decryptFile(
      encryptedBlob,
      metadata.iv,
      masterKey,
      (decryptionProgress) => {
        progress.percentage = 50 + decryptionProgress * 0.5; // 50-100%
        onProgress?.(progress);
      }
    );

    // 6. Calculate actual file size (encrypted size - GCM tag)
    const actualSize = decryptedBlob.size;

    // 7. Complete
    progress.percentage = 100;
    progress.status = 'completed';
    onProgress?.(progress);

    return {
      id: metadata.id,
      name: fileName,
      size: actualSize,
      mimeType: metadata.mimeType,
      blob: decryptedBlob,
      folderId: metadata.folderId,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
    };
  } catch (error: any) {
    console.error('File download failed:', error);

    if (onProgress) {
      onProgress({
        fileId,
        fileName: '(encrypted)',
        totalSize: 0,
        downloadedSize: 0,
        percentage: 0,
        status: 'failed',
        error: error.message || 'Download failed',
      });
    }

    throw new Error(error.message || 'Failed to download file');
  }
}

/**
 * Download file and trigger browser download
 * @param fileId - File ID to download
 * @param onProgress - Progress callback
 */
export async function downloadFileToDevice(
  fileId: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  const file = await downloadFile(fileId, onProgress);

  // Create download link
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up
  URL.revokeObjectURL(url);
}

// ============================================================================
// File Listing
// ============================================================================

/**
 * List files in a folder
 * @param folderId - Optional folder ID (null for root)
 * @returns Array of decrypted file metadata
 */
export async function listFiles(folderId?: string): Promise<FileListItem[]> {
  try {
    const masterKey = StorageService.getMasterKey();
    if (!masterKey) {
      throw new Error('Master key not available. Please login again.');
    }

    const files = await ApiService.getFiles(folderId);

    // Decrypt file names
    const decryptedFiles = await Promise.all(
      files.map(async (file) => {
        try {
          const name = await CryptoService.decryptString(
            {
              data: file.encryptedName,
              iv: file.encryptedNameIV,
            },
            masterKey
          );

          // Calculate approximate original size (subtract GCM tag size)
          const approximateSize = Math.max(0, file.encryptedSize - 16);

          return {
            id: file.id,
            name,
            size: approximateSize,
            mimeType: file.mimeType,
            folderId: file.folderId,
            createdAt: file.createdAt,
            updatedAt: file.updatedAt,
          };
        } catch (error) {
          console.error('Failed to decrypt file metadata:', error);
          return {
            id: file.id,
            name: '(decryption failed)',
            size: 0,
            mimeType: file.mimeType,
            folderId: file.folderId,
            createdAt: file.createdAt,
            updatedAt: file.updatedAt,
          };
        }
      })
    );

    return decryptedFiles;
  } catch (error: any) {
    console.error('Failed to list files:', error);
    throw new Error(error.message || 'Failed to list files');
  }
}

// ============================================================================
// File Operations
// ============================================================================

/**
 * Delete a file
 * @param fileId - File ID to delete
 */
export async function deleteFile(fileId: string): Promise<void> {
  try {
    await ApiService.deleteFile(fileId);
  } catch (error: any) {
    console.error('Failed to delete file:', error);
    throw new Error(error.message || 'Failed to delete file');
  }
}

/**
 * Rename a file
 * @param fileId - File ID
 * @param newName - New file name
 */
export async function renameFile(fileId: string, newName: string): Promise<FileListItem> {
  try {
    const masterKey = StorageService.getMasterKey();
    if (!masterKey) {
      throw new Error('Master key not available. Please login again.');
    }

    // Encrypt new name
    const encryptedName = await CryptoService.encryptString(newName, masterKey);

    // Update metadata
    const metadata = await ApiService.updateFileMetadata(fileId, {
      encryptedName: encryptedName.data,
      encryptedNameIV: encryptedName.iv,
    });

    return {
      id: metadata.id,
      name: newName,
      size: Math.max(0, metadata.encryptedSize - 16),
      mimeType: metadata.mimeType,
      folderId: metadata.folderId,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
    };
  } catch (error: any) {
    console.error('Failed to rename file:', error);
    throw new Error(error.message || 'Failed to rename file');
  }
}

/**
 * Move a file to a different folder
 * @param fileId - File ID
 * @param folderId - Target folder ID (undefined for root)
 */
export async function moveFile(fileId: string, folderId?: string): Promise<FileListItem> {
  try {
    const masterKey = StorageService.getMasterKey();
    if (!masterKey) {
      throw new Error('Master key not available. Please login again.');
    }

    const metadata = await ApiService.moveFile(fileId, folderId);

    // Decrypt file name
    const name = await CryptoService.decryptString(
      {
        data: metadata.encryptedName,
        iv: metadata.encryptedNameIV,
      },
      masterKey
    );

    return {
      id: metadata.id,
      name,
      size: Math.max(0, metadata.encryptedSize - 16),
      mimeType: metadata.mimeType,
      folderId: metadata.folderId,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
    };
  } catch (error: any) {
    console.error('Failed to move file:', error);
    throw new Error(error.message || 'Failed to move file');
  }
}

/**
 * Copy a file
 * @param fileId - File ID
 * @param folderId - Target folder ID (undefined for root)
 */
export async function copyFile(fileId: string, folderId?: string): Promise<FileListItem> {
  try {
    const masterKey = StorageService.getMasterKey();
    if (!masterKey) {
      throw new Error('Master key not available. Please login again.');
    }

    const metadata = await ApiService.copyFile(fileId, folderId);

    // Decrypt file name
    const name = await CryptoService.decryptString(
      {
        data: metadata.encryptedName,
        iv: metadata.encryptedNameIV,
      },
      masterKey
    );

    return {
      id: metadata.id,
      name,
      size: Math.max(0, metadata.encryptedSize - 16),
      mimeType: metadata.mimeType,
      folderId: metadata.folderId,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
    };
  } catch (error: any) {
    console.error('Failed to copy file:', error);
    throw new Error(error.message || 'Failed to copy file');
  }
}

// ============================================================================
// Folder Operations
// ============================================================================

/**
 * List folders
 * @param parentId - Optional parent folder ID (null for root)
 * @returns Array of decrypted folder metadata
 */
export async function listFolders(parentId?: string): Promise<FolderListItem[]> {
  try {
    const masterKey = StorageService.getMasterKey();
    if (!masterKey) {
      throw new Error('Master key not available. Please login again.');
    }

    const folders = await ApiService.getFolders(parentId);

    // Decrypt folder names
    const decryptedFolders = await Promise.all(
      folders.map(async (folder) => {
        try {
          const name = await CryptoService.decryptString(
            {
              data: folder.encryptedName,
              iv: folder.encryptedNameIV,
            },
            masterKey
          );

          return {
            id: folder.id,
            name,
            parentId: folder.parentId,
            createdAt: folder.createdAt,
            updatedAt: folder.updatedAt,
          };
        } catch (error) {
          console.error('Failed to decrypt folder metadata:', error);
          return {
            id: folder.id,
            name: '(decryption failed)',
            parentId: folder.parentId,
            createdAt: folder.createdAt,
            updatedAt: folder.updatedAt,
          };
        }
      })
    );

    return decryptedFolders;
  } catch (error: any) {
    console.error('Failed to list folders:', error);
    throw new Error(error.message || 'Failed to list folders');
  }
}

/**
 * Create a new folder
 * @param name - Folder name
 * @param parentId - Optional parent folder ID
 * @returns Created folder
 */
export async function createFolder(name: string, parentId?: string): Promise<FolderListItem> {
  try {
    const masterKey = StorageService.getMasterKey();
    if (!masterKey) {
      throw new Error('Master key not available. Please login again.');
    }

    // Encrypt folder name
    const encryptedName = await CryptoService.encryptString(name, masterKey);

    // Create folder
    const metadata = await ApiService.createFolder({
      encryptedName: encryptedName.data,
      encryptedNameIV: encryptedName.iv,
      parentId,
    });

    return {
      id: metadata.id,
      name,
      parentId: metadata.parentId,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
    };
  } catch (error: any) {
    console.error('Failed to create folder:', error);
    throw new Error(error.message || 'Failed to create folder');
  }
}

/**
 * Rename a folder
 * @param folderId - Folder ID
 * @param newName - New folder name
 */
export async function renameFolder(folderId: string, newName: string): Promise<FolderListItem> {
  try {
    const masterKey = StorageService.getMasterKey();
    if (!masterKey) {
      throw new Error('Master key not available. Please login again.');
    }

    // Encrypt new name
    const encryptedName = await CryptoService.encryptString(newName, masterKey);

    // Update metadata
    const metadata = await ApiService.updateFolder(folderId, {
      encryptedName: encryptedName.data,
      encryptedNameIV: encryptedName.iv,
    });

    return {
      id: metadata.id,
      name: newName,
      parentId: metadata.parentId,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
    };
  } catch (error: any) {
    console.error('Failed to rename folder:', error);
    throw new Error(error.message || 'Failed to rename folder');
  }
}

/**
 * Delete a folder
 * @param folderId - Folder ID to delete
 */
export async function deleteFolder(folderId: string): Promise<void> {
  try {
    await ApiService.deleteFolder(folderId);
  } catch (error: any) {
    console.error('Failed to delete folder:', error);
    throw new Error(error.message || 'Failed to delete folder');
  }
}

/**
 * Move a folder to a different parent
 * @param folderId - Folder ID
 * @param parentId - Target parent folder ID (undefined for root)
 */
export async function moveFolder(folderId: string, parentId?: string): Promise<FolderListItem> {
  try {
    const masterKey = StorageService.getMasterKey();
    if (!masterKey) {
      throw new Error('Master key not available. Please login again.');
    }

    const metadata = await ApiService.moveFolder(folderId, parentId);

    // Decrypt folder name
    const name = await CryptoService.decryptString(
      {
        data: metadata.encryptedName,
        iv: metadata.encryptedNameIV,
      },
      masterKey
    );

    return {
      id: metadata.id,
      name,
      parentId: metadata.parentId,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
    };
  } catch (error: any) {
    console.error('Failed to move folder:', error);
    throw new Error(error.message || 'Failed to move folder');
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot + 1).toLowerCase();
}

/**
 * Get file icon based on mime type
 */
export function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.startsWith('video/')) return '🎥';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType.startsWith('text/')) return '📄';
  if (mimeType === 'application/pdf') return '📕';
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return '🗜️';
  if (mimeType.includes('word')) return '📘';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📽️';
  return '📎';
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Validate file size
 */
export function validateFileSize(file: File, maxSizeMB: number = 100): boolean {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return file.size <= maxSizeBytes;
}

/**
 * Validate file type
 */
export function validateFileType(file: File, allowedTypes: string[]): boolean {
  if (allowedTypes.length === 0) return true;
  return allowedTypes.some((type) => {
    if (type.endsWith('/*')) {
      const prefix = type.slice(0, -2);
      return file.type.startsWith(prefix);
    }
    return file.type === type;
  });
}

// Export the service as a default object
const FileService = {
  // Upload
  uploadFile,
  uploadMultipleFiles,

  // Download
  downloadFile,
  downloadFileToDevice,

  // File listing
  listFiles,

  // File operations
  deleteFile,
  renameFile,
  moveFile,
  copyFile,

  // Folder operations
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  moveFolder,

  // Utilities
  getFileExtension,
  getFileIcon,
  formatFileSize,
  validateFileSize,
  validateFileType,
};

export default FileService;
