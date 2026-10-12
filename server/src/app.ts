import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { corsOrigins, env } from './config/env';
import { apiRouter } from './routes';
import { apiLimiter } from './middleware/rateLimit';
import { errorHandler, notFound } from './middleware/error';
import { logger } from './lib/logger';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: (origin, cb) => {
        // Same-origin requests and tools like curl send no Origin header.
        if (!origin || corsOrigins().includes(origin)) cb(null, true);
        else cb(new Error('Origin not allowed by CORS'));
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    })
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));

  if (env.NODE_ENV !== 'test') {
    app.use((req, res, next) => {
      const start = process.hrtime.bigint();
      res.on('finish', () => {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        logger.info({ method: req.method, path: req.originalUrl.split('?')[0], status: res.statusCode, ms: Math.round(ms) }, 'request');
      });
      next();
    });
  }

  app.use('/api', apiLimiter, apiRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
