import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import {
  BadRequestError,
  UnauthorizedError,
  ConflictError,
} from '../middleware/error.middleware';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import {
  generateAccessToken,
  generateRefreshToken,
} from '../middleware/auth.middleware';

const prisma = new PrismaClient();

/**
 * Register a new user
 * POST /api/auth/register
 */
export const register = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const {
      email,
      username,
      password,
      masterKey,
      publicKey,
      privateKeyEncrypted,
    } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      if (existingUser.email === email) {
        throw new ConflictError('Email already registered');
      }
      throw new ConflictError('Username already taken');
    }

    // Generate salt and hash password
    const salt = bcrypt.genSaltSync(12);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user
    const user = await prisma.user.create({
      data: {
        id: uuidv4(),
        email,
        username,
        passwordHash,
        salt,
        masterKeyEncrypted: masterKey,
        publicKey,
        privateKeyEncrypted,
        storageQuota: BigInt(10737418240), // 10GB default
        storageUsed: BigInt(0),
      },
    });

    // Generate tokens
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
    });
    const refreshToken = generateRefreshToken({
      userId: user.id,
      email: user.email,
    });

    // Create session
    const tokenHash = await bcrypt.hash(refreshToken, 10);
    await prisma.session.create({
      data: {
        id: uuidv4(),
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        userId: user.id,
        action: 'USER_REGISTERED',
        resourceType: 'User',
        resourceId: user.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        success: true,
      },
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          storageQuota: user.storageQuota.toString(),
          storageUsed: user.storageUsed.toString(),
        },
        accessToken,
        refreshToken,
      },
    });
  }
);

/**
 * Login user
 * POST /api/auth/login
 */
export const login = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { email, password } = req.body;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      // Log failed login attempt
      await prisma.auditLog.create({
        data: {
          id: uuidv4(),
          userId: user.id,
          action: 'LOGIN_FAILED',
          resourceType: 'User',
          resourceId: user.id,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          success: false,
          errorMessage: 'Invalid password',
        },
      });

      throw new UnauthorizedError('Invalid email or password');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new UnauthorizedError('Account is deactivated');
    }

    // Check if 2FA is enabled
    if (user.totpSecretEncrypted) {
      res.json({
        success: true,
        message: '2FA required',
        data: {
          requiresTwoFactor: true,
          userId: user.id,
        },
      });
      return;
    }

    // Generate tokens
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
    });
    const refreshToken = generateRefreshToken({
      userId: user.id,
      email: user.email,
    });

    // Create session
    const tokenHash = await bcrypt.hash(refreshToken, 10);
    await prisma.session.create({
      data: {
        id: uuidv4(),
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    // Log successful login
    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        userId: user.id,
        action: 'USER_LOGIN',
        resourceType: 'User',
        resourceId: user.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        success: true,
      },
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          storageQuota: user.storageQuota.toString(),
          storageUsed: user.storageUsed.toString(),
          masterKeyEncrypted: user.masterKeyEncrypted,
          publicKey: user.publicKey,
          privateKeyEncrypted: user.privateKeyEncrypted,
        },
        accessToken,
        refreshToken,
      },
    });
  }
);

/**
 * Logout user
 * POST /api/auth/logout
 */
export const logout = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { refreshToken } = req.body;

    if (refreshToken) {
      // Find and delete session
      const sessions = await prisma.session.findMany({
        where: { userId: req.user!.userId },
      });

      for (const session of sessions) {
        const isMatch = await bcrypt.compare(refreshToken, session.tokenHash);
        if (isMatch) {
          await prisma.session.delete({
            where: { id: session.id },
          });
          break;
        }
      }
    }

    // Log logout
    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        userId: req.user!.userId,
        action: 'USER_LOGOUT',
        resourceType: 'User',
        resourceId: req.user!.userId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        success: true,
      },
    });

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  }
);

/**
 * Refresh access token
 * POST /api/auth/refresh
 */
export const refreshToken = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;

    // Find user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedError('User not found or inactive');
    }

    // Generate new access token
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
    });

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        accessToken,
      },
    });
  }
);

/**
 * Enable 2FA
 * POST /api/auth/2fa/enable
 */
export const enable2FA = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;

    // Find user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    // Check if 2FA is already enabled
    if (user.totpSecretEncrypted) {
      throw new BadRequestError('2FA is already enabled');
    }

    // Generate TOTP secret
    const secret = speakeasy.generateSecret({
      name: `CrypticStorage (${user.email})`,
      length: 32,
    });

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

    // For now, store the secret (in production, this should be encrypted)
    // The frontend should send back a verification code before we permanently save it
    res.json({
      success: true,
      message: '2FA setup initiated',
      data: {
        secret: secret.base32,
        qrCode: qrCodeUrl,
        otpAuthUrl: secret.otpauth_url,
      },
    });
  }
);

/**
 * Verify and activate 2FA
 * POST /api/auth/2fa/verify
 */
export const verify2FA = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    const { token, secret } = req.body;

    if (!token || !secret) {
      throw new BadRequestError('Token and secret are required');
    }

    // Verify the TOTP token
    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2, // Allow 2 time steps before/after for clock skew
    });

    if (!verified) {
      throw new BadRequestError('Invalid verification code');
    }

    // Save the encrypted secret (in production, encrypt this with user's master key)
    await prisma.user.update({
      where: { id: userId },
      data: {
        totpSecretEncrypted: secret, // Should be encrypted in production
      },
    });

    // Log 2FA enabled
    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        userId,
        action: '2FA_ENABLED',
        resourceType: 'User',
        resourceId: userId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        success: true,
      },
    });

    res.json({
      success: true,
      message: '2FA enabled successfully',
    });
  }
);

/**
 * Disable 2FA
 * POST /api/auth/2fa/disable
 */
export const disable2FA = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    const { password, token } = req.body;

    if (!password || !token) {
      throw new BadRequestError('Password and 2FA token are required');
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid password');
    }

    // Check if 2FA is enabled
    if (!user.totpSecretEncrypted) {
      throw new BadRequestError('2FA is not enabled');
    }

    // Verify the TOTP token
    const verified = speakeasy.totp.verify({
      secret: user.totpSecretEncrypted, // Should be decrypted in production
      encoding: 'base32',
      token,
      window: 2,
    });

    if (!verified) {
      throw new BadRequestError('Invalid 2FA token');
    }

    // Disable 2FA
    await prisma.user.update({
      where: { id: userId },
      data: {
        totpSecretEncrypted: null,
      },
    });

    // Log 2FA disabled
    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        userId,
        action: '2FA_DISABLED',
        resourceType: 'User',
        resourceId: userId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        success: true,
      },
    });

    res.json({
      success: true,
      message: '2FA disabled successfully',
    });
  }
);
