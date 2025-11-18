import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from '../middleware/error.middleware';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../config/database';

/**
 * Create a new folder
 * POST /api/folders
 */
export const createFolder = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    const { nameEncrypted, nameIv, parentFolderId } = req.body;

    if (!nameEncrypted || !nameIv) {
      throw new BadRequestError('Folder name encryption metadata required');
    }

    // Verify parent folder exists and belongs to user if provided
    if (parentFolderId) {
      const parentFolder = await prisma.folder.findFirst({
        where: {
          id: parentFolderId,
          userId,
          isDeleted: false,
        },
      });

      if (!parentFolder) {
        throw new NotFoundError('Parent folder');
      }
    }

    // Create folder
    const folder = await prisma.folder.create({
      data: {
        id: uuidv4(),
        userId,
        parentFolderId: parentFolderId || null,
        nameEncrypted,
        nameIv,
      },
    });

    // Log folder creation
    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        userId,
        action: 'FOLDER_CREATED',
        resourceType: 'Folder',
        resourceId: folder.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        success: true,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Folder created successfully',
      data: {
        folder: {
          id: folder.id,
          nameEncrypted: folder.nameEncrypted,
          nameIv: folder.nameIv,
          parentFolderId: folder.parentFolderId,
          createdAt: folder.createdAt,
          updatedAt: folder.updatedAt,
        },
      },
    });
  }
);

/**
 * List user's folders
 * GET /api/folders
 */
export const listFolders = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    const {
      parentFolderId,
      page = '1',
      limit = '100',
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

    // Get folders
    const [folders, total] = await Promise.all([
      prisma.folder.findMany({
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
          _count: {
            select: {
              files: {
                where: { isDeleted: false },
              },
              subFolders: {
                where: { isDeleted: false },
              },
            },
          },
        },
      }),
      prisma.folder.count({ where }),
    ]);

    res.json({
      success: true,
      message: 'Folders retrieved successfully',
      data: {
        folders: folders.map((folder) => ({
          id: folder.id,
          nameEncrypted: folder.nameEncrypted,
          nameIv: folder.nameIv,
          parentFolderId: folder.parentFolderId,
          parentFolder: folder.parentFolder,
          fileCount: folder._count.files,
          subFolderCount: folder._count.subFolders,
          createdAt: folder.createdAt,
          updatedAt: folder.updatedAt,
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
 * Get folder details
 * GET /api/folders/:id
 */
export const getFolder = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    const { id } = req.params;

    const folder = await prisma.folder.findFirst({
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
        subFolders: {
          where: { isDeleted: false },
          select: {
            id: true,
            nameEncrypted: true,
            nameIv: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        files: {
          where: { isDeleted: false },
          select: {
            id: true,
            filenameEncrypted: true,
            filenameIv: true,
            fileSize: true,
            mimeType: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        _count: {
          select: {
            files: {
              where: { isDeleted: false },
            },
            subFolders: {
              where: { isDeleted: false },
            },
          },
        },
      },
    });

    if (!folder) {
      throw new NotFoundError('Folder');
    }

    res.json({
      success: true,
      message: 'Folder retrieved successfully',
      data: {
        folder: {
          id: folder.id,
          nameEncrypted: folder.nameEncrypted,
          nameIv: folder.nameIv,
          parentFolderId: folder.parentFolderId,
          parentFolder: folder.parentFolder,
          subFolders: folder.subFolders,
          files: folder.files.map((file) => ({
            ...file,
            fileSize: file.fileSize.toString(),
          })),
          fileCount: folder._count.files,
          subFolderCount: folder._count.subFolders,
          createdAt: folder.createdAt,
          updatedAt: folder.updatedAt,
        },
      },
    });
  }
);

/**
 * Update folder
 * PUT /api/folders/:id
 */
export const updateFolder = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    const { id } = req.params;
    const { nameEncrypted, nameIv, parentFolderId } = req.body;

    // Find folder
    const folder = await prisma.folder.findFirst({
      where: {
        id,
        userId,
        isDeleted: false,
      },
    });

    if (!folder) {
      throw new NotFoundError('Folder');
    }

    // Check for circular reference if moving folder
    if (parentFolderId !== undefined && parentFolderId !== null) {
      // Prevent moving a folder into itself
      if (parentFolderId === id) {
        throw new BadRequestError('Cannot move folder into itself');
      }

      // Verify new parent folder exists and belongs to user
      const newParent = await prisma.folder.findFirst({
        where: {
          id: parentFolderId,
          userId,
          isDeleted: false,
        },
      });

      if (!newParent) {
        throw new NotFoundError('Parent folder');
      }

      // Check if new parent is a descendant of current folder (would create circular reference)
      const checkCircular = async (
        folderId: string,
        targetId: string
      ): Promise<boolean> => {
        const descendants = await prisma.folder.findMany({
          where: {
            parentFolderId: folderId,
            isDeleted: false,
          },
        });

        for (const desc of descendants) {
          if (desc.id === targetId) return true;
          if (await checkCircular(desc.id, targetId)) return true;
        }

        return false;
      };

      if (await checkCircular(id, parentFolderId)) {
        throw new BadRequestError(
          'Cannot move folder into its own descendant'
        );
      }
    }

    // Update folder
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (nameEncrypted) updateData.nameEncrypted = nameEncrypted;
    if (nameIv) updateData.nameIv = nameIv;
    if (parentFolderId !== undefined)
      updateData.parentFolderId = parentFolderId;

    const updatedFolder = await prisma.folder.update({
      where: { id },
      data: updateData,
    });

    // Log folder update
    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        userId,
        action: 'FOLDER_UPDATED',
        resourceType: 'Folder',
        resourceId: folder.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        success: true,
      },
    });

    res.json({
      success: true,
      message: 'Folder updated successfully',
      data: {
        folder: {
          id: updatedFolder.id,
          nameEncrypted: updatedFolder.nameEncrypted,
          nameIv: updatedFolder.nameIv,
          parentFolderId: updatedFolder.parentFolderId,
          updatedAt: updatedFolder.updatedAt,
        },
      },
    });
  }
);

/**
 * Delete folder (soft delete)
 * DELETE /api/folders/:id
 */
export const deleteFolder = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    const { id } = req.params;
    const { permanent = 'false', cascade = 'false' } = req.query;

    // Find folder
    const folder = await prisma.folder.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        _count: {
          select: {
            files: {
              where: { isDeleted: false },
            },
            subFolders: {
              where: { isDeleted: false },
            },
          },
        },
      },
    });

    if (!folder) {
      throw new NotFoundError('Folder');
    }

    // Check if folder is empty (unless cascade delete is requested)
    if (cascade !== 'true') {
      if (folder._count.files > 0 || folder._count.subFolders > 0) {
        throw new BadRequestError(
          'Folder is not empty. Use cascade=true to delete all contents.'
        );
      }
    }

    if (permanent === 'true') {
      // Permanent delete
      if (cascade === 'true') {
        // Delete all files in folder and subfolders recursively
        const deleteRecursive = async (folderId: string): Promise<void> => {
          // Get all files in this folder
          const files = await prisma.file.findMany({
            where: { parentFolderId: folderId },
          });

          // Delete files
          await prisma.file.deleteMany({
            where: { parentFolderId: folderId },
          });

          // Update user storage
          const totalSize = files.reduce(
            (sum, file) => sum + file.fileSize,
            BigInt(0)
          );
          if (totalSize > 0) {
            await prisma.user.update({
              where: { id: userId },
              data: {
                storageUsed: {
                  decrement: totalSize,
                },
              },
            });
          }

          // Get subfolders
          const subFolders = await prisma.folder.findMany({
            where: { parentFolderId: folderId },
          });

          // Recursively delete subfolders
          for (const subFolder of subFolders) {
            await deleteRecursive(subFolder.id);
          }

          // Delete subfolders
          await prisma.folder.deleteMany({
            where: { parentFolderId: folderId },
          });
        };

        await deleteRecursive(id);
      }

      // Delete the folder itself
      await prisma.folder.delete({
        where: { id },
      });

      // Log permanent deletion
      await prisma.auditLog.create({
        data: {
          id: uuidv4(),
          userId,
          action: 'FOLDER_DELETED_PERMANENT',
          resourceType: 'Folder',
          resourceId: folder.id,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          success: true,
        },
      });

      res.json({
        success: true,
        message: 'Folder permanently deleted',
      });
    } else {
      // Soft delete
      if (cascade === 'true') {
        // Soft delete all files and subfolders
        const softDeleteRecursive = async (
          folderId: string
        ): Promise<void> => {
          // Soft delete files
          await prisma.file.updateMany({
            where: {
              parentFolderId: folderId,
              isDeleted: false,
            },
            data: {
              isDeleted: true,
              deletedAt: new Date(),
            },
          });

          // Get subfolders
          const subFolders = await prisma.folder.findMany({
            where: {
              parentFolderId: folderId,
              isDeleted: false,
            },
          });

          // Recursively soft delete subfolders
          for (const subFolder of subFolders) {
            await softDeleteRecursive(subFolder.id);
          }

          // Soft delete subfolders
          await prisma.folder.updateMany({
            where: {
              parentFolderId: folderId,
              isDeleted: false,
            },
            data: {
              isDeleted: true,
            },
          });
        };

        await softDeleteRecursive(id);
      }

      // Soft delete the folder itself
      await prisma.folder.update({
        where: { id },
        data: {
          isDeleted: true,
        },
      });

      // Log soft deletion
      await prisma.auditLog.create({
        data: {
          id: uuidv4(),
          userId,
          action: 'FOLDER_DELETED',
          resourceType: 'Folder',
          resourceId: folder.id,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          success: true,
        },
      });

      res.json({
        success: true,
        message: 'Folder moved to trash',
      });
    }
  }
);
