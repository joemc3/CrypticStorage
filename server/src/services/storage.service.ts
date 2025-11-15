import { Readable } from 'stream';
import * as Minio from 'minio';
import { v4 as uuidv4 } from 'uuid';
import {
  storage,
  uploadFile as uploadToMinio,
  downloadFile as downloadFromMinio,
  deleteFile as deleteFromMinio,
  deleteFiles as deleteMultipleFromMinio,
  fileExists as checkFileExists,
  getFileMetadata as getMinioFileMetadata,
  copyFile as copyMinioFile,
  getBucketName,
} from '../config/storage';
import logger from '../utils/logger';
import { StorageError, ValidationError } from '../utils/errors';

/**
 * Storage Service
 * Wrapper around MinIO operations specific to CrypticStorage needs
 */

/**
 * Interface Definitions
 */
export interface UploadOptions {
  userId: string;
  fileId?: string;
  metadata?: Record<string, string>;
  isVersion?: boolean;
  versionNumber?: number;
}

export interface StoragePath {
  userId: string;
  fileId: string;
  isVersion?: boolean;
  versionNumber?: number;
}

export interface DownloadResult {
  stream: Readable;
  metadata: Minio.BucketItemStat;
}

/**
 * Generate a storage path for a file
 */
export const generateStoragePath = (options: StoragePath): string => {
  const { userId, fileId, isVersion, versionNumber } = options;

  // Path format: users/{userId}/files/{fileId}/{version}/{versionNumber}
  // or: users/{userId}/files/{fileId}/current
  const basePath = `users/${userId}/files/${fileId}`;

  if (isVersion && versionNumber !== undefined) {
    return `${basePath}/versions/${versionNumber}`;
  }

  return `${basePath}/current`;
};

/**
 * Generate a thumbnail storage path
 */
export const generateThumbnailPath = (userId: string, fileId: string): string => {
  return `users/${userId}/thumbnails/${fileId}`;
};

/**
 * Upload a file to storage
 */
export const uploadFile = async (
  data: Buffer | Readable,
  size: number,
  options: UploadOptions
): Promise<{ storagePath: string; etag: string }> => {
  try {
    const fileId = options.fileId || uuidv4();

    logger.info('Uploading file to storage', {
      userId: options.userId,
      fileId,
      size,
      isVersion: options.isVersion,
    });

    // Generate storage path
    const storagePath = generateStoragePath({
      userId: options.userId,
      fileId,
      isVersion: options.isVersion,
      versionNumber: options.versionNumber,
    });

    // Prepare metadata
    const metadata = {
      userId: options.userId,
      fileId,
      uploadedAt: new Date().toISOString(),
      ...(options.metadata || {}),
    };

    // Upload to MinIO
    const result = await uploadToMinio(storagePath, data, size, metadata);

    logger.info('File uploaded successfully', {
      userId: options.userId,
      fileId,
      storagePath,
      etag: result.etag,
    });

    return {
      storagePath,
      etag: result.etag,
    };
  } catch (error) {
    logger.error('Failed to upload file', {
      userId: options.userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError(
      'Failed to upload file',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Upload a thumbnail
 */
export const uploadThumbnail = async (
  data: Buffer,
  userId: string,
  fileId: string
): Promise<{ thumbnailPath: string; etag: string }> => {
  try {
    logger.debug('Uploading thumbnail', { userId, fileId });

    const thumbnailPath = generateThumbnailPath(userId, fileId);

    const metadata = {
      userId,
      fileId,
      type: 'thumbnail',
      uploadedAt: new Date().toISOString(),
    };

    const result = await uploadToMinio(thumbnailPath, data, data.length, metadata);

    logger.info('Thumbnail uploaded successfully', {
      userId,
      fileId,
      thumbnailPath,
    });

    return {
      thumbnailPath,
      etag: result.etag,
    };
  } catch (error) {
    logger.error('Failed to upload thumbnail', {
      userId,
      fileId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError(
      'Failed to upload thumbnail',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Download a file from storage
 */
export const downloadFile = async (storagePath: string): Promise<DownloadResult> => {
  try {
    logger.debug('Downloading file from storage', { storagePath });

    // Check if file exists
    const exists = await checkFileExists(storagePath);
    if (!exists) {
      throw new StorageError('File not found in storage');
    }

    // Get file metadata
    const metadata = await getMinioFileMetadata(storagePath);

    // Download file stream
    const stream = await downloadFromMinio(storagePath);

    logger.info('File download initiated', { storagePath, size: metadata.size });

    return {
      stream,
      metadata,
    };
  } catch (error) {
    logger.error('Failed to download file', {
      storagePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError(
      'Failed to download file',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Delete a file from storage
 */
export const deleteFile = async (storagePath: string): Promise<void> => {
  try {
    logger.info('Deleting file from storage', { storagePath });

    await deleteFromMinio(storagePath);

    logger.info('File deleted successfully', { storagePath });
  } catch (error) {
    logger.error('Failed to delete file', {
      storagePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError(
      'Failed to delete file',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Delete multiple files from storage
 */
export const deleteMultipleFiles = async (storagePaths: string[]): Promise<void> => {
  try {
    logger.info('Deleting multiple files from storage', { count: storagePaths.length });

    if (storagePaths.length === 0) {
      return;
    }

    await deleteMultipleFromMinio(storagePaths);

    logger.info('Multiple files deleted successfully', { count: storagePaths.length });
  } catch (error) {
    logger.error('Failed to delete multiple files', {
      count: storagePaths.length,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError(
      'Failed to delete multiple files',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Delete all files for a user
 */
export const deleteAllUserFiles = async (userId: string): Promise<void> => {
  try {
    logger.info('Deleting all files for user', { userId });

    const userPrefix = `users/${userId}/`;

    // List all files with the user prefix
    const files = await storage.listObjects(getBucketName(), userPrefix, true);

    const fileNames: string[] = [];

    // Collect file names
    await new Promise<void>((resolve, reject) => {
      files.on('data', (obj) => {
        if (obj.name) {
          fileNames.push(obj.name);
        }
      });
      files.on('end', () => resolve());
      files.on('error', (err) => reject(err));
    });

    if (fileNames.length === 0) {
      logger.info('No files to delete for user', { userId });
      return;
    }

    // Delete all files
    await deleteMultipleFromMinio(fileNames);

    logger.info('All user files deleted successfully', {
      userId,
      count: fileNames.length,
    });
  } catch (error) {
    logger.error('Failed to delete all user files', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError(
      'Failed to delete all user files',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Copy a file within storage
 */
export const copyFile = async (
  sourceStoragePath: string,
  destinationStoragePath: string
): Promise<void> => {
  try {
    logger.debug('Copying file in storage', {
      source: sourceStoragePath,
      destination: destinationStoragePath,
    });

    await copyMinioFile(sourceStoragePath, destinationStoragePath);

    logger.info('File copied successfully', {
      source: sourceStoragePath,
      destination: destinationStoragePath,
    });
  } catch (error) {
    logger.error('Failed to copy file', {
      source: sourceStoragePath,
      destination: destinationStoragePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError(
      'Failed to copy file',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Check if a file exists in storage
 */
export const fileExists = async (storagePath: string): Promise<boolean> => {
  try {
    const exists = await checkFileExists(storagePath);
    return exists;
  } catch (error) {
    logger.error('Failed to check file existence', {
      storagePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError(
      'Failed to check file existence',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Get file metadata from storage
 */
export const getFileMetadata = async (
  storagePath: string
): Promise<Minio.BucketItemStat> => {
  try {
    const metadata = await getMinioFileMetadata(storagePath);
    return metadata;
  } catch (error) {
    logger.error('Failed to get file metadata', {
      storagePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError(
      'Failed to get file metadata',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Get storage usage for a user
 */
export const getUserStorageUsage = async (userId: string): Promise<number> => {
  try {
    logger.debug('Calculating storage usage for user', { userId });

    const userPrefix = `users/${userId}/files/`;

    // List all files with the user prefix
    const files = await storage.listObjects(getBucketName(), userPrefix, true);

    let totalSize = 0;

    // Calculate total size
    await new Promise<void>((resolve, reject) => {
      files.on('data', (obj) => {
        if (obj.size) {
          totalSize += obj.size;
        }
      });
      files.on('end', () => resolve());
      files.on('error', (err) => reject(err));
    });

    logger.debug('Storage usage calculated', { userId, totalSize });

    return totalSize;
  } catch (error) {
    logger.error('Failed to get user storage usage', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError(
      'Failed to get user storage usage',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Validate file size against user quota
 */
export const validateStorageQuota = (
  currentUsage: bigint,
  quota: bigint,
  fileSize: number
): boolean => {
  const newUsage = currentUsage + BigInt(fileSize);
  return newUsage <= quota;
};

/**
 * Create a multipart upload
 * For large files that need to be uploaded in chunks
 */
export const createMultipartUpload = async (
  storagePath: string
): Promise<string> => {
  try {
    logger.debug('Creating multipart upload', { storagePath });

    const uploadId = await storage.initiateNewMultipartUpload(
      getBucketName(),
      storagePath,
      {}
    );

    logger.info('Multipart upload created', { storagePath, uploadId });

    return uploadId;
  } catch (error) {
    logger.error('Failed to create multipart upload', {
      storagePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError(
      'Failed to create multipart upload',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Upload a part in a multipart upload
 */
export const uploadPart = async (
  storagePath: string,
  uploadId: string,
  partNumber: number,
  data: Buffer | Readable,
  size: number
): Promise<{ etag: string; partNumber: number }> => {
  try {
    logger.debug('Uploading part', { storagePath, uploadId, partNumber, size });

    const result = await storage.putObject(
      getBucketName(),
      `${storagePath}.part${partNumber}`,
      data,
      size
    );

    logger.info('Part uploaded successfully', {
      storagePath,
      uploadId,
      partNumber,
      etag: result.etag,
    });

    return {
      etag: result.etag,
      partNumber,
    };
  } catch (error) {
    logger.error('Failed to upload part', {
      storagePath,
      uploadId,
      partNumber,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError(
      'Failed to upload part',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Complete a multipart upload
 */
export const completeMultipartUpload = async (
  storagePath: string,
  uploadId: string,
  parts: Array<{ etag: string; partNumber: number }>
): Promise<void> => {
  try {
    logger.info('Completing multipart upload', {
      storagePath,
      uploadId,
      partsCount: parts.length,
    });

    await storage.completeMultipartUpload(
      getBucketName(),
      storagePath,
      uploadId,
      parts.map((p) => ({ etag: p.etag, part: p.partNumber }))
    );

    logger.info('Multipart upload completed successfully', { storagePath, uploadId });
  } catch (error) {
    logger.error('Failed to complete multipart upload', {
      storagePath,
      uploadId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError(
      'Failed to complete multipart upload',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Abort a multipart upload
 */
export const abortMultipartUpload = async (
  storagePath: string,
  uploadId: string
): Promise<void> => {
  try {
    logger.info('Aborting multipart upload', { storagePath, uploadId });

    await storage.abortMultipartUpload(getBucketName(), storagePath, uploadId);

    logger.info('Multipart upload aborted successfully', { storagePath, uploadId });
  } catch (error) {
    logger.error('Failed to abort multipart upload', {
      storagePath,
      uploadId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    // Don't throw error for abort failures
    logger.warn('Multipart upload abort failed, continuing...');
  }
};

// Export all functions
export default {
  generateStoragePath,
  generateThumbnailPath,
  uploadFile,
  uploadThumbnail,
  downloadFile,
  deleteFile,
  deleteMultipleFiles,
  deleteAllUserFiles,
  copyFile,
  fileExists,
  getFileMetadata,
  getUserStorageUsage,
  validateStorageQuota,
  createMultipartUpload,
  uploadPart,
  completeMultipartUpload,
  abortMultipartUpload,
};
