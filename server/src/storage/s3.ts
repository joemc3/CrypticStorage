import { Client as MinioClient, CopyConditions } from 'minio';
import { Transform, type Readable } from 'stream';
import { assertValidKey, ObjectTooLargeError, type ObjectStat, type PutOptions, type StorageDriver } from './driver';
import { logger } from '../lib/logger';

export interface S3Options {
  endpoint: string;
  port?: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
  /** Endpoint reachable from browsers; enables presigned URLs. */
  publicEndpoint?: string;
}

function parseEndpoint(raw: string, fallbackPort?: number, fallbackSSL?: boolean) {
  const url = raw.includes('://') ? new URL(raw) : new URL(`http://${raw}`);
  const useSSL = raw.includes('://') ? url.protocol === 'https:' : (fallbackSSL ?? false);
  const port = url.port ? Number(url.port) : (fallbackPort ?? (useSSL ? 443 : 80));
  return { host: url.hostname, port, useSSL };
}

/** S3-compatible driver (MinIO, AWS S3, R2, ...). */
export class S3StorageDriver implements StorageDriver {
  readonly name = 's3' as const;
  private readonly client: MinioClient;
  private readonly publicClient: MinioClient | null;
  private readonly bucket: string;

  constructor(private readonly options: S3Options) {
    const internal = parseEndpoint(options.endpoint, options.port, options.useSSL);
    const common = { accessKey: options.accessKey, secretKey: options.secretKey, region: options.region };
    this.client = new MinioClient({ endPoint: internal.host, port: internal.port, useSSL: internal.useSSL, ...common });
    this.bucket = options.bucket;

    if (options.publicEndpoint) {
      const pub = parseEndpoint(options.publicEndpoint);
      this.publicClient = new MinioClient({ endPoint: pub.host, port: pub.port, useSSL: pub.useSSL, ...common });
    } else {
      this.publicClient = null;
    }
  }

  async init(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket, this.options.region);
      logger.info({ bucket: this.bucket }, 'created storage bucket');
    }
  }

  async put(key: string, body: Readable, options: PutOptions): Promise<ObjectStat> {
    assertValidKey(key);
    let written = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        written += chunk.length;
        if (written > options.maxBytes) {
          cb(new ObjectTooLargeError());
          return;
        }
        cb(null, chunk);
      },
    });
    body.pipe(limiter);
    body.on('error', (err) => limiter.destroy(err));
    await this.client.putObject(this.bucket, key, limiter, undefined, {
      'Content-Type': options.contentType ?? 'application/octet-stream',
    });
    return { size: written };
  }

  async get(key: string): Promise<{ stream: Readable; size: number }> {
    assertValidKey(key);
    const info = await this.client.statObject(this.bucket, key);
    const stream = await this.client.getObject(this.bucket, key);
    return { stream, size: info.size };
  }

  async stat(key: string): Promise<ObjectStat | null> {
    assertValidKey(key);
    try {
      const info = await this.client.statObject(this.bucket, key);
      return { size: info.size };
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'NotFound' || code === 'NoSuchKey') return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    assertValidKey(key);
    await this.client.removeObject(this.bucket, key);
  }

  async copy(sourceKey: string, targetKey: string): Promise<void> {
    assertValidKey(sourceKey);
    assertValidKey(targetKey);
    await this.client.copyObject(this.bucket, targetKey, `/${this.bucket}/${sourceKey}`, new CopyConditions());
  }

  async presignUpload(key: string, _maxBytes: number, ttlSeconds: number): Promise<string | null> {
    if (!this.publicClient) return null;
    assertValidKey(key);
    return this.publicClient.presignedPutObject(this.bucket, key, ttlSeconds);
  }

  async presignDownload(key: string, ttlSeconds: number): Promise<string | null> {
    if (!this.publicClient) return null;
    assertValidKey(key);
    return this.publicClient.presignedGetObject(this.bucket, key, ttlSeconds);
  }
}
