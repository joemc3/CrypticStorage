import { Router } from 'express';
import {
  getProfile,
  updateProfile,
  getStorageStats,
  getActivity,
} from '../controllers/user.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import {
  validateBody,
  validateQuery,
  commonSchemas,
} from '../middleware/validation.middleware';
import {
  standardLimiter,
  sensitiveOperationLimiter,
} from '../middleware/rateLimit.middleware';
import { z } from 'zod';

const router = Router();

/**
 * Validation Schemas
 */

const updateProfileSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must not exceed 30 characters')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Username can only contain letters, numbers, underscores, and hyphens'
    )
    .optional(),
  email: commonSchemas.email.optional(),
  currentPassword: z.string().optional(),
  newPassword: commonSchemas.password.optional(),
  publicKey: z.string().optional(),
  privateKeyEncrypted: z.string().optional(),
});

const activityQuerySchema = z.object({
  action: z.string().optional(),
  resourceType: z.string().optional(),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 50)),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

/**
 * Routes
 */

/**
 * @route   GET /api/users/profile
 * @desc    Get user profile
 * @access  Private
 */
router.get(
  '/profile',
  authenticateToken,
  standardLimiter,
  getProfile
);

/**
 * @route   PUT /api/users/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put(
  '/profile',
  authenticateToken,
  sensitiveOperationLimiter,
  validateBody(updateProfileSchema),
  updateProfile
);

/**
 * @route   GET /api/users/storage/stats
 * @desc    Get storage statistics
 * @access  Private
 */
router.get(
  '/storage/stats',
  authenticateToken,
  standardLimiter,
  getStorageStats
);

/**
 * @route   GET /api/users/activity
 * @desc    Get user activity log
 * @access  Private
 */
router.get(
  '/activity',
  authenticateToken,
  standardLimiter,
  validateQuery(activityQuerySchema),
  getActivity
);

export default router;
