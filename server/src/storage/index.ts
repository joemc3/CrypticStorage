import { env } from '../config/env';
import type { StorageDriver } from './driver';
import { LocalStorageDriver } from './local';
import { S3StorageDriver } from './s3';

let driver: StorageDriver | null = null;

export function createStorageDriver(): StorageDriver {
  if (env.STORAGE_DRIVER === 's3') {
    return new S3StorageDriver({
      endpoint: env.S3_ENDPOINT!,
      port: env.S3_PORT,
      useSSL: env.S3_USE_SSL,
      accessKey: env.S3_ACCESS_KEY!,
      secretKey: env.S3_SECRET_KEY!,
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      publicEndpoint: env.S3_PUBLIC_ENDPOINT,
    });
  }
  return new LocalStorageDriver(env.STORAGE_LOCAL_PATH);
}

export function storage(): StorageDriver {
  if (!driver) driver = createStorageDriver();
  return driver;
}

/** Test hook. */
export function setStorageDriver(d: StorageDriver | null): void {
  driver = d;
}

export type { StorageDriver } from './driver';
export { ObjectTooLargeError } from './driver';
