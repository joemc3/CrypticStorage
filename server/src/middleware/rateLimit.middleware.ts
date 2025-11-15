import rateLimit from 'express-rate-limit';
import Redis from 'ioredis';

// Initialize Redis client for rate limiting
let redisClient: Redis | null = null;

/**
 * Initialize Redis connection for rate limiting
 */
const initializeRedis = (): Redis => {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    redisClient.on('error', (err) => {
      console.error('Redis rate limiter error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Redis rate limiter connected');
    });
  }

  return redisClient;
};

/**
 * Custom Redis store for express-rate-limit
 */
class RedisStore {
  private client: Redis;
  private prefix: string;

  constructor(prefix = 'rl:') {
    this.client = initializeRedis();
    this.prefix = prefix;
  }

  async increment(key: string): Promise<{ totalHits: number; resetTime: Date }> {
    const redisKey = `${this.prefix}${key}`;

    try {
      // Connect if not already connected
      if (this.client.status !== 'ready') {
        await this.client.connect();
      }

      // Increment counter
      const hits = await this.client.incr(redisKey);

      // Set expiry on first hit
      if (hits === 1) {
        const windowMs = 60000; // 1 minute default
        await this.client.pexpire(redisKey, windowMs);
      }

      // Get TTL to calculate reset time
      const ttl = await this.client.pttl(redisKey);
      const resetTime = new Date(Date.now() + ttl);

      return {
        totalHits: hits,
        resetTime,
      };
    } catch (error) {
      console.error('Redis store increment error:', error);
      // Fallback to allowing the request if Redis fails
      return {
        totalHits: 1,
        resetTime: new Date(Date.now() + 60000),
      };
    }
  }

  async decrement(key: string): Promise<void> {
    const redisKey = `${this.prefix}${key}`;

    try {
      if (this.client.status === 'ready') {
        await this.client.decr(redisKey);
      }
    } catch (error) {
      console.error('Redis store decrement error:', error);
    }
  }

  async resetKey(key: string): Promise<void> {
    const redisKey = `${this.prefix}${key}`;

    try {
      if (this.client.status === 'ready') {
        await this.client.del(redisKey);
      }
    } catch (error) {
      console.error('Redis store reset error:', error);
    }
  }
}

/**
 * Standard rate limiter for general API endpoints
 * 100 requests per 15 minutes
 */
export const standardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests',
    message: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Use Redis store if available, fallback to memory store
  store: process.env.REDIS_URL ? new RedisStore('rl:standard:') as any : undefined,
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise IP
    const user = (req as any).user;
    return user ? `user:${user.userId}` : req.ip || 'unknown';
  },
});

/**
 * Strict rate limiter for authentication endpoints
 * 5 requests per 15 minutes (prevents brute force attacks)
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    success: false,
    error: 'Too many authentication attempts',
    message: 'Too many login attempts from this IP, please try again later.',
    retryAfter: '15 minutes',
    code: 'AUTH_RATE_LIMIT',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all requests
  store: process.env.REDIS_URL ? new RedisStore('rl:auth:') as any : undefined,
  keyGenerator: (req) => {
    // Use IP for auth endpoints to prevent credential stuffing
    return req.ip || 'unknown';
  },
});

/**
 * Relaxed rate limiter for file operations
 * 50 requests per 15 minutes (larger files take longer)
 */
export const fileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 requests per windowMs
  message: {
    success: false,
    error: 'Too many file operations',
    message: 'Too many file operations from this IP, please try again later.',
    retryAfter: '15 minutes',
    code: 'FILE_RATE_LIMIT',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: process.env.REDIS_URL ? new RedisStore('rl:file:') as any : undefined,
  keyGenerator: (req) => {
    // Use user ID for file operations
    const user = (req as any).user;
    return user ? `user:${user.userId}` : req.ip || 'unknown';
  },
});

/**
 * Upload rate limiter for file uploads
 * 20 uploads per hour
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each user to 20 uploads per hour
  message: {
    success: false,
    error: 'Too many uploads',
    message: 'Upload limit exceeded. Please try again later.',
    retryAfter: '1 hour',
    code: 'UPLOAD_RATE_LIMIT',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: process.env.REDIS_URL ? new RedisStore('rl:upload:') as any : undefined,
  keyGenerator: (req) => {
    const user = (req as any).user;
    return user ? `user:${user.userId}` : req.ip || 'unknown';
  },
});

/**
 * Very strict rate limiter for password reset/sensitive operations
 * 3 requests per hour
 */
export const sensitiveOperationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 requests per hour
  message: {
    success: false,
    error: 'Too many requests',
    message: 'Too many sensitive operation requests. Please try again later.',
    retryAfter: '1 hour',
    code: 'SENSITIVE_RATE_LIMIT',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: process.env.REDIS_URL ? new RedisStore('rl:sensitive:') as any : undefined,
  keyGenerator: (req) => {
    return req.ip || 'unknown';
  },
});

/**
 * API key rate limiter for API integrations
 * 1000 requests per hour
 */
export const apiKeyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000, // Limit each API key to 1000 requests per hour
  message: {
    success: false,
    error: 'API rate limit exceeded',
    message: 'API rate limit exceeded. Please try again later.',
    retryAfter: '1 hour',
    code: 'API_RATE_LIMIT',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: process.env.REDIS_URL ? new RedisStore('rl:apikey:') as any : undefined,
  keyGenerator: (req) => {
    const apiKey = req.headers['x-api-key'] as string;
    return apiKey || req.ip || 'unknown';
  },
});

/**
 * Cleanup Redis connection on shutdown
 */
export const closeRateLimitRedis = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
};
