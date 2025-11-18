import { Router } from 'express';
import {
  uploadFile,
  listFiles,
  getFile,
  downloadFile,
  updateFile,
  deleteFile,
  getFileVersions,
  restoreFileVersion,
} from '../controllers/file.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import {
  validateBody,
  validateQuery,
  validateParams,
  commonSchemas,
} from '../middleware/validation.middleware';
import {
  fileLimiter,
  uploadLimiter,
} from '../middleware/rateLimit.middleware';
import { uploadSingleFile } from '../middleware/upload.middleware';
import { z } from 'zod';

const router = Router();

/**
 * Validation Schemas
 */

const uploadFileSchema = z.object({
  filenameEncrypted: z.string().min(1, 'Encrypted filename is required'),
  filenameIv: z.string().min(1, 'Filename IV is required'),
  fileKeyEncrypted: z.string().min(1, 'Encrypted file key is required'),
  parentFolderId: commonSchemas.folderId,
  mimeType: z.string().optional(),
});

const listFilesSchema = z.object({
  parentFolderId: z.string().optional(),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 50)),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'fileSize', 'filenameEncrypted'])
    .optional()
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

const fileIdSchema = z.object({
  id: commonSchemas.fileId,
});

const updateFileSchema = z.object({
  filenameEncrypted: z.string().optional(),
  filenameIv: z.string().optional(),
  parentFolderId: z.string().uuid().nullable().optional(),
  newVersion: z.boolean().optional(),
});

const deleteFileSchema = z.object({
  permanent: z.enum(['true', 'false']).optional().default('false'),
});

const versionParamsSchema = z.object({
  id: commonSchemas.fileId,
  versionNumber: z.string().regex(/^\d+$/, 'Version number must be a number'),
});

/**
 * Routes
 */

/**
 * @route   POST /api/files
 * @desc    Upload a new file
 * @access  Private
 */
router.post(
  '/',
  authenticateToken,
  uploadLimiter,
  uploadSingleFile,
  validateBody(uploadFileSchema),
  uploadFile
);

/**
 * @route   GET /api/files
 * @desc    List user's files
 * @access  Private
 */
router.get(
  '/',
  authenticateToken,
  fileLimiter,
  validateQuery(listFilesSchema),
  listFiles
);

/**
 * @route   GET /api/files/:id
 * @desc    Get file details
 * @access  Private
 */
router.get(
  '/:id',
  authenticateToken,
  fileLimiter,
  validateParams(fileIdSchema),
  getFile
);

/**
 * @route   GET /api/files/:id/download
 * @desc    Download a file
 * @access  Private
 */
router.get(
  '/:id/download',
  authenticateToken,
  fileLimiter,
  validateParams(fileIdSchema),
  downloadFile
);

/**
 * @route   PUT /api/files/:id
 * @desc    Update file metadata
 * @access  Private
 */
router.put(
  '/:id',
  authenticateToken,
  fileLimiter,
  validateParams(fileIdSchema),
  validateBody(updateFileSchema),
  updateFile
);

/**
 * @route   DELETE /api/files/:id
 * @desc    Delete a file (soft or permanent)
 * @access  Private
 */
router.delete(
  '/:id',
  authenticateToken,
  fileLimiter,
  validateParams(fileIdSchema),
  validateQuery(deleteFileSchema),
  deleteFile
);

/**
 * @route   GET /api/files/:id/versions
 * @desc    Get all versions of a file
 * @access  Private
 */
router.get(
  '/:id/versions',
  authenticateToken,
  fileLimiter,
  validateParams(fileIdSchema),
  getFileVersions
);

/**
 * @route   POST /api/files/:id/versions/:versionNumber/restore
 * @desc    Restore a file to a specific version
 * @access  Private
 */
router.post(
  '/:id/versions/:versionNumber/restore',
  authenticateToken,
  fileLimiter,
  validateParams(versionParamsSchema),
  restoreFileVersion
);

export default router;
