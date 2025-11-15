import { v4 as uuidv4 } from 'uuid';
import { prisma, runTransaction } from '../config/database';
import logger from '../utils/logger';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from '../utils/errors';
import * as auditService from './audit.service';
import * as storageService from './storage.service';

/**
 * Folder Service
 * Handles folder CRUD operations, hierarchy management, and moving files between folders
 */

/**
 * Interface Definitions
 */
export interface CreateFolderData {
  userId: string;
  parentFolderId?: string;
  nameEncrypted: string;
  nameIv: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface UpdateFolderData {
  nameEncrypted?: string;
  nameIv?: string;
  parentFolderId?: string | null;
}

export interface FolderQuery {
  userId: string;
  parentFolderId?: string | null;
  isDeleted?: boolean;
  limit?: number;
  offset?: number;
}

export interface FolderWithContents {
  id: string;
  nameEncrypted: string;
  nameIv: string;
  parentFolderId: string | null;
  createdAt: Date;
  updatedAt: Date;
  files: any[];
  subFolders: any[];
  breadcrumbs: any[];
}

/**
 * Create a new folder
 */
export const createFolder = async (data: CreateFolderData) => {
  try {
    logger.info('Creating new folder', {
      userId: data.userId,
      parentFolderId: data.parentFolderId,
    });

    // Validate input
    if (!data.nameEncrypted || !data.nameIv) {
      throw new ValidationError('Folder name is required');
    }

    // Validate parent folder if provided
    if (data.parentFolderId) {
      const parentFolder = await prisma.folder.findFirst({
        where: {
          id: data.parentFolderId,
          userId: data.userId,
          isDeleted: false,
        },
      });

      if (!parentFolder) {
        throw new NotFoundError('Parent folder not found');
      }

      // Check for circular reference (folder can't be its own parent)
      if (data.parentFolderId === data.parentFolderId) {
        throw new ValidationError('Folder cannot be its own parent');
      }
    }

    // Create folder
    const folder = await prisma.folder.create({
      data: {
        id: uuidv4(),
        userId: data.userId,
        parentFolderId: data.parentFolderId,
        nameEncrypted: data.nameEncrypted,
        nameIv: data.nameIv,
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
    await auditService.logFolderOperation(
      auditService.AuditAction.FOLDER_CREATE,
      data.userId,
      folder.id,
      true,
      data.ipAddress,
      data.userAgent
    );

    logger.info('Folder created successfully', {
      folderId: folder.id,
      userId: data.userId,
    });

    return folder;
  } catch (error) {
    // Log failed creation
    if (data.userId) {
      await auditService.logFolderOperation(
        auditService.AuditAction.FOLDER_CREATE,
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
      error instanceof ConflictError
    ) {
      throw error;
    }
    logger.error('Failed to create folder', {
      userId: data.userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ValidationError('Failed to create folder');
  }
};

/**
 * Get folder by ID
 */
export const getFolderById = async (folderId: string, userId: string) => {
  try {
    logger.debug('Getting folder by ID', { folderId, userId });

    const folder = await prisma.folder.findFirst({
      where: {
        id: folderId,
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
          where: {
            isDeleted: false,
          },
          select: {
            id: true,
            nameEncrypted: true,
            nameIv: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        files: {
          where: {
            isDeleted: false,
          },
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
      },
    });

    if (!folder) {
      throw new NotFoundError('Folder not found');
    }

    return folder;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    logger.error('Failed to get folder', {
      folderId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ValidationError('Failed to get folder');
  }
};

/**
 * Get folders for a user with filtering
 */
export const getFolders = async (query: FolderQuery) => {
  try {
    logger.debug('Getting folders', query);

    // Build where clause
    const where: any = {
      userId: query.userId,
      isDeleted: query.isDeleted ?? false,
    };

    // Handle parent folder filter
    if (query.parentFolderId === null) {
      // Root level folders (no parent folder)
      where.parentFolderId = null;
    } else if (query.parentFolderId) {
      where.parentFolderId = query.parentFolderId;
    }

    // Get total count
    const total = await prisma.folder.count({ where });

    // Get folders
    const folders = await prisma.folder.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
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
        _count: {
          select: {
            files: {
              where: {
                isDeleted: false,
              },
            },
            subFolders: {
              where: {
                isDeleted: false,
              },
            },
          },
        },
      },
    });

    logger.debug('Folders retrieved', { count: folders.length, total });

    return {
      folders,
      total,
      limit: query.limit || 100,
      offset: query.offset || 0,
    };
  } catch (error) {
    logger.error('Failed to get folders', {
      userId: query.userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ValidationError('Failed to get folders');
  }
};

/**
 * Get folder with contents (files and subfolders)
 */
export const getFolderWithContents = async (
  folderId: string | null,
  userId: string
): Promise<FolderWithContents | null> => {
  try {
    logger.debug('Getting folder with contents', { folderId, userId });

    let folder: any = null;
    let breadcrumbs: any[] = [];

    if (folderId) {
      // Get specific folder
      folder = await prisma.folder.findFirst({
        where: {
          id: folderId,
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
        },
      });

      if (!folder) {
        throw new NotFoundError('Folder not found');
      }

      // Build breadcrumbs
      breadcrumbs = await buildBreadcrumbs(folderId, userId);
    }

    // Get subfolders
    const subFolders = await prisma.folder.findMany({
      where: {
        userId,
        parentFolderId: folderId,
        isDeleted: false,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        nameEncrypted: true,
        nameIv: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            files: {
              where: {
                isDeleted: false,
              },
            },
            subFolders: {
              where: {
                isDeleted: false,
              },
            },
          },
        },
      },
    });

    // Get files
    const files = await prisma.file.findMany({
      where: {
        userId,
        parentFolderId: folderId,
        isDeleted: false,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        filenameEncrypted: true,
        filenameIv: true,
        fileSize: true,
        encryptedSize: true,
        mimeType: true,
        thumbnailPath: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      id: folder?.id || 'root',
      nameEncrypted: folder?.nameEncrypted || 'root',
      nameIv: folder?.nameIv || '',
      parentFolderId: folder?.parentFolderId || null,
      createdAt: folder?.createdAt || new Date(),
      updatedAt: folder?.updatedAt || new Date(),
      files,
      subFolders,
      breadcrumbs,
    };
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    logger.error('Failed to get folder with contents', {
      folderId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ValidationError('Failed to get folder with contents');
  }
};

/**
 * Build breadcrumb trail for a folder
 */
export const buildBreadcrumbs = async (
  folderId: string,
  userId: string
): Promise<any[]> => {
  const breadcrumbs: any[] = [];
  let currentFolderId: string | null = folderId;

  try {
    // Traverse up the folder hierarchy
    while (currentFolderId) {
      const folder = await prisma.folder.findFirst({
        where: {
          id: currentFolderId,
          userId,
          isDeleted: false,
        },
        select: {
          id: true,
          nameEncrypted: true,
          nameIv: true,
          parentFolderId: true,
        },
      });

      if (!folder) {
        break;
      }

      breadcrumbs.unshift({
        id: folder.id,
        nameEncrypted: folder.nameEncrypted,
        nameIv: folder.nameIv,
      });

      currentFolderId = folder.parentFolderId;

      // Prevent infinite loops
      if (breadcrumbs.length > 100) {
        logger.warn('Breadcrumb depth exceeded 100, possible circular reference', {
          folderId,
          userId,
        });
        break;
      }
    }

    return breadcrumbs;
  } catch (error) {
    logger.error('Failed to build breadcrumbs', {
      folderId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return [];
  }
};

/**
 * Update folder metadata
 */
export const updateFolder = async (
  folderId: string,
  userId: string,
  data: UpdateFolderData,
  ipAddress?: string,
  userAgent?: string
) => {
  try {
    logger.info('Updating folder', { folderId, userId });

    // Check if folder exists and belongs to user
    const existingFolder = await prisma.folder.findFirst({
      where: {
        id: folderId,
        userId,
        isDeleted: false,
      },
    });

    if (!existingFolder) {
      throw new NotFoundError('Folder not found');
    }

    // Validate parent folder if being changed
    if (data.parentFolderId !== undefined) {
      if (data.parentFolderId === folderId) {
        throw new ValidationError('Folder cannot be its own parent');
      }

      if (data.parentFolderId !== null) {
        const parentFolder = await prisma.folder.findFirst({
          where: {
            id: data.parentFolderId,
            userId,
            isDeleted: false,
          },
        });

        if (!parentFolder) {
          throw new NotFoundError('Parent folder not found');
        }

        // Check for circular reference
        const wouldCreateCircular = await checkCircularReference(
          folderId,
          data.parentFolderId,
          userId
        );

        if (wouldCreateCircular) {
          throw new ValidationError(
            'Moving folder would create a circular reference'
          );
        }
      }
    }

    // Update folder
    const updatedFolder = await prisma.folder.update({
      where: { id: folderId },
      data: {
        ...(data.nameEncrypted && { nameEncrypted: data.nameEncrypted }),
        ...(data.nameIv && { nameIv: data.nameIv }),
        ...(data.parentFolderId !== undefined && {
          parentFolderId: data.parentFolderId,
        }),
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
    const action =
      data.parentFolderId !== undefined
        ? auditService.AuditAction.FOLDER_MOVE
        : data.nameEncrypted
        ? auditService.AuditAction.FOLDER_RENAME
        : auditService.AuditAction.FOLDER_UPDATE;

    await auditService.logFolderOperation(
      action,
      userId,
      folderId,
      true,
      ipAddress,
      userAgent
    );

    logger.info('Folder updated successfully', { folderId, userId });

    return updatedFolder;
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof ValidationError
    ) {
      throw error;
    }
    logger.error('Failed to update folder', {
      folderId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ValidationError('Failed to update folder');
  }
};

/**
 * Check if moving a folder would create a circular reference
 */
export const checkCircularReference = async (
  folderId: string,
  newParentId: string,
  userId: string
): Promise<boolean> => {
  try {
    let currentParentId: string | null = newParentId;
    const visited = new Set<string>([folderId]);

    // Traverse up the parent chain
    while (currentParentId) {
      if (visited.has(currentParentId)) {
        // Found a circular reference
        return true;
      }

      visited.add(currentParentId);

      const parent = await prisma.folder.findFirst({
        where: {
          id: currentParentId,
          userId,
          isDeleted: false,
        },
        select: {
          parentFolderId: true,
        },
      });

      if (!parent) {
        break;
      }

      currentParentId = parent.parentFolderId;

      // Safety check to prevent infinite loops
      if (visited.size > 100) {
        logger.warn('Circular reference check depth exceeded 100', {
          folderId,
          newParentId,
          userId,
        });
        return true; // Assume circular to be safe
      }
    }

    return false;
  } catch (error) {
    logger.error('Failed to check circular reference', {
      folderId,
      newParentId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    // Assume circular reference on error to be safe
    return true;
  }
};

/**
 * Delete a folder (soft delete) and optionally all contents
 */
export const deleteFolder = async (
  folderId: string,
  userId: string,
  deleteContents: boolean = false,
  permanent: boolean = false,
  ipAddress?: string,
  userAgent?: string
) => {
  try {
    logger.info('Deleting folder', { folderId, userId, deleteContents, permanent });

    // Get folder
    const folder = await prisma.folder.findFirst({
      where: {
        id: folderId,
        userId,
      },
      include: {
        files: true,
        subFolders: true,
      },
    });

    if (!folder) {
      throw new NotFoundError('Folder not found');
    }

    // Check if folder has contents
    if (!deleteContents && (folder.files.length > 0 || folder.subFolders.length > 0)) {
      throw new ValidationError(
        'Folder is not empty. Set deleteContents to true to delete all contents.'
      );
    }

    if (permanent) {
      // Permanent delete
      await runTransaction(async (tx) => {
        if (deleteContents) {
          // Recursively delete all subfolders and files
          await deleteAllFolderContents(folderId, userId, tx);
        }

        // Delete folder
        await tx.folder.delete({
          where: { id: folderId },
        });
      });
    } else {
      // Soft delete
      await runTransaction(async (tx) => {
        if (deleteContents) {
          // Soft delete all subfolders and files
          await softDeleteAllFolderContents(folderId, userId, tx);
        }

        // Soft delete folder
        await tx.folder.update({
          where: { id: folderId },
          data: {
            isDeleted: true,
          },
        });
      });
    }

    // Log audit event
    await auditService.logFolderOperation(
      auditService.AuditAction.FOLDER_DELETE,
      userId,
      folderId,
      true,
      ipAddress,
      userAgent
    );

    logger.info('Folder deleted successfully', { folderId, userId, permanent });
  } catch (error) {
    // Log failed deletion
    await auditService.logFolderOperation(
      auditService.AuditAction.FOLDER_DELETE,
      userId,
      folderId,
      false,
      ipAddress,
      userAgent,
      error instanceof Error ? error.message : 'Unknown error'
    );

    if (
      error instanceof NotFoundError ||
      error instanceof ValidationError
    ) {
      throw error;
    }
    logger.error('Failed to delete folder', {
      folderId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ValidationError('Failed to delete folder');
  }
};

/**
 * Recursively delete all folder contents (permanent)
 */
const deleteAllFolderContents = async (
  folderId: string,
  userId: string,
  tx: any
) => {
  // Get all subfolders
  const subFolders = await tx.folder.findMany({
    where: {
      parentFolderId: folderId,
      userId,
    },
  });

  // Recursively delete subfolders
  for (const subFolder of subFolders) {
    await deleteAllFolderContents(subFolder.id, userId, tx);
    await tx.folder.delete({
      where: { id: subFolder.id },
    });
  }

  // Get all files in folder
  const files = await tx.file.findMany({
    where: {
      parentFolderId: folderId,
      userId,
    },
  });

  // Delete files from storage
  const storagePaths = files.map((f: any) => f.storagePath);
  if (storagePaths.length > 0) {
    try {
      await storageService.deleteMultipleFiles(storagePaths);
    } catch (error) {
      logger.error('Failed to delete files from storage during folder deletion', {
        folderId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Delete files from database
  await tx.file.deleteMany({
    where: {
      parentFolderId: folderId,
      userId,
    },
  });

  // Update user storage usage
  const totalSize = files.reduce(
    (sum: bigint, file: any) => sum + file.encryptedSize,
    BigInt(0)
  );

  if (totalSize > 0) {
    await tx.user.update({
      where: { id: userId },
      data: {
        storageUsed: {
          decrement: totalSize,
        },
      },
    });
  }
};

/**
 * Recursively soft delete all folder contents
 */
const softDeleteAllFolderContents = async (
  folderId: string,
  userId: string,
  tx: any
) => {
  // Get all subfolders
  const subFolders = await tx.folder.findMany({
    where: {
      parentFolderId: folderId,
      userId,
      isDeleted: false,
    },
  });

  // Recursively soft delete subfolders
  for (const subFolder of subFolders) {
    await softDeleteAllFolderContents(subFolder.id, userId, tx);
    await tx.folder.update({
      where: { id: subFolder.id },
      data: { isDeleted: true },
    });
  }

  // Soft delete all files in folder
  const files = await tx.file.findMany({
    where: {
      parentFolderId: folderId,
      userId,
      isDeleted: false,
    },
  });

  await tx.file.updateMany({
    where: {
      parentFolderId: folderId,
      userId,
      isDeleted: false,
    },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
    },
  });

  // Update user storage usage
  const totalSize = files.reduce(
    (sum: bigint, file: any) => sum + file.encryptedSize,
    BigInt(0)
  );

  if (totalSize > 0) {
    await tx.user.update({
      where: { id: userId },
      data: {
        storageUsed: {
          decrement: totalSize,
        },
      },
    });
  }
};

/**
 * Move files to a different folder
 */
export const moveFilesToFolder = async (
  fileIds: string[],
  targetFolderId: string | null,
  userId: string,
  ipAddress?: string,
  userAgent?: string
) => {
  try {
    logger.info('Moving files to folder', {
      fileCount: fileIds.length,
      targetFolderId,
      userId,
    });

    // Validate target folder if provided
    if (targetFolderId) {
      const folder = await prisma.folder.findFirst({
        where: {
          id: targetFolderId,
          userId,
          isDeleted: false,
        },
      });

      if (!folder) {
        throw new NotFoundError('Target folder not found');
      }
    }

    // Move files
    const result = await prisma.file.updateMany({
      where: {
        id: {
          in: fileIds,
        },
        userId,
        isDeleted: false,
      },
      data: {
        parentFolderId: targetFolderId,
      },
    });

    // Log audit events for each file
    for (const fileId of fileIds) {
      await auditService.logFileOperation(
        auditService.AuditAction.FILE_MOVE,
        userId,
        fileId,
        true,
        ipAddress,
        userAgent
      );
    }

    logger.info('Files moved successfully', {
      count: result.count,
      targetFolderId,
    });

    return result;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    logger.error('Failed to move files', {
      fileCount: fileIds.length,
      targetFolderId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ValidationError('Failed to move files');
  }
};

/**
 * Get folder tree structure (for navigation)
 */
export const getFolderTree = async (userId: string, maxDepth: number = 10) => {
  try {
    logger.debug('Getting folder tree', { userId, maxDepth });

    // Get all folders for the user
    const folders = await prisma.folder.findMany({
      where: {
        userId,
        isDeleted: false,
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        nameEncrypted: true,
        nameIv: true,
        parentFolderId: true,
      },
    });

    // Build tree structure
    const tree = buildFolderTree(folders, null, 0, maxDepth);

    return tree;
  } catch (error) {
    logger.error('Failed to get folder tree', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ValidationError('Failed to get folder tree');
  }
};

/**
 * Build folder tree recursively
 */
const buildFolderTree = (
  folders: any[],
  parentId: string | null,
  depth: number,
  maxDepth: number
): any[] => {
  if (depth >= maxDepth) {
    return [];
  }

  const children = folders.filter((f) => f.parentFolderId === parentId);

  return children.map((folder) => ({
    id: folder.id,
    nameEncrypted: folder.nameEncrypted,
    nameIv: folder.nameIv,
    children: buildFolderTree(folders, folder.id, depth + 1, maxDepth),
  }));
};

// Export all functions
export default {
  createFolder,
  getFolderById,
  getFolders,
  getFolderWithContents,
  buildBreadcrumbs,
  updateFolder,
  checkCircularReference,
  deleteFolder,
  moveFilesToFolder,
  getFolderTree,
};
