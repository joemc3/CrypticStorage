import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { isProd } from '../config/env';

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ success: false, message: 'Route not found', code: 'NOT_FOUND' });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    res.destroy();
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ success: false, message: err.message, code: err.code, errors: err.details });
    return;
  }

  // Body parser errors.
  const anyErr = err as { type?: string; status?: number; message?: string };
  if (anyErr?.type === 'entity.parse.failed') {
    res.status(400).json({ success: false, message: 'Malformed JSON body', code: 'BAD_REQUEST' });
    return;
  }
  if (anyErr?.type === 'entity.too.large') {
    res.status(413).json({ success: false, message: 'Request body too large', code: 'PAYLOAD_TOO_LARGE' });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    res.status(409).json({ success: false, message: 'Resource already exists', code: 'CONFLICT' });
    return;
  }

  logger.error({ err, path: req.path, method: req.method }, 'unhandled error');
  res.status(500).json({
    success: false,
    message: isProd ? 'Internal server error' : (err as Error)?.message ?? 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
}
