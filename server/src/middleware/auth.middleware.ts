import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Extend Express Request type to include user
export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    iat?: number;
    exp?: number;
  };
}

/**
 * JWT Authentication Middleware
 * Verifies JWT tokens from Authorization header and attaches user info to request
 */
export const authenticateToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'No token provided',
      });
      return;
    }

    // Get JWT secret from environment
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured');
    }

    // Verify token
    const decoded = jwt.verify(token, jwtSecret) as {
      userId: string;
      email: string;
      iat?: number;
      exp?: number;
    };

    // Attach user info to request
    req.user = decoded;

    next();
  } catch (error) {
    // Handle different JWT errors
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: 'Token expired',
        message: 'Your session has expired. Please login again.',
        code: 'TOKEN_EXPIRED',
      });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        error: 'Invalid token',
        message: 'The provided token is invalid.',
        code: 'INVALID_TOKEN',
      });
      return;
    }

    if (error instanceof jwt.NotBeforeError) {
      res.status(401).json({
        success: false,
        error: 'Token not active',
        message: 'The token is not yet valid.',
        code: 'TOKEN_NOT_ACTIVE',
      });
      return;
    }

    // Generic error
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
      message: 'An error occurred during authentication.',
    });
  }
};

/**
 * Optional Authentication Middleware
 * Attempts to authenticate but doesn't fail if no token is provided
 * Useful for endpoints that have different behavior for authenticated users
 */
export const optionalAuth = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      // No token provided, continue without user info
      next();
      return;
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured');
    }

    // Try to verify token
    const decoded = jwt.verify(token, jwtSecret) as {
      userId: string;
      email: string;
      iat?: number;
      exp?: number;
    };

    req.user = decoded;
    next();
  } catch (error) {
    // If token is invalid, continue without user info
    next();
  }
};

/**
 * Refresh Token Validator
 * Validates refresh tokens (typically with longer expiry)
 */
export const validateRefreshToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(401).json({
        success: false,
        error: 'Refresh token required',
        message: 'No refresh token provided',
      });
      return;
    }

    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
    if (!jwtRefreshSecret) {
      throw new Error('JWT_REFRESH_SECRET not configured');
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, jwtRefreshSecret) as {
      userId: string;
      email: string;
      type?: string;
    };

    // Ensure it's a refresh token
    if (decoded.type && decoded.type !== 'refresh') {
      res.status(401).json({
        success: false,
        error: 'Invalid token type',
        message: 'Provided token is not a refresh token',
      });
      return;
    }

    // Attach user info to request
    (req as AuthRequest).user = {
      userId: decoded.userId,
      email: decoded.email,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: 'Refresh token expired',
        message: 'Your refresh token has expired. Please login again.',
        code: 'REFRESH_TOKEN_EXPIRED',
      });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        error: 'Invalid refresh token',
        message: 'The provided refresh token is invalid.',
        code: 'INVALID_REFRESH_TOKEN',
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Refresh token validation failed',
      message: 'An error occurred during refresh token validation.',
    });
  }
};

/**
 * Generate JWT Access Token
 * Utility function to create access tokens
 */
export const generateAccessToken = (payload: {
  userId: string;
  email: string;
}): string => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET not configured');
  }

  return jwt.sign(payload, jwtSecret, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  });
};

/**
 * Generate JWT Refresh Token
 * Utility function to create refresh tokens
 */
export const generateRefreshToken = (payload: {
  userId: string;
  email: string;
}): string => {
  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  if (!jwtRefreshSecret) {
    throw new Error('JWT_REFRESH_SECRET not configured');
  }

  return jwt.sign(
    { ...payload, type: 'refresh' },
    jwtRefreshSecret,
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    }
  );
};
