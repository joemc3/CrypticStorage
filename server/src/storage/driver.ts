import type { Readable } from 'stream';

export interface PutOptions {
  /** Declared size in bytes. Drivers reject streams that exceed it. */
  maxBytes: number;
  contentType?: string;
}

export interface ObjectStat {
  size: number;
}

export interface StorageDriver {
  readonly name: 'local' | 's3';
  /** Store a stream. Must write atomically: a failed put leaves no partial object. */
  put(key: string, body: Readable, options: PutOptions): Promise<ObjectStat>;
  get(key: string): Promise<{ stream: Readable; size: number }>;
  stat(key: string): Promise<ObjectStat | null>;
  delete(key: string): Promise<void>;
  copy(sourceKey: string, targetKey: string): Promise<void>;
  /** Presigned upload URL browsers can PUT to directly, or null if the driver cannot provide one. */
  presignUpload(key: string, maxBytes: number, ttlSeconds: number): Promise<string | null>;
  presignDownload(key: string, ttlSeconds: number): Promise<string | null>;
  /** Verify connectivity at startup. */
  init(): Promise<void>;
}

const KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9/_\-.]{0,255}$/;

export function assertValidKey(key: string): void {
  if (!KEY_PATTERN.test(key) || key.includes('..') || key.includes('//')) {
    throw new Error(`Invalid storage key: ${key}`);
  }
}

export class ObjectTooLargeError extends Error {
  constructor() {
    super('Object exceeds declared size');
    this.name = 'ObjectTooLargeError';
  }
}
