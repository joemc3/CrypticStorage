import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from '../middleware/error.middleware';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { formatBytes } from '../middleware/upload.middleware';
import { prisma } from '../config/database';

/**
 * Get user profile
 * GET /api/users/profile
 */
export const getProfile = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        storageQuota: true,
        storageUsed: true,
        createdAt: true,
        updatedAt: true,
        lastLogin: true,
        isActive: true,
        emailVerified: true,
        totpSecretEncrypted: true,
        publicKey: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    res.json({
      success: true,
      message: 'Profile retrieved successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          storageQuota: user.storageQuota.toString(),
          storageUsed: user.storageUsed.toString(),
          storageQuotaFormatted: formatBytes(Number(user.storageQuota)),
          storageUsedFormatted: formatBytes(Number(user.storageUsed)),
          storagePercentage: Number(
            (BigInt(100) * user.storageUsed) / user.storageQuota
          ),
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastLogin: user.lastLogin,
          isActive: user.isActive,
          emailVerified: user.emailVerified,
          twoFactorEnabled: !!user.totpSecretEncrypted,
          publicKey: user.publicKey,
        },
      },
    });
  }
);

/**
 * Update user profile
 * PUT /api/users/profile
 */
export const updateProfile = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    const {
      username,
      email,
      currentPassword,
      newPassword,
      publicKey,
      privateKeyEncrypted,
    } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    // Build update data
    const updateData: any = {
      updatedAt: new Date(),
    };

    // Update username if provided
    if (username && username !== user.username) {
      // Check if username is already taken
      const existingUser = await prisma.user.findUnique({
        where: { username },
      });

      if (existingUser && existingUser.id !== userId) {
        throw new BadRequestError('Username already taken');
      }

      updateData.username = username;
    }

    // Update email if provided
    if (email && email !== user.email) {
      // Check if email is already taken
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser && existingUser.id !== userId) {
        throw new BadRequestError('Email already registered');
      }

      updateData.email = email;
      updateData.emailVerified = false; // Require re-verification
    }

    // Update password if provided
    if (newPassword) {
      if (!currentPassword) {
        throw new BadRequestError('Current password is required');
      }

      // Verify current password
      const isPasswordValid = await bcrypt.compare(
        currentPassword,
        user.passwordHash
      );

      if (!isPasswordValid) {
        throw new UnauthorizedError('Current password is incorrect');
      }

      // Hash new password
      const salt = bcrypt.genSaltSync(12);
      const passwordHash = await bcrypt.hash(newPassword, salt);

      updateData.passwordHash = passwordHash;
      updateData.salt = salt;

      // SECURITY: Invalidate ALL sessions when password changes
      // This ensures any compromised sessions are terminated
      await prisma.session.deleteMany({
        where: {
          userId,
        },
      });

      // Log password change for audit
      await prisma.auditLog.create({
        data: {
          id: uuidv4(),
          userId,
          action: 'PASSWORD_CHANGED',
          resourceType: 'User',
          resourceId: userId,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          success: true,
        },
      });
    }

    // Update encryption keys if provided
    if (publicKey) updateData.publicKey = publicKey;
    if (privateKeyEncrypted)
      updateData.privateKeyEncrypted = privateKeyEncrypted;

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        username: true,
        emailVerified: true,
        updatedAt: true,
      },
    });

    // Log profile update
    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        userId,
        action: 'PROFILE_UPDATED',
        resourceType: 'User',
        resourceId: userId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        success: true,
      },
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: updatedUser,
      },
    });
  }
);

/**
 * Get storage statistics
 * GET /api/users/storage/stats
 */
export const getStorageStats = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;

    // Get user storage info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        storageQuota: true,
        storageUsed: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    // Get file statistics
    const [fileCount, folderCount, fileTypeStats] = await Promise.all([
      prisma.file.count({
        where: {
          userId,
          isDeleted: false,
        },
      }),
      prisma.folder.count({
        where: {
          userId,
          isDeleted: false,
        },
      }),
      prisma.file.groupBy({
        by: ['mimeType'],
        where: {
          userId,
          isDeleted: false,
        },
        _sum: {
          fileSize: true,
        },
        _count: {
          id: true,
        },
      }),
    ]);

    // Calculate storage by file type
    const storageByType = fileTypeStats.map((stat) => ({
      mimeType: stat.mimeType || 'unknown',
      fileCount: stat._count.id,
      totalSize: stat._sum.fileSize?.toString() || '0',
      totalSizeFormatted: formatBytes(Number(stat._sum.fileSize || 0)),
    }));

    // Get recent uploads (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentUploads = await prisma.file.count({
      where: {
        userId,
        isDeleted: false,
        createdAt: {
          gte: thirtyDaysAgo,
        },
      },
    });

    // Get largest files
    const largestFiles = await prisma.file.findMany({
      where: {
        userId,
        isDeleted: false,
      },
      orderBy: {
        fileSize: 'desc',
      },
      take: 10,
      select: {
        id: true,
        filenameEncrypted: true,
        filenameIv: true,
        fileSize: true,
        mimeType: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      message: 'Storage statistics retrieved successfully',
      data: {
        storage: {
          quota: user.storageQuota.toString(),
          used: user.storageUsed.toString(),
          available: (user.storageQuota - user.storageUsed).toString(),
          quotaFormatted: formatBytes(Number(user.storageQuota)),
          usedFormatted: formatBytes(Number(user.storageUsed)),
          availableFormatted: formatBytes(
            Number(user.storageQuota - user.storageUsed)
          ),
          percentage: Number((BigInt(100) * user.storageUsed) / user.storageQuota),
        },
        files: {
          totalCount: fileCount,
          recentUploads: recentUploads,
          byType: storageByType,
          largest: largestFiles.map((file) => ({
            id: file.id,
            filenameEncrypted: file.filenameEncrypted,
            filenameIv: file.filenameIv,
            fileSize: file.fileSize.toString(),
            fileSizeFormatted: formatBytes(Number(file.fileSize)),
            mimeType: file.mimeType,
            createdAt: file.createdAt,
          })),
        },
        folders: {
          totalCount: folderCount,
        },
      },
    });
  }
);

/**
 * Get user activity log
 * GET /api/users/activity
 */
export const getActivity = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    const {
      action,
      resourceType,
      page = '1',
      limit = '50',
      startDate,
      endDate,
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: any = {
      userId,
    };

    if (action) {
      where.action = action as string;
    }

    if (resourceType) {
      where.resourceType = resourceType as string;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate as string);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate as string);
      }
    }

    // Get activity logs
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limitNum,
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Get activity summary
    const activitySummary = await prisma.auditLog.groupBy({
      by: ['action'],
      where: { userId },
      _count: {
        id: true,
      },
    });

    res.json({
      success: true,
      message: 'Activity log retrieved successfully',
      data: {
        activities: logs.map((log) => ({
          id: log.id,
          action: log.action,
          resourceType: log.resourceType,
          resourceId: log.resourceId,
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
          success: log.success,
          errorMessage: log.errorMessage,
          createdAt: log.createdAt,
        })),
        summary: activitySummary.map((stat) => ({
          action: stat.action,
          count: stat._count.id,
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    });
  }
);
