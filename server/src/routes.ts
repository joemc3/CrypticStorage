import { Router } from 'express';
import { prisma } from './config/prisma';
import { env } from './config/env';
import { authRouter } from './modules/auth/router';
import { activityRouter, storageRouter, usersRouter } from './modules/users/router';
import { fileContentRouter, filesRouter } from './modules/files/router';
import { foldersRouter } from './modules/folders/router';
import { sharesRouter } from './modules/shares/router';
import { handler } from './lib/http';

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
