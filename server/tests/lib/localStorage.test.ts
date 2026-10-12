import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { LocalStorageDriver } from '../../src/storage/local';
import { ObjectTooLargeError } from '../../src/storage/driver';

let root: string;
let driver: LocalStorageDriver;

beforeEach(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'cs-local-'));
  driver = new LocalStorageDriver(root);
  await driver.init();
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

async function read(key: string): Promise<Buffer> {
  const { stream } = await driver.get(key);
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

describe('LocalStorageDriver', () => {
  it('stores, stats, copies and deletes objects', async () => {
    const data = Buffer.from('hello world');
    const stat = await driver.put('u/a/b', Readable.from([data]), { maxBytes: 100 });
    expect(stat.size).toBe(11);
    expect(await driver.stat('u/a/b')).toEqual({ size: 11 });
    expect((await read('u/a/b')).toString()).toBe('hello world');

    await driver.copy('u/a/b', 'u/a/c');
    expect((await read('u/a/c')).toString()).toBe('hello world');

    await driver.delete('u/a/b');
    expect(await driver.stat('u/a/b')).toBeNull();
    await expect(driver.delete('u/a/b')).resolves.toBeUndefined(); // idempotent
  });

  it('enforces the size limit and leaves no partial object behind', async () => {
    const big = Readable.from([Buffer.alloc(64), Buffer.alloc(64)]);
    await expect(driver.put('u/x', big, { maxBytes: 100 })).rejects.toBeInstanceOf(ObjectTooLargeError);
    expect(await driver.stat('u/x')).toBeNull();
  });

  it('rejects keys that escape the root', async () => {
    for (const key of ['../etc/passwd', 'u/../../x', '/abs', 'a//b', 'bad key']) {
      await expect(driver.put(key, Readable.from([Buffer.alloc(1)]), { maxBytes: 10 })).rejects.toThrow(/Invalid storage key|escapes/);
    }
  });
});
