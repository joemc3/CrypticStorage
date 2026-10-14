import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { logger } from './lib/logger';
import { storage } from './storage';
import { startCleanupJob } from './jobs/cleanup';

async function main(): Promise<void> {
  await prisma.$connect();
  await storage().init();
  logger.info({ driver: storage().name }, 'storage ready');

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'CrypticStorage API listening');
  });
  // Large encrypted uploads can be slow; do not cut them off at the default 2 minutes.
  server.requestTimeout = 0;
  server.headersTimeout = 65_000;

  const stopCleanup = startCleanupJob();

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    stopCleanup();
    server.close(() => {
      prisma.$disconnect().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
