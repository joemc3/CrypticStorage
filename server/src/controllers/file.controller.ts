import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  PayloadTooLargeError,
} from '../middleware/error.middleware';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import path from 'path';
import { formatBytes } from '../middleware/upload.middleware';

const prisma = new PrismaClient();

/**
 * Upload a new file
 * POST /api/files
 */
export const uploadFile = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    const file = req.file;

    if (!file) {
      throw new BadRequestError('No file uploaded');
    }

    const {
      filenameEncrypted,
      filenameIv,
      fileKeyEncrypted,
      parentFolderId,
      mimeType,
    } = req.body;

    // Validate required fields
    if (!filenameEncrypted || !filenameIv || !fileKeyEncrypted) {
      throw new BadRequestError('Missing encryption metadata');
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    // Check storage quota
    const newStorageUsed = user.storageUsed + BigInt(file.size);
    if (newStorageUsed > user.storageQuota) {
      throw new PayloadTooLargeError(
        `Storage quota exceeded. Used: ${formatBytes(Number(user.storageUsed))}, Quota: ${formatBytes(Number(user.storageQuota))}`
      );
    }

    // Verify parent folder exists and belongs to user
    if (parentFolderId) {
      const folder = await prisma.folder.findFirst({
        where: {
          id: parentFolderId,
          userId,
          isDeleted: false,
        },
      });

      if (!folder) {
        throw new NotFoundError('Parent folder');
      }
    }

    // Generate file hash
    const fileHash = crypto
      .createHash('sha256')
      .update(file.buffer)
      .digest('hex');

    // Generate storage path (in production, this would be S3/MinIO path)
    const storagePath = `/storage/${userId}/${uuidv4()}`;

    // Create file record
    const newFile = await prisma.file.create({
      data: {
        id: uuidv4(),
        userId,
        parentFolderId: parentFolderId || null,
        filenameEncrypted,
        filenameIv,
        fileKeyEncrypted,
        fileSize: BigInt(file.size),
        encryptedSize: BigInt(file.buffer.length),
        mimeType: mimeType || file.mimetype,
        storagePath,
        fileHash,
        encryptionAlgorithm: 'AES-256-GCM',
        version: 1,
      },
    });

    // Update user storage
    await prisma.user.update({
      where: { id: userId },
      data: {
        storageUsed: newStorageUsed,
      },
    });

    // Log file upload
    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        userId,
        action: 'FILE_UPLOADED',
        resourceType: 'File',
        resourceId: newFile.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        success: true,
      },
    });

    res.status(201).json({
      success: true,
      message: 'File uploaded successfully',
      data: {
        file: {
          id: newFile.id,
          filenameEncrypted: newFile.filenameEncrypted,
          filenameIv: newFile.filenameIv,
          fileKeyEncrypted: newFile.fileKeyEncrypted,
          fileSize: newFile.fileSize.toString(),
          encryptedSize: newFile.encryptedSize.toString(),
          mimeType: newFile.mimeType,
          fileHash: newFile.fileHash,
          version: newFile.version,
          createdAt: newFile.createdAt,
          updatedAt: newFile.updatedAt,
        },
      },
    });
  }
);

/**
 * List user's files
 * GET /api/files
 */
export const listFiles = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    const {
      parentFolderId,
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
      userId,
      isDeleted: false,
    };

    if (parentFolderId === 'null' || parentFolderId === null) {
      where.parentFolderId = null;
    } else if (parentFolderId) {
      where.parentFolderId = parentFolderId as string;
    }

    // Get files
    const [files, total] = await Promise.all([
      prisma.file.findMany({
        where,
        orderBy: {
          [sortBy as string]: sortOrder as 'asc' | 'desc',
        },
        skip,
        take: limitNum,
        include: {
          parentFolder: {
            select: {
              id: true,
              nameEncrypted: true,
              nameIv: true,
            },
          },
        },
      }),
      prisma.file.count({ where }),
    ]);

    res.json({
      success: true,
      message: 'Files retrieved successfully',
      data: {
        files: files.map((file) => ({
          id: file.id,
          filenameEncrypted: file.filenameEncrypted,
          filenameIv: file.filenameIv,
          fileKeyEncrypted: file.fileKeyEncrypted,
          fileSize: file.fileSize.toString(),
          encryptedSize: file.encryptedSize.toString(),
          mimeType: file.mimeType,
          fileHash: file.fileHash,
          version: file.version,
          thumbnailPath: file.thumbnailPath,
          parentFolder: file.parentFolder,
          createdAt: file.createdAt,
          updatedAt: file.updatedAt,
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

/**
 * Get file details
 * GET /api/files/:id
 */
export const getFile = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    const { id } = req.params;

    const file = await prisma.file.findFirst({
      where: {
        id,
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
        },
      },
    });

    if (!file) {
      throw new NotFoundError('File');
    }

    res.json({
      success: true,
      message: 'File retrieved successfully',
      data: {
        file: {
          id: file.id,
          filenameEncrypted: file.filenameEncrypted,
          filenameIv: file.filenameIv,
          fileKeyEncrypted: file.fileKeyEncrypted,
          fileSize: file.fileSize.toString(),
          encryptedSize: file.encryptedSize.toString(),
          mimeType: file.mimeType,
          storagePath: file.storagePath,
          fileHash: file.fileHash,
          version: file.version,
          thumbnailPath: file.thumbnailPath,
          parentFolder: file.parentFolder,
          versions: file.versions.map((v) => ({
            id: v.id,
            versionNumber: v.versionNumber,
            fileSize: v.fileSize.toString(),
            createdAt: v.createdAt,
          })),
          createdAt: file.createdAt,
          updatedAt: file.updatedAt,
        },
      },
    });
  }
);

/**
 * Download file
 * GET /api/files/:id/download
 */
export const downloadFile = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    const { id } = req.params;

    const file = await prisma.file.findFirst({
      where: {
        id,
        userId,
        isDeleted: false,
      },
    });

    if (!file) {
      throw new NotFoundError('File');
    }

    // Log file download
    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        userId,
        action: 'FILE_DOWNLOADED',
        resourceType: 'File',
        resourceId: file.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        success: true,
      },
    });

    // In production, this would stream from S3/MinIO
    // For now, return file metadata with download URL
    res.json({
      success: true,
      message: 'File download initiated',
      data: {
        file: {
          id: file.id,
          storagePath: file.storagePath,
          fileKeyEncrypted: file.fileKeyEncrypted,
          fileSize: file.fileSize.toString(),
          mimeType: file.mimeType,
        },
      },
    });
  }
);

/**
 * Update file
 * PUT /api/files/:id
 */
export const updateFile = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    const { id } = req.params;
    const {
      filenameEncrypted,
      filenameIv,
      parentFolderId,
      newVersion,
    } = req.body;

    // Find file
    const file = await prisma.file.findFirst({
      where: {
        id,
        userId,
        isDeleted: false,
      },
    });

    if (!file) {
      throw new NotFoundError('File');
    }

    // Verify new parent folder if provided
    if (parentFolderId !== undefined) {
      if (parentFolderId !== null) {
        const folder = await prisma.folder.findFirst({
          where: {
            id: parentFolderId,
            userId,
            isDeleted: false,
          },
        });

        if (!folder) {
          throw new NotFoundError('Parent folder');
        }
      }
    }

    // Update file
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (filenameEncrypted) updateData.filenameEncrypted = filenameEncrypted;
    if (filenameIv) updateData.filenameIv = filenameIv;
    if (parentFolderId !== undefined)
      updateData.parentFolderId = parentFolderId;
    if (newVersion) updateData.version = file.version + 1;

    const updatedFile = await prisma.file.update({
      where: { id },
      data: updateData,
    });

    // Log file update
    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        userId,
        action: 'FILE_UPDATED',
        resourceType: 'File',
        resourceId: file.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        success: true,
      },
    });

    res.json({
      success: true,
      message: 'File updated successfully',
      data: {
        file: {
          id: updatedFile.id,
          filenameEncrypted: updatedFile.filenameEncrypted,
          filenameIv: updatedFile.filenameIv,
          fileKeyEncrypted: updatedFile.fileKeyEncrypted,
          fileSize: updatedFile.fileSize.toString(),
          version: updatedFile.version,
          updatedAt: updatedFile.updatedAt,
        },
      },
    });
  }
);

/**
 * Delete file (soft delete)
 * DELETE /api/files/:id
 */
export const deleteFile = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    const { id } = req.params;
    const { permanent = 'false' } = req.query;

    // Find file
    const file = await prisma.file.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!file) {
      throw new NotFoundError('File');
    }

    if (permanent === 'true') {
      // Permanent delete
      await prisma.file.delete({
        where: { id },
      });

      // Update user storage
      await prisma.user.update({
        where: { id: userId },
        data: {
          storageUsed: {
            decrement: file.fileSize,
          },
        },
      });

      // Log permanent deletion
      await prisma.auditLog.create({
        data: {
          id: uuidv4(),
          userId,
          action: 'FILE_DELETED_PERMANENT',
          resourceType: 'File',
          resourceId: file.id,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          success: true,
        },
      });

      res.json({
        success: true,
        message: 'File permanently deleted',
      });
    } else {
      // Soft delete
      await prisma.file.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      });

      // Log soft deletion
      await prisma.auditLog.create({
        data: {
          id: uuidv4(),
          userId,
          action: 'FILE_DELETED',
          resourceType: 'File',
          resourceId: file.id,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          success: true,
        },
      });

      res.json({
        success: true,
        message: 'File moved to trash',
      });
    }
  }
);
