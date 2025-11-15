import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import { prisma, runTransaction } from '../config/database';
import logger from '../utils/logger';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  PaymentRequiredError,
  StorageError,
} from '../utils/errors';
import * as storageService from './storage.service';
import * as auditService from './audit.service';

/**
 * File Service
 * Handles file CRUD operations, uploading to MinIO, downloading, deletion,
 * file metadata management, and storage quota tracking
 */

/**
 * Interface Definitions
 */
export interface CreateFileData {
  userId: string;
  parentFolderId?: string;
  filenameEncrypted: string;
  filenameIv: string;
  fileKeyEncrypted: string;
  fileSize: number;
  encryptedSize: number;
  mimeType?: string;
  fileHash: string;
  encryptionAlgorithm?: string;
  fileData: Buffer | Readable;
  thumbnailData?: Buffer;
  ipAddress?: string;
  userAgent?: string;
}

export interface UpdateFileData {
  filenameEncrypted?: string;
  filenameIv?: string;
  parentFolderId?: string | null;
}

export interface FileQuery {
  userId: string;
  parentFolderId?: string | null;
  isDeleted?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'fileSize';
  sortOrder?: 'asc' | 'desc';
}

export interface FileVersionData {
  fileId: string;
  userId: string;
  versionNumber: number;
  fileData: Buffer | Readable;
  fileSize: number;
  fileKeyEncrypted: string;
}

/**
 * Create a new file
 */
export const createFile = async (data: CreateFileData) => {
  try {
    logger.info('Creating new file', {
      userId: data.userId,
      fileSize: data.fileSize,
      parentFolderId: data.parentFolderId,
    });

    // Validate file size
    if (data.fileSize <= 0 || data.encryptedSize <= 0) {
      throw new ValidationError('Invalid file size');
    }

    // Check user storage quota
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { storageQuota: true, storageUsed: true },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Validate quota
    if (!storageService.validateStorageQuota(user.storageUsed, user.storageQuota, data.encryptedSize)) {
      throw new PaymentRequiredError('Storage quota exceeded', {
        quota: user.storageQuota.toString(),
        used: user.storageUsed.toString(),
        required: data.encryptedSize,
      });
    }

    // Validate parent folder if provided
    if (data.parentFolderId) {
      const folder = await prisma.folder.findFirst({
        where: {
          id: data.parentFolderId,
          userId: data.userId,
          isDeleted: false,
        },
      });

      if (!folder) {
        throw new NotFoundError('Parent folder not found');
      }
    }

    // Generate file ID
    const fileId = uuidv4();

    // Use transaction to ensure atomicity
    const file = await runTransaction(async (tx) => {
      // Upload file to storage
      const { storagePath, etag } = await storageService.uploadFile(
        data.fileData,
        data.encryptedSize,
        {
          userId: data.userId,
          fileId,
          metadata: {
            fileHash: data.fileHash,
            mimeType: data.mimeType || 'application/octet-stream',
          },
        }
      );

      // Upload thumbnail if provided
      let thumbnailPath: string | undefined;
      if (data.thumbnailData) {
        try {
          const thumbnailResult = await storageService.uploadThumbnail(
            data.thumbnailData,
            data.userId,
            fileId
          );
          thumbnailPath = thumbnailResult.thumbnailPath;
        } catch (error) {
          // Thumbnail upload is not critical, just log the error
          logger.warn('Failed to upload thumbnail', {
            fileId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Create file record in database
      const newFile = await tx.file.create({
        data: {
          id: fileId,
          userId: data.userId,
          parentFolderId: data.parentFolderId,
          filenameEncrypted: data.filenameEncrypted,
          filenameIv: data.filenameIv,
          fileKeyEncrypted: data.fileKeyEncrypted,
          fileSize: BigInt(data.fileSize),
          encryptedSize: BigInt(data.encryptedSize),
          mimeType: data.mimeType,
          storagePath,
          fileHash: data.fileHash,
          encryptionAlgorithm: data.encryptionAlgorithm || 'AES-256-GCM',
          thumbnailPath,
        },
        include: {
          parentFolder: {
            select: {
              id: true,
              nameEncrypted: true,
              nameIv: true,
            },
          },
        },
      });

      // Update user storage usage
      await tx.user.update({
        where: { id: data.userId },
        data: {
          storageUsed: {
            increment: BigInt(data.encryptedSize),
          },
        },
      });

      return newFile;
    });

    // Log audit event
    await auditService.logFileOperation(
      auditService.AuditAction.FILE_UPLOAD,
      data.userId,
      file.id,
      true,
      data.ipAddress,
      data.userAgent
    );

    logger.info('File created successfully', {
      fileId: file.id,
      userId: data.userId,
      size: data.encryptedSize,
    });

    return file;
  } catch (error) {
    // Log failed upload
    if (data.userId) {
      await auditService.logFileOperation(
        auditService.AuditAction.FILE_UPLOAD,
        data.userId,
        'unknown',
        false,
        data.ipAddress,
        data.userAgent,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }

    if (
      error instanceof ValidationError ||
      error instanceof NotFoundError ||
      error instanceof PaymentRequiredError ||
      error instanceof StorageError
    ) {
      throw error;
    }
    logger.error('Failed to create file', {
      userId: data.userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError('Failed to create file');
  }
};

/**
 * Get file by ID
 */
export const getFileById = async (fileId: string, userId: string) => {
  try {
    logger.debug('Getting file by ID', { fileId, userId });

    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        userId,
        isDeleted: false,
      },
      include: {
        parentFolder: {
          select: {
            id: true,
            nameEncrypted: true,
            nameIv: true,
          },
        },
        versions: {
          orderBy: {
            versionNumber: 'desc',
          },
          take: 5,
        },
      },
    });

    if (!file) {
      throw new NotFoundError('File not found');
    }

    return file;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    logger.error('Failed to get file', {
      fileId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError('Failed to get file');
  }
};

/**
 * Get files for a user with filtering
 */
export const getFiles = async (query: FileQuery) => {
  try {
    logger.debug('Getting files', query);

    // Build where clause
    const where: any = {
      userId: query.userId,
      isDeleted: query.isDeleted ?? false,
    };

    // Handle parent folder filter
    if (query.parentFolderId === null) {
      // Root level files (no parent folder)
      where.parentFolderId = null;
    } else if (query.parentFolderId) {
      where.parentFolderId = query.parentFolderId;
    }

    // Get total count
    const total = await prisma.file.count({ where });

    // Get files
    const files = await prisma.file.findMany({
      where,
      orderBy: {
        [query.sortBy || 'createdAt']: query.sortOrder || 'desc',
      },
      take: query.limit || 100,
      skip: query.offset || 0,
      include: {
        parentFolder: {
          select: {
            id: true,
            nameEncrypted: true,
            nameIv: true,
          },
        },
      },
    });

    logger.debug('Files retrieved', { count: files.length, total });

    return {
      files,
      total,
      limit: query.limit || 100,
      offset: query.offset || 0,
    };
  } catch (error) {
    logger.error('Failed to get files', {
      userId: query.userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError('Failed to get files');
  }
};

/**
 * Download a file
 */
export const downloadFile = async (
  fileId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) => {
  try {
    logger.info('Downloading file', { fileId, userId });

    // Get file
    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        userId,
        isDeleted: false,
      },
    });

    if (!file) {
      throw new NotFoundError('File not found');
    }

    // Download from storage
    const { stream, metadata } = await storageService.downloadFile(file.storagePath);

    // Log audit event
    await auditService.logFileOperation(
      auditService.AuditAction.FILE_DOWNLOAD,
      userId,
      fileId,
      true,
      ipAddress,
      userAgent
    );

    logger.info('File download initiated', { fileId, userId });

    return {
      stream,
      file,
      metadata,
    };
  } catch (error) {
    // Log failed download
    await auditService.logFileOperation(
      auditService.AuditAction.FILE_DOWNLOAD,
      userId,
      fileId,
      false,
      ipAddress,
      userAgent,
      error instanceof Error ? error.message : 'Unknown error'
    );

    if (error instanceof NotFoundError || error instanceof StorageError) {
      throw error;
    }
    logger.error('Failed to download file', {
      fileId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError('Failed to download file');
  }
};

/**
 * Update file metadata
 */
export const updateFile = async (
  fileId: string,
  userId: string,
  data: UpdateFileData,
  ipAddress?: string,
  userAgent?: string
) => {
  try {
    logger.info('Updating file', { fileId, userId });

    // Check if file exists and belongs to user
    const existingFile = await prisma.file.findFirst({
      where: {
        id: fileId,
        userId,
        isDeleted: false,
      },
    });

    if (!existingFile) {
      throw new NotFoundError('File not found');
    }

    // Validate parent folder if being changed
    if (data.parentFolderId !== undefined && data.parentFolderId !== null) {
      const folder = await prisma.folder.findFirst({
        where: {
          id: data.parentFolderId,
          userId,
          isDeleted: false,
        },
      });

      if (!folder) {
        throw new NotFoundError('Parent folder not found');
      }
    }

    // Update file
    const updatedFile = await prisma.file.update({
      where: { id: fileId },
      data: {
        ...(data.filenameEncrypted && { filenameEncrypted: data.filenameEncrypted }),
        ...(data.filenameIv && { filenameIv: data.filenameIv }),
        ...(data.parentFolderId !== undefined && { parentFolderId: data.parentFolderId }),
      },
      include: {
        parentFolder: {
          select: {
            id: true,
            nameEncrypted: true,
            nameIv: true,
          },
        },
      },
    });

    // Log audit event
    const action = data.parentFolderId !== undefined
      ? auditService.AuditAction.FILE_MOVE
      : data.filenameEncrypted
      ? auditService.AuditAction.FILE_RENAME
      : auditService.AuditAction.FILE_UPDATE;

    await auditService.logFileOperation(
      action,
      userId,
      fileId,
      true,
      ipAddress,
      userAgent
    );

    logger.info('File updated successfully', { fileId, userId });

    return updatedFile;
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error;
    }
    logger.error('Failed to update file', {
      fileId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError('Failed to update file');
  }
};

/**
 * Delete a file (soft delete)
 */
export const deleteFile = async (
  fileId: string,
  userId: string,
  permanent: boolean = false,
  ipAddress?: string,
  userAgent?: string
) => {
  try {
    logger.info('Deleting file', { fileId, userId, permanent });

    // Get file
    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        userId,
      },
    });

    if (!file) {
      throw new NotFoundError('File not found');
    }

    if (permanent) {
      // Permanent delete
      await runTransaction(async (tx) => {
        // Delete file from database
        await tx.file.delete({
          where: { id: fileId },
        });

        // Update user storage usage (only if not already deleted)
        if (!file.isDeleted) {
          await tx.user.update({
            where: { id: userId },
            data: {
              storageUsed: {
                decrement: file.encryptedSize,
              },
            },
          });
        }
      });

      // Delete from storage
      try {
        await storageService.deleteFile(file.storagePath);

        // Delete thumbnail if exists
        if (file.thumbnailPath) {
          await storageService.deleteFile(file.thumbnailPath);
        }

        // Delete all versions
        const versions = await prisma.fileVersion.findMany({
          where: { fileId },
          select: { storagePath: true },
        });

        if (versions.length > 0) {
          await storageService.deleteMultipleFiles(
            versions.map((v) => v.storagePath)
          );
        }
      } catch (error) {
        // Log storage deletion error but don't fail the operation
        logger.error('Failed to delete file from storage', {
          fileId,
          storagePath: file.storagePath,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } else {
      // Soft delete
      await runTransaction(async (tx) => {
        await tx.file.update({
          where: { id: fileId },
          data: {
            isDeleted: true,
            deletedAt: new Date(),
          },
        });

        // Update user storage usage (only if not already deleted)
        if (!file.isDeleted) {
          await tx.user.update({
            where: { id: userId },
            data: {
              storageUsed: {
                decrement: file.encryptedSize,
              },
            },
          });
        }
      });
    }

    // Log audit event
    await auditService.logFileOperation(
      auditService.AuditAction.FILE_DELETE,
      userId,
      fileId,
      true,
      ipAddress,
      userAgent
    );

    logger.info('File deleted successfully', { fileId, userId, permanent });
  } catch (error) {
    // Log failed deletion
    await auditService.logFileOperation(
      auditService.AuditAction.FILE_DELETE,
      userId,
      fileId,
      false,
      ipAddress,
      userAgent,
      error instanceof Error ? error.message : 'Unknown error'
    );

    if (error instanceof NotFoundError) {
      throw error;
    }
    logger.error('Failed to delete file', {
      fileId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError('Failed to delete file');
  }
};

/**
 * Restore a deleted file
 */
export const restoreFile = async (
  fileId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) => {
  try {
    logger.info('Restoring file', { fileId, userId });

    // Get file
    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        userId,
        isDeleted: true,
      },
    });

    if (!file) {
      throw new NotFoundError('Deleted file not found');
    }

    // Check storage quota
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { storageQuota: true, storageUsed: true },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (!storageService.validateStorageQuota(user.storageUsed, user.storageQuota, Number(file.encryptedSize))) {
      throw new PaymentRequiredError('Storage quota exceeded');
    }

    // Restore file
    const restoredFile = await runTransaction(async (tx) => {
      const updated = await tx.file.update({
        where: { id: fileId },
        data: {
          isDeleted: false,
          deletedAt: null,
        },
      });

      // Update user storage usage
      await tx.user.update({
        where: { id: userId },
        data: {
          storageUsed: {
            increment: file.encryptedSize,
          },
        },
      });

      return updated;
    });

    logger.info('File restored successfully', { fileId, userId });

    return restoredFile;
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof PaymentRequiredError
    ) {
      throw error;
    }
    logger.error('Failed to restore file', {
      fileId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError('Failed to restore file');
  }
};

/**
 * Create a file version
 */
export const createFileVersion = async (
  data: FileVersionData,
  ipAddress?: string,
  userAgent?: string
) => {
  try {
    logger.info('Creating file version', {
      fileId: data.fileId,
      userId: data.userId,
      versionNumber: data.versionNumber,
    });

    // Check if file exists
    const file = await prisma.file.findFirst({
      where: {
        id: data.fileId,
        userId: data.userId,
        isDeleted: false,
      },
    });

    if (!file) {
      throw new NotFoundError('File not found');
    }

    // Upload version to storage
    const { storagePath, etag } = await storageService.uploadFile(
      data.fileData,
      data.fileSize,
      {
        userId: data.userId,
        fileId: data.fileId,
        isVersion: true,
        versionNumber: data.versionNumber,
      }
    );

    // Create version record
    const version = await prisma.fileVersion.create({
      data: {
        fileId: data.fileId,
        versionNumber: data.versionNumber,
        storagePath,
        fileSize: BigInt(data.fileSize),
        fileKeyEncrypted: data.fileKeyEncrypted,
      },
    });

    // Log audit event
    await auditService.logFileOperation(
      auditService.AuditAction.FILE_VERSION_CREATE,
      data.userId,
      data.fileId,
      true,
      ipAddress,
      userAgent
    );

    logger.info('File version created successfully', {
      fileId: data.fileId,
      versionNumber: data.versionNumber,
    });

    return version;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    logger.error('Failed to create file version', {
      fileId: data.fileId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError('Failed to create file version');
  }
};

/**
 * Get user storage statistics
 */
export const getUserStorageStats = async (userId: string) => {
  try {
    logger.debug('Getting user storage stats', { userId });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        storageQuota: true,
        storageUsed: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const fileCount = await prisma.file.count({
      where: {
        userId,
        isDeleted: false,
      },
    });

    const deletedFileCount = await prisma.file.count({
      where: {
        userId,
        isDeleted: true,
      },
    });

    const usagePercentage = Number(
      (user.storageUsed * BigInt(100)) / user.storageQuota
    );

    return {
      quota: user.storageQuota,
      used: user.storageUsed,
      available: user.storageQuota - user.storageUsed,
      usagePercentage,
      fileCount,
      deletedFileCount,
    };
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    logger.error('Failed to get user storage stats', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError('Failed to get user storage stats');
  }
};

/**
 * Search files by hash (for deduplication)
 */
export const findFileByHash = async (userId: string, fileHash: string) => {
  try {
    const file = await prisma.file.findFirst({
      where: {
        userId,
        fileHash,
        isDeleted: false,
      },
    });

    return file;
  } catch (error) {
    logger.error('Failed to find file by hash', {
      userId,
      fileHash,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
};

// Export all functions
export default {
  createFile,
  getFileById,
  getFiles,
  downloadFile,
  updateFile,
  deleteFile,
  restoreFile,
  createFileVersion,
  getUserStorageStats,
  findFileByHash,
};
