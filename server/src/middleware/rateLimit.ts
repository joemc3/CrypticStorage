import rateLimit from 'express-rate-limit';
import { isTest } from '../config/env';

const common = {
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { success: false, message: 'Too many requests, please slow down', code: 'RATE_LIMITED' },
};

/** General API budget per IP. */
export const apiLimiter = rateLimit({ ...common, windowMs: 15 * 60 * 1000, limit: 1000 });

/** Credential endpoints: login, register, 2FA verification, password change. */
export const authLimiter = rateLimit({ ...common, windowMs: 15 * 60 * 1000, limit: 20 });

/** Public share access, keyed by IP. */
export const publicShareLimiter = rateLimit({ ...common, windowMs: 15 * 60 * 1000, limit: 100 });
