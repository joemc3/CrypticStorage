/* eslint-disable no-console */
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';

/**
 * Boots a throwaway Postgres for the test run unless TEST_DATABASE_URL points at one
 * (CI uses a service container). Writes connection details for the workers and teardown.
 */
interface EmbeddedPg {
  initialise(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  createDatabase(name: string): Promise<void>;
}

export default async function globalSetup(): Promise<void> {
  const stateFile = path.join(os.tmpdir(), 'crypticstorage-test-state.json');
  let databaseUrl = process.env.TEST_DATABASE_URL;
  let dataDir: string | null = null;
  let port: number | null = null;

  if (!databaseUrl) {
    // ESM-only package; keep the specifier dynamic so the CommonJS test build does not try to resolve its types.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const dynamicImport = new Function('s', 'return import(s)') as (s: string) => Promise<{ default: new (opts: Record<string, unknown>) => EmbeddedPg }>;
    const mod = await dynamicImport('embedded-postgres');
    const EmbeddedPostgres = mod.default;
    port = 54300 + Math.floor(Math.random() * 200);
    dataDir = mkdtempSync(path.join('/tmp', 'cs-pg-'));
    const pg = new EmbeddedPostgres({
      databaseDir: dataDir,
      user: 'postgres',
      password: 'postgres',
      port,
      persistent: false,
      createPostgresUser: true,
      onLog: () => undefined,
      onError: () => undefined,
    });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase('crypticstorage_test');
    databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/crypticstorage_test`;
    // Keep the handle alive for teardown.
    (globalThis as { __EMBEDDED_PG__?: unknown }).__EMBEDDED_PG__ = pg;
  }

  process.env.DATABASE_URL = databaseUrl;
  process.env.NODE_ENV = 'test';

  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });

  const storageDir = mkdtempSync(path.join(os.tmpdir(), 'cs-storage-'));
  process.env.STORAGE_LOCAL_PATH = storageDir;
  writeFileSync(stateFile, JSON.stringify({ databaseUrl, dataDir, port, storageDir }));
}
