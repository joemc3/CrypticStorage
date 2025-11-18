import { Response, NextFunction, Request } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
} from '../middleware/error.middleware';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';

/**
 * Generate a secure share token
 */
const generateShareToken = (): string => {
  return crypto.randomBytes(32).toString('base64url');
};

/**
 * Create a share link for a file
 * POST /api/shares
 */
export const createShare = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    const {
      fileId,
      fileKeyEncrypted,
      password,
      expiresAt,
      maxDownloads,
    } = req.body;

    if (!fileId || !fileKeyEncrypted) {
      throw new BadRequestError('File ID and encrypted file key are required');
    }

    // Verify file exists and belongs to user
    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        userId,
        isDeleted: false,
      },
    });

    if (!file) {
      throw new NotFoundError('File');
    }

    // Generate share token
    const shareToken = generateShareToken();

    // Hash password if provided
    let passwordHash: string | null = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    // Parse expiration date
    let expirationDate: Date | null = null;
    if (expiresAt) {
      expirationDate = new Date(expiresAt);
      if (expirationDate <= new Date()) {
        throw new BadRequestError('Expiration date must be in the future');
      }
    }

    // Validate max downloads
    let maxDownloadsNum: number | null = null;
    if (maxDownloads !== undefined && maxDownloads !== null) {
      maxDownloadsNum = parseInt(maxDownloads, 10);
      if (maxDownloadsNum <= 0) {
        throw new BadRequestError('Max downloads must be greater than 0');
      }
    }

    // Create share
    const share = await prisma.share.create({
      data: {
        id: uuidv4(),
        fileId,
        ownerId: userId,
        shareToken,
        fileKeyEncrypted,
        passwordHash,
        expiresAt: expirationDate,
        maxDownloads: maxDownloadsNum,
        downloadCount: 0,
        isActive: true,
      },
    });

    // Log share creation
    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        userId,
        action: 'SHARE_CREATED',
        resourceType: 'Share',
        resourceId: share.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        success: true,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Share link created successfully',
      data: {
        share: {
          id: share.id,
          shareToken: share.shareToken,
          fileId: share.fileId,
          passwordProtected: !!passwordHash,
          expiresAt: share.expiresAt,
          maxDownloads: share.maxDownloads,
          downloadCount: share.downloadCount,
          createdAt: share.createdAt,
          shareUrl: `${process.env.APP_URL || 'http://localhost:3000'}/share/${share.shareToken}`,
        },
      },
    });
  }
);

/**
 * Get share details (public endpoint)
 * GET /api/shares/:token
 */
export const getShare = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { token } = req.params;
    const { password } = req.query;

    // Find share
    const share = await prisma.share.findUnique({
      where: { shareToken: token },
      include: {
        file: {
          select: {
            id: true,
            filenameEncrypted: true,
            filenameIv: true,
            fileSize: true,
            mimeType: true,
            createdAt: true,
          },
        },
      },
    });

    if (!share || !share.isActive) {
      throw new NotFoundError('Share link');
    }

    // Check if share has expired
    if (share.expiresAt && share.expiresAt < new Date()) {
      // Deactivate expired share
      await prisma.share.update({
        where: { id: share.id },
        data: { isActive: false },
      });

      throw new BadRequestError('Share link has expired');
    }

    // Check if max downloads reached
    if (
      share.maxDownloads !== null &&
      share.downloadCount >= share.maxDownloads
    ) {
      throw new BadRequestError('Share link has reached maximum downloads');
    }

    // Check password if required
    if (share.passwordHash) {
      if (!password) {
        res.json({
          success: true,
          message: 'Password required',
          data: {
            requiresPassword: true,
            share: {
              id: share.id,
              expiresAt: share.expiresAt,
              maxDownloads: share.maxDownloads,
              downloadCount: share.downloadCount,
            },
          },
        });
        return;
      }

      const isPasswordValid = await bcrypt.compare(
        password as string,
        share.passwordHash
      );

      if (!isPasswordValid) {
        throw new UnauthorizedError('Invalid password');
      }
    }

    // Update last accessed
    await prisma.share.update({
      where: { id: share.id },
      data: { lastAccessed: new Date() },
    });

    res.json({
      success: true,
      message: 'Share details retrieved',
      data: {
        share: {
          id: share.id,
          fileId: share.fileId,
          fileKeyEncrypted: share.fileKeyEncrypted,
          file: {
            id: share.file.id,
            filenameEncrypted: share.file.filenameEncrypted,
            filenameIv: share.file.filenameIv,
            fileSize: share.file.fileSize.toString(),
            mimeType: share.file.mimeType,
            createdAt: share.file.createdAt,
          },
          expiresAt: share.expiresAt,
          maxDownloads: share.maxDownloads,
          downloadCount: share.downloadCount,
        },
      },
    });
  }
);

/**
 * Download shared file (public endpoint)
 * GET /api/shares/:token/download
 */
export const downloadSharedFile = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { token } = req.params;
    const { password } = req.query;

    // Find share
    const share = await prisma.share.findUnique({
      where: { shareToken: token },
      include: {
        file: true,
      },
    });

    if (!share || !share.isActive) {
      throw new NotFoundError('Share link');
    }

    // Check if share has expired
    if (share.expiresAt && share.expiresAt < new Date()) {
      await prisma.share.update({
        where: { id: share.id },
        data: { isActive: false },
      });

      throw new BadRequestError('Share link has expired');
    }

    // Check if max downloads reached
    if (
      share.maxDownloads !== null &&
      share.downloadCount >= share.maxDownloads
    ) {
      throw new BadRequestError('Share link has reached maximum downloads');
    }

    // Check password if required
    if (share.passwordHash) {
      if (!password) {
        throw new UnauthorizedError('Password required');
      }

      const isPasswordValid = await bcrypt.compare(
        password as string,
        share.passwordHash
      );

      if (!isPasswordValid) {
        throw new UnauthorizedError('Invalid password');
      }
    }

    // Increment download count
    await prisma.share.update({
      where: { id: share.id },
      data: {
        downloadCount: share.downloadCount + 1,
        lastAccessed: new Date(),
      },
    });

    // Log share download
    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        userId: share.ownerId,
        action: 'SHARE_DOWNLOADED',
        resourceType: 'Share',
        resourceId: share.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        success: true,
      },
    });

    // In production, this would stream from S3/MinIO
    res.json({
      success: true,
      message: 'File download initiated',
      data: {
        file: {
          id: share.file.id,
          storagePath: share.file.storagePath,
          fileKeyEncrypted: share.fileKeyEncrypted,
          fileSize: share.file.fileSize.toString(),
          mimeType: share.file.mimeType,
        },
      },
    });
  }
);

/**
 * Revoke a share link
 * DELETE /api/shares/:id
 */
export const revokeShare = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    const { id } = req.params;

    // Find share
    const share = await prisma.share.findFirst({
      where: {
        id,
        ownerId: userId,
      },
    });

    if (!share) {
      throw new NotFoundError('Share');
    }

    // Deactivate share
    await prisma.share.update({
      where: { id },
      data: { isActive: false },
    });

    // Log share revocation
    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        userId,
        action: 'SHARE_REVOKED',
        resourceType: 'Share',
        resourceId: share.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        success: true,
      },
    });

    res.json({
      success: true,
      message: 'Share link revoked successfully',
    });
  }
);

/**
 * List user's shares
 * GET /api/shares
 */
export const listShares = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    const {
      fileId,
      active = 'true',
      page = '1',
      limit = '50',
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: any = {
      ownerId: userId,
    };

    if (fileId) {
      where.fileId = fileId as string;
    }

    if (active === 'true') {
      where.isActive = true;
    } else if (active === 'false') {
      where.isActive = false;
    }

    // Get shares
    const [shares, total] = await Promise.all([
      prisma.share.findMany({
        where,
        orderBy: {
          [sortBy as string]: sortOrder as 'asc' | 'desc',
        },
        skip,
        take: limitNum,
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
      }),
      prisma.share.count({ where }),
    ]);

    res.json({
      success: true,
      message: 'Shares retrieved successfully',
      data: {
        shares: shares.map((share) => ({
          id: share.id,
          shareToken: share.shareToken,
          fileId: share.fileId,
          file: {
            ...share.file,
            fileSize: share.file.fileSize.toString(),
          },
          passwordProtected: !!share.passwordHash,
          expiresAt: share.expiresAt,
          maxDownloads: share.maxDownloads,
          downloadCount: share.downloadCount,
          isActive: share.isActive,
          createdAt: share.createdAt,
          lastAccessed: share.lastAccessed,
          shareUrl: `${process.env.APP_URL || 'http://localhost:3000'}/share/${share.shareToken}`,
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
