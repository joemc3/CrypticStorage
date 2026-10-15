/* eslint-disable no-console */
import { execSync } from 'child_process';
import { randomBytes } from 'crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';

/**
 * Boots a throwaway Postgres for the test run unless TEST_DATABASE_URL points at one
 * (CI uses a service container). Writes connection details for the workers and teardown
 * to a state file unique to this run, so two jest runs on one machine never read each
 * other's database. The path travels in CS_TEST_STATE_FILE, which workers inherit.
 */
interface EmbeddedPg {
  initialise(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  createDatabase(name: string): Promise<void>;
}

export default async function globalSetup(): Promise<void> {
  const stateFile = path.join(os.tmpdir(), `crypticstorage-test-${randomBytes(8).toString('hex')}.json`);
  process.env.CS_TEST_STATE_FILE = stateFile;
  let databaseUrl = process.env.TEST_DATABASE_URL;
  let dataDir: string | null = null;
  let port: number | null = null;

  if (!databaseUrl) {
    // ESM-only package; keep the specifier dynamic so the CommonJS test build does not try to resolve its types.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const dynamicImport = new Function('s', 'return import(s)') as (s: string) => Promise<{ default: new (opts: Record<string, unknown>) => EmbeddedPg }>;
    const mod = await dynamicImport('embedded-postgres');
    const EmbeddedPostgres = mod.default;
    // A random port can collide with another run (or anything else listening); try a fresh
    // port and data directory up to three times before giving up.
    let pg: EmbeddedPg | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3 && !pg; attempt++) {
      port = 54300 + Math.floor(Math.random() * 200);
      dataDir = mkdtempSync(path.join('/tmp', 'cs-pg-'));
      const logs: string[] = [];
      const candidate = new EmbeddedPostgres({
        databaseDir: dataDir,
        user: 'postgres',
        password: 'postgres',
        port,
        persistent: false,
        createPostgresUser: process.getuid?.() === 0, // only root can (and must) create the OS user; a normal account runs as itself
        onLog: (m: unknown) => logs.push(String(m)),
        onError: (m: unknown) => logs.push(String(m)),
      });
      try {
        await candidate.initialise();
        await candidate.start();
        await candidate.createDatabase('crypticstorage_test');
        pg = candidate;
      } catch (err) {
        lastError = err;
        await candidate.stop().catch(() => undefined);
        rmSync(dataDir, { recursive: true, force: true });
        const text = `${String(err)}\n${logs.join('\n')}`;
        if (!/EADDRINUSE|address already in use|could not bind|could not create any TCP\/IP sockets/i.test(text)) throw err;
      }
    }
    if (!pg) throw lastError;
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
