import { readFileSync } from 'fs';
import os from 'os';
import path from 'path';

// Runs before each test file is loaded, so the env module sees these values.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-only-secret-test-only-secret-test-only-secret';
process.env.APP_URL ??= 'http://localhost:3000';
process.env.STORAGE_DRIVER = 'local';
process.env.LOG_LEVEL = 'silent';

if (!process.env.DATABASE_URL || !process.env.STORAGE_LOCAL_PATH) {
  const state = JSON.parse(readFileSync(path.join(os.tmpdir(), 'crypticstorage-test-state.json'), 'utf8')) as {
    databaseUrl: string;
    storageDir: string;
  };
  process.env.DATABASE_URL ??= state.databaseUrl;
  process.env.STORAGE_LOCAL_PATH ??= state.storageDir;
}
