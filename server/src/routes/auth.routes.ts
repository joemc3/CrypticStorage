import { Router } from 'express';
import {
  register,
  login,
  logout,
  refreshToken,
  enable2FA,
  verify2FA,
  disable2FA,
} from '../controllers/auth.controller';
import {
  authenticateToken,
  validateRefreshToken,
} from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validation.middleware';
import { authLimiter, sensitiveOperationLimiter } from '../middleware/rateLimit.middleware';
import { z } from 'zod';
import { commonSchemas } from '../middleware/validation.middleware';

const router = Router();

/**
 * Validation Schemas
 */

const registerSchema = z.object({
  email: commonSchemas.email,
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must not exceed 30 characters')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Username can only contain letters, numbers, underscores, and hyphens'
    ),
  password: commonSchemas.password,
  masterKey: z.string().min(1, 'Master key is required'),
  publicKey: z.string().min(1, 'Public key is required'),
  privateKeyEncrypted: z.string().min(1, 'Encrypted private key is required'),
});

const loginSchema = z.object({
  email: commonSchemas.email,
  password: z.string().min(1, 'Password is required'),
});

const logoutSchema = z.object({
  refreshToken: z.string().optional(),
});

const enable2FASchema = z.object({
  // No body required for initiating 2FA setup
});

const verify2FASchema = z.object({
  token: commonSchemas.totpCode,
  secret: z.string().min(1, 'Secret is required'),
});

const disable2FASchema = z.object({
  password: z.string().min(1, 'Password is required'),
  token: commonSchemas.totpCode,
});

/**
 * Routes
 */

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post(
  '/register',
  authLimiter,
  validateBody(registerSchema),
  register
);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post(
  '/login',
  authLimiter,
  validateBody(loginSchema),
  login
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user and invalidate refresh token
 * @access  Private
 */
router.post(
  '/logout',
  authenticateToken,
  validateBody(logoutSchema),
  logout
);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token using refresh token
 * @access  Public (requires valid refresh token)
 */
router.post(
  '/refresh',
  validateRefreshToken,
  refreshToken
);

/**
 * @route   POST /api/auth/2fa/enable
 * @desc    Initiate 2FA setup and get QR code
 * @access  Private
 */
router.post(
  '/2fa/enable',
  authenticateToken,
  sensitiveOperationLimiter,
  enable2FA
);

/**
 * @route   POST /api/auth/2fa/verify
 * @desc    Verify and activate 2FA
 * @access  Private
 */
router.post(
  '/2fa/verify',
  authenticateToken,
  sensitiveOperationLimiter,
  validateBody(verify2FASchema),
  verify2FA
);

/**
 * @route   POST /api/auth/2fa/disable
 * @desc    Disable 2FA
 * @access  Private
 */
router.post(
  '/2fa/disable',
  authenticateToken,
  sensitiveOperationLimiter,
  validateBody(disable2FASchema),
  disable2FA
);

export default router;
