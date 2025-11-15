import Redis, { RedisOptions } from 'ioredis';
import logger from '../utils/logger';
import { ExternalServiceError } from '../utils/errors';

/**
 * Redis Configuration
 */
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * Parse Redis URL to get connection options
 */
const parseRedisUrl = (url: string): RedisOptions => {
  try {
    const urlObj = new URL(url);
    return {
      host: urlObj.hostname,
      port: parseInt(urlObj.port) || 6379,
      password: urlObj.password || undefined,
      db: urlObj.pathname ? parseInt(urlObj.pathname.slice(1)) : 0,
    };
  } catch (error) {
    logger.warn('Invalid Redis URL, using defaults', { url });
    return {
      host: 'localhost',
      port: 6379,
    };
  }
};

/**
 * Redis connection options
 */
const redisOptions: RedisOptions = {
  ...parseRedisUrl(REDIS_URL),
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    logger.warn(`Redis connection retry attempt ${times}`, { delay });
    return delay;
  },
  reconnectOnError: (err) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      // Only reconnect when the error contains "READONLY"
      logger.warn('Redis reconnecting on READONLY error');
      return true;
    }
    return false;
  },
};

/**
 * Redis Client Manager
 */
class RedisClient {
  private static instance: Redis | null = null;
  private static isConnected: boolean = false;
  private static connectionPromise: Promise<void> | null = null;

  /**
   * Get Redis client instance (singleton pattern)
   */
  public static getInstance(): Redis {
    if (!RedisClient.instance) {
      RedisClient.instance = new Redis(redisOptions);
      RedisClient.setupEventHandlers();
    }
    return RedisClient.instance;
  }

  /**
   * Connect to Redis
   */
  public static async connect(): Promise<void> {
    // Return existing connection promise if already connecting
    if (RedisClient.connectionPromise) {
      return RedisClient.connectionPromise;
    }

    // Return immediately if already connected
    if (RedisClient.isConnected) {
      return;
    }

    RedisClient.connectionPromise = (async () => {
      try {
        const client = RedisClient.getInstance();

        logger.info('Connecting to Redis...');

        // Wait for ready event or timeout
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Redis connection timeout'));
          }, 10000);

          client.once('ready', () => {
            clearTimeout(timeout);
            resolve();
          });

          client.once('error', (err) => {
            clearTimeout(timeout);
            reject(err);
          });
        });

        RedisClient.isConnected = true;
        logger.info('Redis connected successfully');

        // Test the connection
        await RedisClient.testConnection();
      } catch (error) {
        RedisClient.isConnected = false;
        logger.error('Failed to connect to Redis', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw new ExternalServiceError(
          'Failed to connect to Redis',
          'redis',
          error instanceof Error ? { originalError: error.message } : undefined
        );
      } finally {
        RedisClient.connectionPromise = null;
      }
    })();

    return RedisClient.connectionPromise;
  }

  /**
   * Disconnect from Redis
   */
  public static async disconnect(): Promise<void> {
    if (RedisClient.instance && RedisClient.isConnected) {
      try {
        logger.info('Disconnecting from Redis...');
        await RedisClient.instance.quit();
        RedisClient.isConnected = false;
        RedisClient.instance = null;
        logger.info('Redis disconnected successfully');
      } catch (error) {
        logger.error('Error disconnecting from Redis', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw new ExternalServiceError(
          'Failed to disconnect from Redis',
          'redis',
          error instanceof Error ? { originalError: error.message } : undefined
        );
      }
    }
  }

  /**
   * Test Redis connection
   */
  public static async testConnection(): Promise<void> {
    try {
      const client = RedisClient.getInstance();
      const response = await client.ping();
      if (response !== 'PONG') {
        throw new Error('Invalid ping response');
      }
      logger.debug('Redis connection test successful');
    } catch (error) {
      logger.error('Redis connection test failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new ExternalServiceError(
        'Redis connection test failed',
        'redis',
        error instanceof Error ? { originalError: error.message } : undefined
      );
    }
  }

  /**
   * Check if Redis is connected
   */
  public static isHealthy(): boolean {
    return RedisClient.isConnected && RedisClient.instance?.status === 'ready';
  }

  /**
   * Setup event handlers
   */
  private static setupEventHandlers(): void {
    const client = RedisClient.getInstance();

    client.on('connect', () => {
      logger.info('Redis client connecting...');
    });

    client.on('ready', () => {
      RedisClient.isConnected = true;
      logger.info('Redis client ready');
    });

    client.on('error', (err) => {
      logger.error('Redis client error', {
        error: err.message,
      });
    });

    client.on('close', () => {
      RedisClient.isConnected = false;
      logger.warn('Redis connection closed');
    });

    client.on('reconnecting', (delay: number) => {
      logger.info('Redis client reconnecting...', { delay });
    });

    client.on('end', () => {
      RedisClient.isConnected = false;
      logger.warn('Redis connection ended');
    });
  }

  /**
   * Get Redis server info
   */
  public static async getInfo(): Promise<Record<string, string>> {
    try {
      const client = RedisClient.getInstance();
      const info = await client.info();
      const lines = info.split('\r\n');
      const result: Record<string, string> = {};

      for (const line of lines) {
        if (line && !line.startsWith('#')) {
          const [key, value] = line.split(':');
          if (key && value) {
            result[key.trim()] = value.trim();
          }
        }
      }

      return result;
    } catch (error) {
      logger.error('Failed to get Redis info', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new ExternalServiceError(
        'Failed to get Redis info',
        'redis',
        error instanceof Error ? { originalError: error.message } : undefined
      );
    }
  }
}

/**
 * Cache Helper Functions
 */

/**
 * Set a value in cache with optional TTL
 */
export const setCache = async (
  key: string,
  value: any,
  ttlSeconds?: number
): Promise<void> => {
  try {
    const client = RedisClient.getInstance();
    const serialized = JSON.stringify(value);

    if (ttlSeconds) {
      await client.setex(key, ttlSeconds, serialized);
    } else {
      await client.set(key, serialized);
    }

    logger.debug('Cache set', { key, ttl: ttlSeconds });
  } catch (error) {
    logger.error('Failed to set cache', {
      key,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ExternalServiceError(
      'Failed to set cache value',
      'redis',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Get a value from cache
 */
export const getCache = async <T = any>(key: string): Promise<T | null> => {
  try {
    const client = RedisClient.getInstance();
    const value = await client.get(key);

    if (!value) {
      logger.debug('Cache miss', { key });
      return null;
    }

    logger.debug('Cache hit', { key });
    return JSON.parse(value) as T;
  } catch (error) {
    logger.error('Failed to get cache', {
      key,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ExternalServiceError(
      'Failed to get cache value',
      'redis',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Delete a value from cache
 */
export const deleteCache = async (key: string): Promise<void> => {
  try {
    const client = RedisClient.getInstance();
    await client.del(key);
    logger.debug('Cache deleted', { key });
  } catch (error) {
    logger.error('Failed to delete cache', {
      key,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ExternalServiceError(
      'Failed to delete cache value',
      'redis',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Delete multiple cache keys by pattern
 */
export const deleteCachePattern = async (pattern: string): Promise<number> => {
  try {
    const client = RedisClient.getInstance();
    const keys = await client.keys(pattern);

    if (keys.length === 0) {
      return 0;
    }

    const deleted = await client.del(...keys);
    logger.debug('Cache pattern deleted', { pattern, count: deleted });
    return deleted;
  } catch (error) {
    logger.error('Failed to delete cache pattern', {
      pattern,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ExternalServiceError(
      'Failed to delete cache pattern',
      'redis',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Check if a key exists in cache
 */
export const cacheExists = async (key: string): Promise<boolean> => {
  try {
    const client = RedisClient.getInstance();
    const exists = await client.exists(key);
    return exists === 1;
  } catch (error) {
    logger.error('Failed to check cache existence', {
      key,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ExternalServiceError(
      'Failed to check cache existence',
      'redis',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Set cache with NX flag (only if not exists)
 */
export const setCacheNX = async (
  key: string,
  value: any,
  ttlSeconds?: number
): Promise<boolean> => {
  try {
    const client = RedisClient.getInstance();
    const serialized = JSON.stringify(value);

    let result: string | null;
    if (ttlSeconds) {
      result = await client.set(key, serialized, 'EX', ttlSeconds, 'NX');
    } else {
      result = await client.set(key, serialized, 'NX');
    }

    const success = result === 'OK';
    logger.debug('Cache set NX', { key, success, ttl: ttlSeconds });
    return success;
  } catch (error) {
    logger.error('Failed to set cache NX', {
      key,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ExternalServiceError(
      'Failed to set cache value with NX',
      'redis',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Increment a counter in cache
 */
export const incrementCache = async (key: string, amount: number = 1): Promise<number> => {
  try {
    const client = RedisClient.getInstance();
    const result = await client.incrby(key, amount);
    logger.debug('Cache incremented', { key, amount, result });
    return result;
  } catch (error) {
    logger.error('Failed to increment cache', {
      key,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ExternalServiceError(
      'Failed to increment cache value',
      'redis',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Get TTL of a key
 */
export const getCacheTTL = async (key: string): Promise<number> => {
  try {
    const client = RedisClient.getInstance();
    const ttl = await client.ttl(key);
    return ttl;
  } catch (error) {
    logger.error('Failed to get cache TTL', {
      key,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ExternalServiceError(
      'Failed to get cache TTL',
      'redis',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

// Export the Redis client instance
export const redis = RedisClient.getInstance();

// Export Redis management functions
export const {
  connect: connectRedis,
  disconnect: disconnectRedis,
  testConnection: testRedisConnection,
  isHealthy: isRedisHealthy,
  getInfo: getRedisInfo,
} = RedisClient;

// Export default
export default RedisClient;
