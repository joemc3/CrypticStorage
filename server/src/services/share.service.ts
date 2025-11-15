import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { prisma, runTransaction } from '../config/database';
import { setCache, getCache, deleteCache } from '../config/redis';
import logger from '../utils/logger';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  AuthError,
} from '../utils/errors';
import * as auditService from './audit.service';
import * as storageService from './storage.service';

/**
 * Share Service
 * Handles share link creation, management, password protection,
 * expiration handling, and download tracking
 */

/**
 * Interface Definitions
 */
export interface CreateShareData {
  fileId: string;
  ownerId: string;
  fileKeyEncrypted: string;
  password?: string;
  expiresAt?: Date;
  maxDownloads?: number;
  ipAddress?: string;
  userAgent?: string;
}

export interface AccessShareData {
  shareToken: string;
  password?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface UpdateShareData {
  password?: string | null;
  expiresAt?: Date | null;
  maxDownloads?: number | null;
  isActive?: boolean;
}

export interface ShareQuery {
  ownerId: string;
  fileId?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Generate a secure share token
 */
export const generateShareToken = (): string => {
  // Generate a URL-safe random token
  return crypto.randomBytes(32).toString('base64url');
};

/**
 * Create a new share link
 */
export const createShare = async (data: CreateShareData) => {
  try {
    logger.info('Creating share link', {
      fileId: data.fileId,
      ownerId: data.ownerId,
      hasPassword: !!data.password,
      expiresAt: data.expiresAt,
      maxDownloads: data.maxDownloads,
    });

    // Validate file exists and belongs to owner
    const file = await prisma.file.findFirst({
      where: {
        id: data.fileId,
        userId: data.ownerId,
        isDeleted: false,
      },
    });

    if (!file) {
      throw new NotFoundError('File not found');
    }

    // Validate expiration date
    if (data.expiresAt && data.expiresAt <= new Date()) {
      throw new ValidationError('Expiration date must be in the future');
    }

    // Validate max downloads
    if (data.maxDownloads !== undefined && data.maxDownloads < 1) {
      throw new ValidationError('Max downloads must be at least 1');
    }

    // Generate share token
    const shareToken = generateShareToken();

    // Hash password if provided
    let passwordHash: string | undefined;
    if (data.password) {
      passwordHash = await bcrypt.hash(data.password, 10);
    }

    // Create share
    const share = await prisma.share.create({
      data: {
        id: uuidv4(),
        fileId: data.fileId,
        ownerId: data.ownerId,
        shareToken,
        fileKeyEncrypted: data.fileKeyEncrypted,
        passwordHash,
        expiresAt: data.expiresAt,
        maxDownloads: data.maxDownloads,
      },
      include: {
        file: {
          select: {
            id: true,
            filenameEncrypted: true,
            filenameIv: true,
            fileSize: true,
            mimeType: true,
          },
        },
      },
    });

    // Cache share for faster lookups
    const cacheTTL = data.expiresAt
      ? Math.floor((data.expiresAt.getTime() - Date.now()) / 1000)
      : 7 * 24 * 60 * 60; // 7 days default

    await setCache(`share:${shareToken}`, {
      id: share.id,
      fileId: share.fileId,
      ownerId: share.ownerId,
      hasPassword: !!passwordHash,
      expiresAt: share.expiresAt,
      maxDownloads: share.maxDownloads,
      downloadCount: share.downloadCount,
      isActive: share.isActive,
    }, cacheTTL);

    // Log audit event
    await auditService.logShareOperation(
      auditService.AuditAction.SHARE_CREATE,
      data.ownerId,
      share.id,
      true,
      data.ipAddress,
      data.userAgent
    );

    logger.info('Share link created successfully', {
      shareId: share.id,
      shareToken,
      fileId: data.fileId,
    });

    return {
      ...share,
      passwordHash: undefined, // Don't expose password hash
      shareUrl: `/share/${shareToken}`,
    };
  } catch (error) {
    // Log failed creation
    if (data.ownerId) {
      await auditService.logShareOperation(
        auditService.AuditAction.SHARE_CREATE,
        data.ownerId,
        'unknown',
        false,
        data.ipAddress,
        data.userAgent,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }

    if (
      error instanceof NotFoundError ||
      error instanceof ValidationError
    ) {
      throw error;
    }
    logger.error('Failed to create share', {
      fileId: data.fileId,
      ownerId: data.ownerId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ValidationError('Failed to create share link');
  }
};

/**
 * Get share by token
 */
export const getShareByToken = async (
  shareToken: string,
  includePasswordHash: boolean = false
) => {
  try {
    logger.debug('Getting share by token', { shareToken });

    // Check cache first
    const cachedShare = await getCache<any>(`share:${shareToken}`);

    if (cachedShare && !includePasswordHash) {
      logger.debug('Share found in cache', { shareToken });
      return cachedShare;
    }

    // Get from database
    const share = await prisma.share.findUnique({
      where: { shareToken },
      include: {
        file: {
          select: {
            id: true,
            filenameEncrypted: true,
            filenameIv: true,
            fileSize: true,
            mimeType: true,
            storagePath: true,
            isDeleted: true,
          },
        },
        owner: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    if (!share) {
      throw new NotFoundError('Share link not found');
    }

    // Cache share
    const cacheTTL = share.expiresAt
      ? Math.floor((share.expiresAt.getTime() - Date.now()) / 1000)
      : 7 * 24 * 60 * 60;

    if (cacheTTL > 0) {
      await setCache(`share:${shareToken}`, {
        id: share.id,
        fileId: share.fileId,
        ownerId: share.ownerId,
        hasPassword: !!share.passwordHash,
        expiresAt: share.expiresAt,
        maxDownloads: share.maxDownloads,
        downloadCount: share.downloadCount,
        isActive: share.isActive,
      }, cacheTTL);
    }

    if (!includePasswordHash) {
      return {
        ...share,
        passwordHash: undefined,
      };
    }

    return share;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    logger.error('Failed to get share', {
      shareToken,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ValidationError('Failed to get share link');
  }
};

/**
 * Validate share access
 */
export const validateShareAccess = async (
  shareToken: string,
  password?: string
): Promise<{ valid: boolean; share: any; reason?: string }> => {
  try {
    logger.debug('Validating share access', { shareToken, hasPassword: !!password });

    // Get share with password hash
    const share = await getShareByToken(shareToken, true);

    // Check if share is active
    if (!share.isActive) {
      return { valid: false, share, reason: 'Share link is disabled' };
    }

    // Check if file is deleted
    if (share.file?.isDeleted) {
      return { valid: false, share, reason: 'File has been deleted' };
    }

    // Check expiration
    if (share.expiresAt && share.expiresAt < new Date()) {
      return { valid: false, share, reason: 'Share link has expired' };
    }

    // Check download limit
    if (
      share.maxDownloads !== null &&
      share.downloadCount >= share.maxDownloads
    ) {
      return { valid: false, share, reason: 'Download limit reached' };
    }

    // Check password
    if (share.passwordHash) {
      if (!password) {
        return { valid: false, share, reason: 'Password required' };
      }

      const isPasswordValid = await bcrypt.compare(password, share.passwordHash);
      if (!isPasswordValid) {
        return { valid: false, share, reason: 'Invalid password' };
      }
    }

    return { valid: true, share: { ...share, passwordHash: undefined } };
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    logger.error('Failed to validate share access', {
      shareToken,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ValidationError('Failed to validate share access');
  }
};

/**
 * Access a share (verify and prepare for download)
 */
export const accessShare = async (data: AccessShareData) => {
  try {
    logger.info('Accessing share', {
      shareToken: data.shareToken,
      hasPassword: !!data.password,
    });

    // Validate access
    const validation = await validateShareAccess(data.shareToken, data.password);

    if (!validation.valid) {
      // Log failed access
      await auditService.logShareOperation(
        auditService.AuditAction.SHARE_ACCESS_DENIED,
        undefined,
        validation.share.id,
        false,
        data.ipAddress,
        data.userAgent,
        validation.reason
      );

      throw new ForbiddenError(validation.reason || 'Access denied');
    }

    // Update last accessed
    await prisma.share.update({
      where: { id: validation.share.id },
      data: { lastAccessed: new Date() },
    });

    // Log successful access
    await auditService.logShareOperation(
      auditService.AuditAction.SHARE_ACCESS,
      undefined,
      validation.share.id,
      true,
      data.ipAddress,
      data.userAgent
    );

    logger.info('Share accessed successfully', {
      shareId: validation.share.id,
      shareToken: data.shareToken,
    });

    return validation.share;
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof NotFoundError) {
      throw error;
    }
    logger.error('Failed to access share', {
      shareToken: data.shareToken,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ValidationError('Failed to access share link');
  }
};

/**
 * Download a shared file
 */
export const downloadSharedFile = async (
  shareToken: string,
  password?: string,
  ipAddress?: string,
  userAgent?: string
) => {
  try {
    logger.info('Downloading shared file', { shareToken });

    // Validate access
    const validation = await validateShareAccess(shareToken, password);

    if (!validation.valid) {
      // Log failed download
      await auditService.logShareOperation(
        auditService.AuditAction.SHARE_ACCESS_DENIED,
        undefined,
        validation.share.id,
        false,
        ipAddress,
        userAgent,
        validation.reason
      );

      throw new ForbiddenError(validation.reason || 'Access denied');
    }

    const share = validation.share;

    // Download file from storage
    const { stream, metadata } = await storageService.downloadFile(
      share.file.storagePath
    );

    // Increment download count and update last accessed
    await prisma.share.update({
      where: { id: share.id },
      data: {
        downloadCount: { increment: 1 },
        lastAccessed: new Date(),
      },
    });

    // Invalidate cache
    await deleteCache(`share:${shareToken}`);

    // Log successful download
    await auditService.logShareOperation(
      auditService.AuditAction.SHARE_DOWNLOAD,
      undefined,
      share.id,
      true,
      ipAddress,
      userAgent
    );

    logger.info('Shared file download initiated', {
      shareId: share.id,
      shareToken,
      downloadCount: share.downloadCount + 1,
    });

    return {
      stream,
      file: share.file,
      metadata,
      share: {
        id: share.id,
        downloadCount: share.downloadCount + 1,
        maxDownloads: share.maxDownloads,
      },
    };
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof NotFoundError) {
      throw error;
    }
    logger.error('Failed to download shared file', {
      shareToken,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ValidationError('Failed to download shared file');
  }
};

/**
 * Get shares for a user
 */
export const getShares = async (query: ShareQuery) => {
  try {
    logger.debug('Getting shares', query);

    // Build where clause
    const where: any = {
      ownerId: query.ownerId,
    };

    if (query.fileId) {
      where.fileId = query.fileId;
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    // Get total count
    const total = await prisma.share.count({ where });

    // Get shares
    const shares = await prisma.share.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take: query.limit || 100,
      skip: query.offset || 0,
      include: {
        file: {
          select: {
            id: true,
            filenameEncrypted: true,
            filenameIv: true,
            fileSize: true,
            mimeType: true,
            isDeleted: true,
          },
        },
      },
    });

    logger.debug('Shares retrieved', { count: shares.length, total });

    return {
      shares: shares.map((share) => ({
        ...share,
        passwordHash: undefined, // Don't expose password hash
        shareUrl: `/share/${share.shareToken}`,
        hasPassword: !!share.passwordHash,
      })),
      total,
      limit: query.limit || 100,
      offset: query.offset || 0,
    };
  } catch (error) {
    logger.error('Failed to get shares', {
      ownerId: query.ownerId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ValidationError('Failed to get shares');
  }
};

/**
 * Get share by ID
 */
export const getShareById = async (shareId: string, ownerId: string) => {
  try {
    logger.debug('Getting share by ID', { shareId, ownerId });

    const share = await prisma.share.findFirst({
      where: {
        id: shareId,
        ownerId,
      },
      include: {
        file: {
          select: {
            id: true,
            filenameEncrypted: true,
            filenameIv: true,
            fileSize: true,
            mimeType: true,
            isDeleted: true,
          },
        },
      },
    });

    if (!share) {
      throw new NotFoundError('Share not found');
    }

    return {
      ...share,
      passwordHash: undefined,
      shareUrl: `/share/${share.shareToken}`,
      hasPassword: !!share.passwordHash,
    };
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    logger.error('Failed to get share', {
      shareId,
      ownerId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ValidationError('Failed to get share');
  }
};

/**
 * Update a share
 */
export const updateShare = async (
  shareId: string,
  ownerId: string,
  data: UpdateShareData,
  ipAddress?: string,
  userAgent?: string
) => {
  try {
    logger.info('Updating share', { shareId, ownerId });

    // Check if share exists and belongs to owner
    const existingShare = await prisma.share.findFirst({
      where: {
        id: shareId,
        ownerId,
      },
    });

    if (!existingShare) {
      throw new NotFoundError('Share not found');
    }

    // Validate expiration date if being changed
    if (data.expiresAt !== undefined && data.expiresAt !== null) {
      if (data.expiresAt <= new Date()) {
        throw new ValidationError('Expiration date must be in the future');
      }
    }

    // Validate max downloads if being changed
    if (data.maxDownloads !== undefined && data.maxDownloads !== null) {
      if (data.maxDownloads < 1) {
        throw new ValidationError('Max downloads must be at least 1');
      }
    }

    // Hash new password if provided
    let passwordHash: string | null | undefined;
    if (data.password !== undefined) {
      if (data.password === null) {
        passwordHash = null; // Remove password
      } else {
        passwordHash = await bcrypt.hash(data.password, 10);
      }
    }

    // Update share
    const updatedShare = await prisma.share.update({
      where: { id: shareId },
      data: {
        ...(passwordHash !== undefined && { passwordHash }),
        ...(data.expiresAt !== undefined && { expiresAt: data.expiresAt }),
        ...(data.maxDownloads !== undefined && { maxDownloads: data.maxDownloads }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      include: {
        file: {
          select: {
            id: true,
            filenameEncrypted: true,
            filenameIv: true,
            fileSize: true,
            mimeType: true,
          },
        },
      },
    });

    // Invalidate cache
    await deleteCache(`share:${existingShare.shareToken}`);

    logger.info('Share updated successfully', { shareId, ownerId });

    return {
      ...updatedShare,
      passwordHash: undefined,
      shareUrl: `/share/${updatedShare.shareToken}`,
      hasPassword: !!updatedShare.passwordHash,
    };
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof ValidationError
    ) {
      throw error;
    }
    logger.error('Failed to update share', {
      shareId,
      ownerId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ValidationError('Failed to update share');
  }
};

/**
 * Delete a share
 */
export const deleteShare = async (
  shareId: string,
  ownerId: string,
  ipAddress?: string,
  userAgent?: string
) => {
  try {
    logger.info('Deleting share', { shareId, ownerId });

    // Get share
    const share = await prisma.share.findFirst({
      where: {
        id: shareId,
        ownerId,
      },
    });

    if (!share) {
      throw new NotFoundError('Share not found');
    }

    // Delete share
    await prisma.share.delete({
      where: { id: shareId },
    });

    // Invalidate cache
    await deleteCache(`share:${share.shareToken}`);

    // Log audit event
    await auditService.logShareOperation(
      auditService.AuditAction.SHARE_DELETE,
      ownerId,
      shareId,
      true,
      ipAddress,
      userAgent
    );

    logger.info('Share deleted successfully', { shareId, ownerId });
  } catch (error) {
    // Log failed deletion
    await auditService.logShareOperation(
      auditService.AuditAction.SHARE_DELETE,
      ownerId,
      shareId,
      false,
      ipAddress,
      userAgent,
      error instanceof Error ? error.message : 'Unknown error'
    );

    if (error instanceof NotFoundError) {
      throw error;
    }
    logger.error('Failed to delete share', {
      shareId,
      ownerId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ValidationError('Failed to delete share');
  }
};

/**
 * Clean up expired shares
 * Should be run periodically as a cron job
 */
export const cleanupExpiredShares = async (): Promise<number> => {
  try {
    logger.info('Cleaning up expired shares');

    const result = await prisma.share.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    logger.info('Expired shares cleaned up', { deletedCount: result.count });

    return result.count;
  } catch (error) {
    logger.error('Failed to cleanup expired shares', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ValidationError('Failed to cleanup expired shares');
  }
};

/**
 * Get share statistics for a file
 */
export const getFileShareStats = async (fileId: string, ownerId: string) => {
  try {
    logger.debug('Getting share stats for file', { fileId, ownerId });

    const shares = await prisma.share.findMany({
      where: {
        fileId,
        ownerId,
      },
      select: {
        id: true,
        downloadCount: true,
        isActive: true,
        expiresAt: true,
        createdAt: true,
        lastAccessed: true,
      },
    });

    const totalShares = shares.length;
    const activeShares = shares.filter((s) => s.isActive).length;
    const totalDownloads = shares.reduce((sum, s) => sum + s.downloadCount, 0);
    const expiredShares = shares.filter(
      (s) => s.expiresAt && s.expiresAt < new Date()
    ).length;

    return {
      totalShares,
      activeShares,
      expiredShares,
      totalDownloads,
      shares: shares.map((s) => ({
        id: s.id,
        downloadCount: s.downloadCount,
        isActive: s.isActive,
        expiresAt: s.expiresAt,
        createdAt: s.createdAt,
        lastAccessed: s.lastAccessed,
      })),
    };
  } catch (error) {
    logger.error('Failed to get file share stats', {
      fileId,
      ownerId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ValidationError('Failed to get file share statistics');
  }
};

// Export all functions
export default {
  generateShareToken,
  createShare,
  getShareByToken,
  validateShareAccess,
  accessShare,
  downloadSharedFile,
  getShares,
  getShareById,
  updateShare,
  deleteShare,
  cleanupExpiredShares,
  getFileShareStats,
};
