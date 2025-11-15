import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import { DatabaseError } from '../utils/errors';

/**
 * Prisma Client Options Configuration
 */
const prismaOptions: any = {
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'event',
      level: 'error',
    },
    {
      emit: 'event',
      level: 'info',
    },
    {
      emit: 'event',
      level: 'warn',
    },
  ],
  errorFormat: process.env.NODE_ENV === 'development' ? 'colorless' : 'minimal',
};

/**
 * Singleton Prisma Client instance
 * Ensures only one instance is created and reused across the application
 */
class Database {
  private static instance: PrismaClient | null = null;
  private static isConnected: boolean = false;
  private static connectionPromise: Promise<void> | null = null;

  /**
   * Get Prisma Client instance (singleton pattern)
   */
  public static getInstance(): PrismaClient {
    if (!Database.instance) {
      Database.instance = new PrismaClient(prismaOptions);
      Database.setupLogging();
      Database.setupErrorHandling();
    }
    return Database.instance;
  }

  /**
   * Connect to the database
   */
  public static async connect(): Promise<void> {
    // Return existing connection promise if already connecting
    if (Database.connectionPromise) {
      return Database.connectionPromise;
    }

    // Return immediately if already connected
    if (Database.isConnected) {
      return;
    }

    Database.connectionPromise = (async () => {
      try {
        const client = Database.getInstance();

        logger.info('Connecting to database...');
        await client.$connect();

        Database.isConnected = true;
        logger.info('Database connected successfully');

        // Test the connection
        await Database.testConnection();
      } catch (error) {
        Database.isConnected = false;
        logger.error('Failed to connect to database', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw new DatabaseError(
          'Failed to connect to database',
          error instanceof Error ? { originalError: error.message } : undefined
        );
      } finally {
        Database.connectionPromise = null;
      }
    })();

    return Database.connectionPromise;
  }

  /**
   * Disconnect from the database
   */
  public static async disconnect(): Promise<void> {
    if (Database.instance && Database.isConnected) {
      try {
        logger.info('Disconnecting from database...');
        await Database.instance.$disconnect();
        Database.isConnected = false;
        logger.info('Database disconnected successfully');
      } catch (error) {
        logger.error('Error disconnecting from database', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw new DatabaseError(
          'Failed to disconnect from database',
          error instanceof Error ? { originalError: error.message } : undefined
        );
      }
    }
  }

  /**
   * Test database connection
   */
  public static async testConnection(): Promise<void> {
    try {
      const client = Database.getInstance();
      await client.$queryRaw`SELECT 1`;
      logger.debug('Database connection test successful');
    } catch (error) {
      logger.error('Database connection test failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new DatabaseError(
        'Database connection test failed',
        error instanceof Error ? { originalError: error.message } : undefined
      );
    }
  }

  /**
   * Check if database is connected
   */
  public static isHealthy(): boolean {
    return Database.isConnected;
  }

  /**
   * Setup Prisma logging
   */
  private static setupLogging(): void {
    const client = Database.getInstance();

    // Log queries in development
    if (process.env.NODE_ENV === 'development') {
      client.$on('query' as never, (e: any) => {
        logger.debug('Database Query', {
          query: e.query,
          params: e.params,
          duration: `${e.duration}ms`,
        });
      });
    }

    // Log errors
    client.$on('error' as never, (e: any) => {
      logger.error('Database Error', {
        message: e.message,
        target: e.target,
      });
    });

    // Log warnings
    client.$on('warn' as never, (e: any) => {
      logger.warn('Database Warning', {
        message: e.message,
      });
    });

    // Log info
    client.$on('info' as never, (e: any) => {
      logger.info('Database Info', {
        message: e.message,
      });
    });
  }

  /**
   * Setup error handling
   */
  private static setupErrorHandling(): void {
    const client = Database.getInstance();

    // Handle connection errors
    client.$use(async (params, next) => {
      const before = Date.now();

      try {
        const result = await next(params);
        const after = Date.now();

        // Log slow queries (>1000ms)
        if (after - before > 1000) {
          logger.warn('Slow Database Query Detected', {
            model: params.model,
            action: params.action,
            duration: `${after - before}ms`,
          });
        }

        return result;
      } catch (error) {
        const after = Date.now();

        logger.error('Database Query Failed', {
          model: params.model,
          action: params.action,
          duration: `${after - before}ms`,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        // Transform Prisma errors to custom errors
        throw Database.transformPrismaError(error);
      }
    });
  }

  /**
   * Transform Prisma errors to custom application errors
   */
  private static transformPrismaError(error: any): Error {
    // Check for Prisma Client errors
    if (error.code) {
      switch (error.code) {
        case 'P2002':
          // Unique constraint violation
          return new DatabaseError('A record with this value already exists', {
            code: error.code,
            target: error.meta?.target,
          });

        case 'P2025':
          // Record not found
          return new DatabaseError('Record not found', {
            code: error.code,
          });

        case 'P2003':
          // Foreign key constraint failed
          return new DatabaseError('Related record not found', {
            code: error.code,
            field: error.meta?.field_name,
          });

        case 'P2014':
          // Required relation violation
          return new DatabaseError('Invalid relation', {
            code: error.code,
            relation: error.meta?.relation_name,
          });

        case 'P2016':
          // Query interpretation error
          return new DatabaseError('Invalid query parameters', {
            code: error.code,
          });

        case 'P2021':
          // Table does not exist
          return new DatabaseError('Database table does not exist', {
            code: error.code,
            table: error.meta?.table,
          });

        case 'P2024':
          // Connection timeout
          return new DatabaseError('Database connection timeout', {
            code: error.code,
          });

        default:
          return new DatabaseError(error.message || 'Database operation failed', {
            code: error.code,
          });
      }
    }

    // Return original error if not a Prisma error
    return error instanceof Error ? error : new Error('Unknown database error');
  }

  /**
   * Execute a transaction with retry logic
   */
  public static async transaction<T>(
    fn: (tx: PrismaClient) => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    const client = Database.getInstance();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await client.$transaction(async (tx) => {
          return await fn(tx as PrismaClient);
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Transaction failed');

        // Check if error is retryable
        const isRetryable = Database.isRetryableError(error);

        if (!isRetryable || attempt === maxRetries) {
          throw Database.transformPrismaError(error);
        }

        // Wait before retrying (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        logger.warn(`Transaction failed, retrying in ${delay}ms...`, {
          attempt,
          maxRetries,
          error: lastError.message,
        });

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new DatabaseError('Transaction failed after retries');
  }

  /**
   * Check if error is retryable
   */
  private static isRetryableError(error: any): boolean {
    const retryableCodes = [
      'P2024', // Connection timeout
      'P2034', // Transaction conflict
    ];

    return error.code && retryableCodes.includes(error.code);
  }

  /**
   * Get database metrics
   */
  public static async getMetrics() {
    const client = Database.getInstance();

    try {
      const result = await client.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM "User"
      `;

      return {
        isConnected: Database.isConnected,
        userCount: Number(result[0]?.count || 0),
      };
    } catch (error) {
      logger.error('Failed to get database metrics', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {
        isConnected: Database.isConnected,
        userCount: 0,
      };
    }
  }
}

// Export the Prisma client instance
export const prisma = Database.getInstance();

// Export database management functions
export const {
  connect: connectDatabase,
  disconnect: disconnectDatabase,
  testConnection: testDatabaseConnection,
  isHealthy: isDatabaseHealthy,
  transaction: runTransaction,
  getMetrics: getDatabaseMetrics,
} = Database;

// Export default
export default Database;
