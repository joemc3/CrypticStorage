import { Router } from 'express';
import {
  createFolder,
  listFolders,
  getFolder,
  updateFolder,
  deleteFolder,
} from '../controllers/folder.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import {
  validateBody,
  validateQuery,
  validateParams,
  commonSchemas,
} from '../middleware/validation.middleware';
import { standardLimiter } from '../middleware/rateLimit.middleware';
import { z } from 'zod';

const router = Router();

/**
 * Validation Schemas
 */

const createFolderSchema = z.object({
  nameEncrypted: z.string().min(1, 'Encrypted folder name is required'),
  nameIv: z.string().min(1, 'Folder name IV is required'),
  parentFolderId: commonSchemas.folderId,
});

const listFoldersSchema = z.object({
  parentFolderId: z.string().optional(),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 100)),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'nameEncrypted'])
    .optional()
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

const folderIdSchema = z.object({
  id: z.string().uuid('Invalid folder ID'),
});

const updateFolderSchema = z.object({
  nameEncrypted: z.string().optional(),
  nameIv: z.string().optional(),
  parentFolderId: z.string().uuid().nullable().optional(),
});

const deleteFolderSchema = z.object({
  permanent: z.enum(['true', 'false']).optional().default('false'),
  cascade: z.enum(['true', 'false']).optional().default('false'),
});

/**
 * Routes
 */

/**
 * @route   POST /api/folders
 * @desc    Create a new folder
 * @access  Private
 */
router.post(
  '/',
  authenticateToken,
  standardLimiter,
  validateBody(createFolderSchema),
  createFolder
);

/**
 * @route   GET /api/folders
 * @desc    List user's folders
 * @access  Private
 */
router.get(
  '/',
  authenticateToken,
  standardLimiter,
  validateQuery(listFoldersSchema),
  listFolders
);

/**
 * @route   GET /api/folders/:id
 * @desc    Get folder details with contents
 * @access  Private
 */
router.get(
  '/:id',
  authenticateToken,
  standardLimiter,
  validateParams(folderIdSchema),
  getFolder
);

/**
 * @route   PUT /api/folders/:id
 * @desc    Update folder (rename or move)
 * @access  Private
 */
router.put(
  '/:id',
  authenticateToken,
  standardLimiter,
  validateParams(folderIdSchema),
  validateBody(updateFolderSchema),
  updateFolder
);

/**
 * @route   DELETE /api/folders/:id
 * @desc    Delete a folder (soft or permanent, with cascade option)
 * @access  Private
 */
router.delete(
  '/:id',
  authenticateToken,
  standardLimiter,
  validateParams(folderIdSchema),
  validateQuery(deleteFolderSchema),
  deleteFolder
);

export default router;
