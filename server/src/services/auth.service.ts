import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../config/database';
import { redis, setCache, getCache, deleteCache, deleteCachePattern } from '../config/redis';
import logger from '../utils/logger';
import {
  AuthError,
  ValidationError,
  NotFoundError,
  ConflictError,
  TokenError,
} from '../utils/errors';

/**
 * Authentication Service
 * Handles user registration, login, logout, session management, and 2FA
 */

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const SESSION_EXPIRES_IN = 7 * 24 * 60 * 60; // 7 days in seconds

// TOTP Configuration
const TOTP_WINDOW = 2; // Allow 2 time windows (±60 seconds)
const TOTP_STEP = 30; // 30 seconds per step

// Password Configuration
const SALT_ROUNDS = 12;

/**
 * Interface Definitions
 */
export interface RegisterData {
  email: string;
  username: string;
  password: string;
  masterKeyEncrypted: string;
  publicKey: string;
  privateKeyEncrypted: string;
  salt: string;
}

export interface LoginData {
  emailOrUsername: string;
  password: string;
  totpToken?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface SessionData {
  userId: string;
  sessionId: string;
  token: string;
  expiresAt: Date;
}

export interface TOTPSetupData {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

export interface VerifyTOTPData {
  userId: string;
  totpToken: string;
  totpSecretEncrypted: string;
}

/**
 * Hash a password using bcrypt
 */
export const hashPassword = async (password: string): Promise<string> => {
  try {
    logger.debug('Hashing password');
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    return hash;
  } catch (error) {
    logger.error('Failed to hash password', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new AuthError('Failed to hash password');
  }
};

/**
 * Verify a password against a hash
 */
export const verifyPassword = async (
  password: string,
  hash: string
): Promise<boolean> => {
  try {
    logger.debug('Verifying password');
    const isValid = await bcrypt.compare(password, hash);
    return isValid;
  } catch (error) {
    logger.error('Failed to verify password', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new AuthError('Failed to verify password');
  }
};

/**
 * Generate a JWT token
 */
export const generateToken = (userId: string, sessionId: string): string => {
  try {
    logger.debug('Generating JWT token', { userId, sessionId });
    const token = jwt.sign(
      {
        userId,
        sessionId,
        type: 'access',
      },
      JWT_SECRET,
      {
        expiresIn: JWT_EXPIRES_IN,
        issuer: 'crypticstorage',
        subject: userId,
      }
    );
    return token;
  } catch (error) {
    logger.error('Failed to generate token', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new TokenError('Failed to generate authentication token');
  }
};

/**
 * Verify and decode a JWT token
 */
export const verifyToken = (token: string): { userId: string; sessionId: string } => {
  try {
    logger.debug('Verifying JWT token');
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'crypticstorage',
    }) as any;

    if (!decoded.userId || !decoded.sessionId) {
      throw new TokenError('Invalid token payload');
    }

    return {
      userId: decoded.userId,
      sessionId: decoded.sessionId,
    };
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn('Invalid JWT token', { error: error.message });
      throw new TokenError('Invalid authentication token');
    }
    if (error instanceof jwt.TokenExpiredError) {
      logger.warn('Expired JWT token');
      throw new TokenError('Authentication token has expired');
    }
    logger.error('Failed to verify token', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new TokenError('Failed to verify authentication token');
  }
};

/**
 * Register a new user
 */
export const register = async (data: RegisterData): Promise<SessionData> => {
  try {
    logger.info('Registering new user', { email: data.email, username: data.username });

    // Validate input
    if (!data.email || !data.username || !data.password) {
      throw new ValidationError('Email, username, and password are required');
    }

    if (data.password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters long');
    }

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: data.email }, { username: data.username }],
      },
    });

    if (existingUser) {
      if (existingUser.email === data.email) {
        throw new ConflictError('Email already registered');
      }
      throw new ConflictError('Username already taken');
    }

    // Hash password
    const passwordHash = await hashPassword(data.password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: data.email,
        username: data.username,
        passwordHash,
        salt: data.salt,
        masterKeyEncrypted: data.masterKeyEncrypted,
        publicKey: data.publicKey,
        privateKeyEncrypted: data.privateKeyEncrypted,
      },
    });

    logger.info('User registered successfully', { userId: user.id, email: user.email });

    // Create initial session
    const sessionData = await createSession(user.id);

    return sessionData;
  } catch (error) {
    if (
      error instanceof ValidationError ||
      error instanceof ConflictError ||
      error instanceof AuthError
    ) {
      throw error;
    }
    logger.error('Failed to register user', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new AuthError('Failed to register user');
  }
};

/**
 * Login a user
 */
export const login = async (data: LoginData): Promise<SessionData> => {
  try {
    logger.info('User login attempt', { emailOrUsername: data.emailOrUsername });

    // Find user by email or username
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: data.emailOrUsername }, { username: data.emailOrUsername }],
        isActive: true,
      },
    });

    if (!user) {
      logger.warn('Login failed: User not found', {
        emailOrUsername: data.emailOrUsername,
      });
      throw new AuthError('Invalid credentials');
    }

    // Verify password
    const isValidPassword = await verifyPassword(data.password, user.passwordHash);

    if (!isValidPassword) {
      logger.warn('Login failed: Invalid password', { userId: user.id });
      throw new AuthError('Invalid credentials');
    }

    // Check if TOTP is enabled
    if (user.totpSecretEncrypted) {
      if (!data.totpToken) {
        throw new AuthError('Two-factor authentication code required', {
          requiresTOTP: true,
        });
      }

      // Verify TOTP token
      const isTOTPValid = await verifyTOTP({
        userId: user.id,
        totpToken: data.totpToken,
        totpSecretEncrypted: user.totpSecretEncrypted,
      });

      if (!isTOTPValid) {
        logger.warn('Login failed: Invalid TOTP token', { userId: user.id });
        throw new AuthError('Invalid two-factor authentication code');
      }
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    // Create session
    const sessionData = await createSession(
      user.id,
      data.ipAddress,
      data.userAgent
    );

    logger.info('User logged in successfully', { userId: user.id });

    return sessionData;
  } catch (error) {
    if (error instanceof AuthError || error instanceof ValidationError) {
      throw error;
    }
    logger.error('Failed to login user', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new AuthError('Failed to login');
  }
};

/**
 * Create a new session
 */
export const createSession = async (
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<SessionData> => {
  try {
    logger.debug('Creating session', { userId });

    const sessionId = uuidv4();
    const token = generateToken(userId, sessionId);
    const tokenHash = await hashPassword(token);
    const expiresAt = new Date(Date.now() + SESSION_EXPIRES_IN * 1000);

    // Create session in database
    const session = await prisma.session.create({
      data: {
        id: sessionId,
        userId,
        tokenHash,
        expiresAt,
        ipAddress,
        userAgent,
      },
    });

    // Cache session in Redis for faster lookups
    await setCache(`session:${sessionId}`, {
      userId,
      sessionId,
      expiresAt: session.expiresAt,
    }, SESSION_EXPIRES_IN);

    logger.info('Session created successfully', { userId, sessionId });

    return {
      userId,
      sessionId,
      token,
      expiresAt: session.expiresAt,
    };
  } catch (error) {
    logger.error('Failed to create session', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new AuthError('Failed to create session');
  }
};

/**
 * Validate a session
 */
export const validateSession = async (
  token: string
): Promise<{ userId: string; sessionId: string }> => {
  try {
    logger.debug('Validating session');

    // Verify JWT token
    const { userId, sessionId } = verifyToken(token);

    // Check cache first
    const cachedSession = await getCache<{ userId: string; sessionId: string; expiresAt: Date }>(
      `session:${sessionId}`
    );

    if (cachedSession) {
      logger.debug('Session found in cache', { sessionId });
      return { userId, sessionId };
    }

    // Check database
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      logger.warn('Session not found', { sessionId });
      throw new AuthError('Invalid session');
    }

    if (session.expiresAt < new Date()) {
      logger.warn('Session expired', { sessionId });
      await deleteSession(sessionId);
      throw new AuthError('Session has expired');
    }

    if (session.userId !== userId) {
      logger.warn('Session userId mismatch', { sessionId, expectedUserId: userId });
      throw new AuthError('Invalid session');
    }

    // Update session activity
    await updateSessionActivity(sessionId);

    // Cache session
    await setCache(`session:${sessionId}`, {
      userId,
      sessionId,
      expiresAt: session.expiresAt,
    }, SESSION_EXPIRES_IN);

    logger.debug('Session validated successfully', { sessionId });

    return { userId, sessionId };
  } catch (error) {
    if (error instanceof AuthError || error instanceof TokenError) {
      throw error;
    }
    logger.error('Failed to validate session', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new AuthError('Failed to validate session');
  }
};

/**
 * Update session activity timestamp
 */
export const updateSessionActivity = async (sessionId: string): Promise<void> => {
  try {
    await prisma.session.update({
      where: { id: sessionId },
      data: { lastActivity: new Date() },
    });
  } catch (error) {
    // Non-critical error, just log it
    logger.warn('Failed to update session activity', {
      sessionId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Logout (delete session)
 */
export const logout = async (sessionId: string): Promise<void> => {
  try {
    logger.info('Logging out user', { sessionId });
    await deleteSession(sessionId);
    logger.info('User logged out successfully', { sessionId });
  } catch (error) {
    logger.error('Failed to logout user', {
      sessionId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new AuthError('Failed to logout');
  }
};

/**
 * Delete a session
 */
export const deleteSession = async (sessionId: string): Promise<void> => {
  try {
    logger.debug('Deleting session', { sessionId });

    // Delete from database
    await prisma.session.delete({
      where: { id: sessionId },
    });

    // Delete from cache
    await deleteCache(`session:${sessionId}`);

    logger.debug('Session deleted successfully', { sessionId });
  } catch (error) {
    logger.error('Failed to delete session', {
      sessionId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new AuthError('Failed to delete session');
  }
};

/**
 * Delete all sessions for a user (logout from all devices)
 */
export const deleteAllUserSessions = async (userId: string): Promise<void> => {
  try {
    logger.info('Deleting all sessions for user', { userId });

    // Get all sessions
    const sessions = await prisma.session.findMany({
      where: { userId },
      select: { id: true },
    });

    // Delete from database
    await prisma.session.deleteMany({
      where: { userId },
    });

    // Delete from cache
    for (const session of sessions) {
      await deleteCache(`session:${session.id}`);
    }

    logger.info('All user sessions deleted', { userId, count: sessions.length });
  } catch (error) {
    logger.error('Failed to delete all user sessions', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new AuthError('Failed to delete all sessions');
  }
};

/**
 * Setup TOTP (2FA)
 */
export const setupTOTP = async (userId: string): Promise<TOTPSetupData> => {
  try {
    logger.info('Setting up TOTP for user', { userId });

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Generate TOTP secret
    const secret = speakeasy.generateSecret({
      name: `CrypticStorage (${user.email})`,
      issuer: 'CrypticStorage',
      length: 32,
    });

    // Generate QR code
    const qrCode = await qrcode.toDataURL(secret.otpauth_url!);

    // Generate backup codes
    const backupCodes = Array.from({ length: 8 }, () =>
      uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase()
    );

    logger.info('TOTP setup completed', { userId });

    return {
      secret: secret.base32,
      qrCode,
      backupCodes,
    };
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    logger.error('Failed to setup TOTP', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new AuthError('Failed to setup two-factor authentication');
  }
};

/**
 * Verify and enable TOTP
 */
export const enableTOTP = async (
  userId: string,
  totpToken: string,
  totpSecretEncrypted: string
): Promise<void> => {
  try {
    logger.info('Enabling TOTP for user', { userId });

    // Verify TOTP token
    const isValid = await verifyTOTP({ userId, totpToken, totpSecretEncrypted });

    if (!isValid) {
      throw new AuthError('Invalid verification code');
    }

    // Update user with encrypted TOTP secret
    await prisma.user.update({
      where: { id: userId },
      data: { totpSecretEncrypted },
    });

    logger.info('TOTP enabled successfully', { userId });
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    logger.error('Failed to enable TOTP', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new AuthError('Failed to enable two-factor authentication');
  }
};

/**
 * Disable TOTP
 */
export const disableTOTP = async (userId: string, password: string): Promise<void> => {
  try {
    logger.info('Disabling TOTP for user', { userId });

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.passwordHash);

    if (!isValidPassword) {
      throw new AuthError('Invalid password');
    }

    // Remove TOTP secret
    await prisma.user.update({
      where: { id: userId },
      data: { totpSecretEncrypted: null },
    });

    logger.info('TOTP disabled successfully', { userId });
  } catch (error) {
    if (error instanceof AuthError || error instanceof NotFoundError) {
      throw error;
    }
    logger.error('Failed to disable TOTP', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new AuthError('Failed to disable two-factor authentication');
  }
};

/**
 * Verify TOTP token
 * Note: This expects the totpSecretEncrypted to be decrypted by the client
 * before verification, or you need to decrypt it here with a server-side key
 */
export const verifyTOTP = async (data: VerifyTOTPData): Promise<boolean> => {
  try {
    logger.debug('Verifying TOTP token', { userId: data.userId });

    // Note: In a real implementation, you would decrypt the totpSecretEncrypted
    // using the user's master key or a server-side key
    // For this implementation, we assume the secret is passed in decrypted form
    // or you need to implement the decryption logic here

    const isValid = speakeasy.totp.verify({
      secret: data.totpSecretEncrypted, // This should be the decrypted secret
      encoding: 'base32',
      token: data.totpToken,
      window: TOTP_WINDOW,
      step: TOTP_STEP,
    });

    logger.debug('TOTP verification result', { userId: data.userId, isValid });

    return isValid;
  } catch (error) {
    logger.error('Failed to verify TOTP', {
      userId: data.userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
};

/**
 * Get user by ID
 */
export const getUserById = async (userId: string) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        storageQuota: true,
        storageUsed: true,
        createdAt: true,
        lastLogin: true,
        isActive: true,
        emailVerified: true,
        totpSecretEncrypted: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return {
      ...user,
      hasTOTP: !!user.totpSecretEncrypted,
      totpSecretEncrypted: undefined, // Don't expose the secret
    };
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    logger.error('Failed to get user', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new AuthError('Failed to get user');
  }
};

/**
 * Get all active sessions for a user
 */
export const getUserSessions = async (userId: string) => {
  try {
    const sessions = await prisma.session.findMany({
      where: {
        userId,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        lastActivity: 'desc',
      },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        lastActivity: true,
        expiresAt: true,
      },
    });

    return sessions;
  } catch (error) {
    logger.error('Failed to get user sessions', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new AuthError('Failed to get user sessions');
  }
};

/**
 * Change user password
 */
export const changePassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> => {
  try {
    logger.info('Changing password for user', { userId });

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Verify current password
    const isValidPassword = await verifyPassword(currentPassword, user.passwordHash);

    if (!isValidPassword) {
      throw new AuthError('Current password is incorrect');
    }

    // Validate new password
    if (newPassword.length < 8) {
      throw new ValidationError('New password must be at least 8 characters long');
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    // Delete all sessions except current one to force re-login
    // This is a security measure when password changes
    await deleteAllUserSessions(userId);

    logger.info('Password changed successfully', { userId });
  } catch (error) {
    if (
      error instanceof AuthError ||
      error instanceof NotFoundError ||
      error instanceof ValidationError
    ) {
      throw error;
    }
    logger.error('Failed to change password', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new AuthError('Failed to change password');
  }
};

// Export all functions as named exports
export default {
  register,
  login,
  logout,
  validateSession,
  createSession,
  deleteSession,
  deleteAllUserSessions,
  setupTOTP,
  enableTOTP,
  disableTOTP,
  verifyTOTP,
  getUserById,
  getUserSessions,
  changePassword,
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
};
