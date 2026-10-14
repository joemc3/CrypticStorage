import { createReadStream, createWriteStream } from 'fs';
import { copyFile, mkdir, rename, rm, stat } from 'fs/promises';
import path from 'path';
import { Transform, type Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { randomBytes } from 'crypto';
import { assertValidKey, ObjectTooLargeError, type ObjectStat, type PutOptions, type StorageDriver } from './driver';

/**
 * Filesystem-backed driver for development, tests and single-node deployments.
 * Objects are written to a temp file and renamed into place so readers never see partial data.
 */
export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local' as const;

  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    assertValidKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error('Key escapes storage root');
    return full;
  }

  async init(): Promise<void> {
    await mkdir(path.join(this.root, '.tmp'), { recursive: true });
  }

  async put(key: string, body: Readable, options: PutOptions): Promise<ObjectStat> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    const tmp = path.join(this.root, '.tmp', `${randomBytes(12).toString('hex')}.part`);

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

    try {
      await pipeline(body, limiter, createWriteStream(tmp, { flags: 'wx' }));
      await rename(tmp, target);
    } catch (err) {
      await rm(tmp, { force: true });
      throw err;
    }
    return { size: written };
  }

  async get(key: string): Promise<{ stream: Readable; size: number }> {
    const full = this.resolve(key);
    const info = await stat(full);
    return { stream: createReadStream(full), size: info.size };
  }

  async stat(key: string): Promise<ObjectStat | null> {
    try {
      const info = await stat(this.resolve(key));
      return info.isFile() ? { size: info.size } : null;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  async copy(sourceKey: string, targetKey: string): Promise<void> {
    const target = this.resolve(targetKey);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(this.resolve(sourceKey), target);
  }

  async presignUpload(): Promise<string | null> {
    return null;
  }

  async presignDownload(): Promise<string | null> {
    return null;
  }
}
