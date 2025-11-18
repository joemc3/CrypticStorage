import { Router } from 'express';
import {
  createShare,
  getShare,
  downloadSharedFile,
  revokeShare,
  listShares,
} from '../controllers/share.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import {
  validateBody,
  validateQuery,
  validateParams,
  commonSchemas,
} from '../middleware/validation.middleware';
import { standardLimiter, publicShareLimiter } from '../middleware/rateLimit.middleware';
import { z } from 'zod';

const router = Router();

/**
 * Validation Schemas
 */

const createShareSchema = z.object({
  fileId: commonSchemas.fileId,
  fileKeyEncrypted: z.string().min(1, 'Encrypted file key is required'),
  password: z.string().min(4).max(128).optional(),
  expiresAt: z.string().datetime().optional(),
  maxDownloads: z.number().int().min(1).max(1000).optional(),
});

const shareTokenSchema = z.object({
  token: z.string().min(1, 'Share token is required'),
});

const getShareQuerySchema = z.object({
  password: z.string().optional(),
});

const shareIdSchema = z.object({
  id: z.string().uuid('Invalid share ID'),
});

const listSharesSchema = z.object({
  fileId: z.string().uuid().optional(),
  active: z.enum(['true', 'false', 'all']).optional().default('true'),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 50)),
  sortBy: z
    .enum(['createdAt', 'lastAccessed', 'downloadCount'])
    .optional()
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

/**
 * Authenticated Routes (User's own shares)
 */

/**
 * @route   POST /api/shares
 * @desc    Create a share link for a file
 * @access  Private
 */
router.post(
  '/',
  authenticateToken,
  standardLimiter,
  validateBody(createShareSchema),
  createShare
);

/**
 * @route   GET /api/shares
 * @desc    List user's shares
 * @access  Private
 */
router.get(
  '/',
  authenticateToken,
  standardLimiter,
  validateQuery(listSharesSchema),
  listShares
);

/**
 * @route   DELETE /api/shares/:id
 * @desc    Revoke a share link
 * @access  Private
 */
router.delete(
  '/:id',
  authenticateToken,
  standardLimiter,
  validateParams(shareIdSchema),
  revokeShare
);

/**
 * Public Routes (Accessing shared files)
 */

/**
 * @route   GET /api/shares/public/:token
 * @desc    Get share details (public endpoint)
 * @access  Public
 */
router.get(
  '/public/:token',
  publicShareLimiter, // Stricter rate limiting to prevent token brute force
  validateParams(shareTokenSchema),
  validateQuery(getShareQuerySchema),
  getShare
);

/**
 * @route   GET /api/shares/public/:token/download
 * @desc    Download shared file (public endpoint)
 * @access  Public
 */
router.get(
  '/public/:token/download',
  publicShareLimiter, // Stricter rate limiting to prevent token brute force
  validateParams(shareTokenSchema),
  validateQuery(getShareQuerySchema),
  downloadSharedFile
);

export default router;
