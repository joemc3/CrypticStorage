import { Router } from 'express';
import { prisma } from './config/prisma';
import { env, isTest } from './config/env';
import { authRouter } from './modules/auth/router';
import { activityRouter, contactsRouter, storageRouter, usersRouter } from './modules/users/router';
import { fileContentRouter, filesRouter } from './modules/files/router';
import { foldersRouter } from './modules/folders/router';
import { sharesRouter } from './modules/shares/router';
import { witnessesRouter } from './modules/witnesses/router';
import { handler, ok } from './lib/http';
import { clearOutbox, outbox } from './lib/mail';

export const apiRouter = Router();

apiRouter.get(
  '/health',
  handler(async (_req, res) => {
    let database = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'unavailable';
    }
    res.status(database === 'ok' ? 200 : 503).json({
      status: database === 'ok' ? 'ok' : 'degraded',
      database,
      storage: env.STORAGE_DRIVER,
      time: new Date().toISOString(),
    });
  })
);

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/storage', storageRouter);
apiRouter.use('/activity', activityRouter);
apiRouter.use('/files', fileContentRouter);
apiRouter.use('/files', filesRouter);
apiRouter.use('/folders', foldersRouter);
apiRouter.use('/shares', sharesRouter);
apiRouter.use('/witnesses', witnessesRouter);
apiRouter.use('/contacts', contactsRouter);

if (isTest) {
  // Lets the end-to-end run fetch verification links. Never mounted outside NODE_ENV=test.
  apiRouter.get(
    '/_test/mail',
    handler(async (req, res) => {
      const to = typeof req.query.to === 'string' ? req.query.to : undefined;
      ok(res, outbox().filter((m) => to === undefined || m.to === to));
    })
  );
  apiRouter.delete(
    '/_test/mail',
    handler(async (_req, res) => {
      clearOutbox();
      ok(res, { cleared: true });
    })
  );
}
