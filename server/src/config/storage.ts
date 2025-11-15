import * as Minio from 'minio';
import { Readable } from 'stream';
import logger from '../utils/logger';
import { StorageError, ExternalServiceError } from '../utils/errors';

/**
 * MinIO/S3 Configuration
 */
const MINIO_CONFIG = {
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
};

const BUCKET_NAME = process.env.MINIO_BUCKET || 'crypticstorage';

/**
 * Storage Client Manager
 */
class StorageClient {
  private static instance: Minio.Client | null = null;
  private static isConnected: boolean = false;
  private static bucketInitialized: boolean = false;

  /**
   * Get MinIO client instance (singleton pattern)
   */
  public static getInstance(): Minio.Client {
    if (!StorageClient.instance) {
      try {
        StorageClient.instance = new Minio.Client(MINIO_CONFIG);
        logger.info('MinIO client instance created', {
          endPoint: MINIO_CONFIG.endPoint,
          port: MINIO_CONFIG.port,
          useSSL: MINIO_CONFIG.useSSL,
        });
      } catch (error) {
        logger.error('Failed to create MinIO client', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw new StorageError(
          'Failed to create storage client',
          error instanceof Error ? { originalError: error.message } : undefined
        );
      }
    }
    return StorageClient.instance;
  }

  /**
   * Initialize storage (connect and setup bucket)
   */
  public static async initialize(): Promise<void> {
    try {
      const client = StorageClient.getInstance();

      logger.info('Initializing storage...');

      // Test connection
      await StorageClient.testConnection();
      StorageClient.isConnected = true;

      // Ensure bucket exists
      await StorageClient.ensureBucket();
      StorageClient.bucketInitialized = true;

      logger.info('Storage initialized successfully', { bucket: BUCKET_NAME });
    } catch (error) {
      StorageClient.isConnected = false;
      StorageClient.bucketInitialized = false;
      logger.error('Failed to initialize storage', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new StorageError(
        'Failed to initialize storage',
        error instanceof Error ? { originalError: error.message } : undefined
      );
    }
  }

  /**
   * Test storage connection
   */
  public static async testConnection(): Promise<void> {
    try {
      const client = StorageClient.getInstance();
      await client.listBuckets();
      logger.debug('Storage connection test successful');
    } catch (error) {
      logger.error('Storage connection test failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new ExternalServiceError(
        'Storage connection test failed',
        'minio',
        error instanceof Error ? { originalError: error.message } : undefined
      );
    }
  }

  /**
   * Ensure bucket exists, create if it doesn't
   */
  public static async ensureBucket(): Promise<void> {
    try {
      const client = StorageClient.getInstance();
      const exists = await client.bucketExists(BUCKET_NAME);

      if (!exists) {
        logger.info('Creating storage bucket...', { bucket: BUCKET_NAME });
        await client.makeBucket(BUCKET_NAME, 'us-east-1');
        logger.info('Storage bucket created', { bucket: BUCKET_NAME });

        // Set bucket lifecycle policy for cleanup (optional)
        await StorageClient.setBucketLifecycle();
      } else {
        logger.debug('Storage bucket already exists', { bucket: BUCKET_NAME });
      }
    } catch (error) {
      logger.error('Failed to ensure bucket exists', {
        bucket: BUCKET_NAME,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new StorageError(
        'Failed to ensure storage bucket exists',
        error instanceof Error ? { originalError: error.message } : undefined
      );
    }
  }

  /**
   * Set bucket lifecycle policy (optional - for auto-cleanup)
   */
  private static async setBucketLifecycle(): Promise<void> {
    try {
      const client = StorageClient.getInstance();

      // Example: Auto-delete incomplete multipart uploads after 7 days
      const lifecycleConfig = {
        Rule: [
          {
            ID: 'CleanupIncompleteMultipartUploads',
            Status: 'Enabled',
            AbortIncompleteMultipartUpload: {
              DaysAfterInitiation: 7,
            },
          },
        ],
      };

      // Note: MinIO client doesn't have direct lifecycle methods
      // This would need to be set via AWS SDK or MinIO Admin API
      logger.debug('Bucket lifecycle policy would be set here');
    } catch (error) {
      // Non-critical error, just log it
      logger.warn('Failed to set bucket lifecycle policy', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Check if storage is healthy
   */
  public static isHealthy(): boolean {
    return StorageClient.isConnected && StorageClient.bucketInitialized;
  }

  /**
   * Get storage bucket name
   */
  public static getBucketName(): string {
    return BUCKET_NAME;
  }
}

/**
 * Storage Helper Functions
 */

/**
 * Upload a file to storage
 */
export const uploadFile = async (
  objectName: string,
  data: Buffer | Readable,
  size: number,
  metadata?: Record<string, string>
): Promise<Minio.UploadedObjectInfo> => {
  try {
    const client = StorageClient.getInstance();
    const bucket = StorageClient.getBucketName();

    logger.debug('Uploading file to storage', {
      bucket,
      objectName,
      size,
    });

    const result = await client.putObject(bucket, objectName, data, size, metadata);

    logger.info('File uploaded successfully', {
      bucket,
      objectName,
      etag: result.etag,
    });

    return result;
  } catch (error) {
    logger.error('Failed to upload file', {
      objectName,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError(
      'Failed to upload file to storage',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Download a file from storage
 */
export const downloadFile = async (objectName: string): Promise<Readable> => {
  try {
    const client = StorageClient.getInstance();
    const bucket = StorageClient.getBucketName();

    logger.debug('Downloading file from storage', {
      bucket,
      objectName,
    });

    const stream = await client.getObject(bucket, objectName);

    logger.info('File download stream created', {
      bucket,
      objectName,
    });

    return stream;
  } catch (error) {
    logger.error('Failed to download file', {
      objectName,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError(
      'Failed to download file from storage',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Delete a file from storage
 */
export const deleteFile = async (objectName: string): Promise<void> => {
  try {
    const client = StorageClient.getInstance();
    const bucket = StorageClient.getBucketName();

    logger.debug('Deleting file from storage', {
      bucket,
      objectName,
    });

    await client.removeObject(bucket, objectName);

    logger.info('File deleted successfully', {
      bucket,
      objectName,
    });
  } catch (error) {
    logger.error('Failed to delete file', {
      objectName,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError(
      'Failed to delete file from storage',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Delete multiple files from storage
 */
export const deleteFiles = async (objectNames: string[]): Promise<void> => {
  try {
    const client = StorageClient.getInstance();
    const bucket = StorageClient.getBucketName();

    logger.debug('Deleting multiple files from storage', {
      bucket,
      count: objectNames.length,
    });

    await client.removeObjects(bucket, objectNames);

    logger.info('Files deleted successfully', {
      bucket,
      count: objectNames.length,
    });
  } catch (error) {
    logger.error('Failed to delete files', {
      count: objectNames.length,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError(
      'Failed to delete files from storage',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Check if a file exists in storage
 */
export const fileExists = async (objectName: string): Promise<boolean> => {
  try {
    const client = StorageClient.getInstance();
    const bucket = StorageClient.getBucketName();

    await client.statObject(bucket, objectName);
    return true;
  } catch (error: any) {
    if (error.code === 'NotFound') {
      return false;
    }
    logger.error('Failed to check file existence', {
      objectName,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError(
      'Failed to check file existence in storage',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Get file metadata from storage
 */
export const getFileMetadata = async (
  objectName: string
): Promise<Minio.BucketItemStat> => {
  try {
    const client = StorageClient.getInstance();
    const bucket = StorageClient.getBucketName();

    logger.debug('Getting file metadata from storage', {
      bucket,
      objectName,
    });

    const stat = await client.statObject(bucket, objectName);

    logger.debug('File metadata retrieved', {
      bucket,
      objectName,
      size: stat.size,
    });

    return stat;
  } catch (error) {
    logger.error('Failed to get file metadata', {
      objectName,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError(
      'Failed to get file metadata from storage',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Generate a presigned URL for temporary file access
 */
export const generatePresignedUrl = async (
  objectName: string,
  expirySeconds: number = 3600
): Promise<string> => {
  try {
    const client = StorageClient.getInstance();
    const bucket = StorageClient.getBucketName();

    logger.debug('Generating presigned URL', {
      bucket,
      objectName,
      expirySeconds,
    });

    const url = await client.presignedGetObject(bucket, objectName, expirySeconds);

    logger.info('Presigned URL generated', {
      bucket,
      objectName,
      expirySeconds,
    });

    return url;
  } catch (error) {
    logger.error('Failed to generate presigned URL', {
      objectName,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError(
      'Failed to generate presigned URL',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Generate a presigned URL for uploading
 */
export const generatePresignedUploadUrl = async (
  objectName: string,
  expirySeconds: number = 3600
): Promise<string> => {
  try {
    const client = StorageClient.getInstance();
    const bucket = StorageClient.getBucketName();

    logger.debug('Generating presigned upload URL', {
      bucket,
      objectName,
      expirySeconds,
    });

    const url = await client.presignedPutObject(bucket, objectName, expirySeconds);

    logger.info('Presigned upload URL generated', {
      bucket,
      objectName,
      expirySeconds,
    });

    return url;
  } catch (error) {
    logger.error('Failed to generate presigned upload URL', {
      objectName,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError(
      'Failed to generate presigned upload URL',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * List files in storage with optional prefix
 */
export const listFiles = async (
  prefix?: string,
  recursive: boolean = false
): Promise<Minio.BucketItem[]> => {
  try {
    const client = StorageClient.getInstance();
    const bucket = StorageClient.getBucketName();

    logger.debug('Listing files in storage', {
      bucket,
      prefix,
      recursive,
    });

    const objects: Minio.BucketItem[] = [];
    const stream = client.listObjects(bucket, prefix, recursive);

    return new Promise((resolve, reject) => {
      stream.on('data', (obj) => objects.push(obj));
      stream.on('end', () => {
        logger.debug('Files listed successfully', {
          bucket,
          count: objects.length,
        });
        resolve(objects);
      });
      stream.on('error', (err) => {
        logger.error('Failed to list files', {
          bucket,
          prefix,
          error: err.message,
        });
        reject(
          new StorageError('Failed to list files in storage', {
            originalError: err.message,
          })
        );
      });
    });
  } catch (error) {
    logger.error('Failed to list files', {
      prefix,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError(
      'Failed to list files in storage',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Copy a file within storage
 */
export const copyFile = async (
  sourceObjectName: string,
  destObjectName: string
): Promise<Minio.BucketItemCopy> => {
  try {
    const client = StorageClient.getInstance();
    const bucket = StorageClient.getBucketName();

    logger.debug('Copying file in storage', {
      bucket,
      source: sourceObjectName,
      destination: destObjectName,
    });

    const copyConditions = new Minio.CopyConditions();
    const result = await client.copyObject(
      bucket,
      destObjectName,
      `/${bucket}/${sourceObjectName}`,
      copyConditions
    );

    logger.info('File copied successfully', {
      bucket,
      source: sourceObjectName,
      destination: destObjectName,
    });

    return result;
  } catch (error) {
    logger.error('Failed to copy file', {
      source: sourceObjectName,
      destination: destObjectName,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError(
      'Failed to copy file in storage',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

/**
 * Get storage usage statistics
 */
export const getStorageStats = async (): Promise<{
  totalObjects: number;
  totalSize: number;
}> => {
  try {
    const files = await listFiles(undefined, true);

    const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);

    return {
      totalObjects: files.length,
      totalSize,
    };
  } catch (error) {
    logger.error('Failed to get storage stats', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new StorageError(
      'Failed to get storage statistics',
      error instanceof Error ? { originalError: error.message } : undefined
    );
  }
};

// Export the storage client instance
export const storage = StorageClient.getInstance();

// Export storage management functions
export const {
  initialize: initializeStorage,
  testConnection: testStorageConnection,
  isHealthy: isStorageHealthy,
  getBucketName,
} = StorageClient;

// Export default
export default StorageClient;
