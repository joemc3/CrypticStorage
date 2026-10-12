#!/usr/bin/env node
/**
 * Starts a throwaway Postgres for local development or end-to-end runs when
 * Docker is not available. Prints the connection URL on stdout and keeps
 * running until it receives SIGINT/SIGTERM.
 *
 *   node scripts/embedded-db.mjs [--port 54321] [--dir /tmp/cs-pg-dev]
 */
import EmbeddedPostgres from 'embedded-postgres';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const port = Number(arg('port', 54321));
const dir = arg('dir', mkdtempSync(path.join('/tmp', 'cs-pg-')));
const database = arg('db', 'crypticstorage');

const pg = new EmbeddedPostgres({
  databaseDir: dir,
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
await pg.createDatabase(database).catch(() => undefined);

const url = `postgresql://postgres:postgres@127.0.0.1:${port}/${database}`;
process.stdout.write(`${url}\n`);
process.stderr.write(`embedded postgres ready at ${url} (data: ${dir})\n`);

const stop = async () => {
  await pg.stop().catch(() => undefined);
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => undefined, 60_000);
