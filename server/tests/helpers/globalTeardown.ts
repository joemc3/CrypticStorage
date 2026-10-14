import { existsSync, readFileSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';

export default async function globalTeardown(): Promise<void> {
  const pg = (globalThis as { __EMBEDDED_PG__?: { stop(): Promise<void> } }).__EMBEDDED_PG__;
  if (pg) await pg.stop().catch(() => undefined);

  const stateFile = path.join(os.tmpdir(), 'crypticstorage-test-state.json');
  if (existsSync(stateFile)) {
    const state = JSON.parse(readFileSync(stateFile, 'utf8')) as { dataDir: string | null; storageDir: string };
    if (state.dataDir) rmSync(state.dataDir, { recursive: true, force: true });
    rmSync(state.storageDir, { recursive: true, force: true });
    rmSync(stateFile, { force: true });
  }
}
