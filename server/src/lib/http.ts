import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Standard success envelope expected by the client. */
export function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}

/** Wrap an async handler so rejections reach the error middleware. */
export function handler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export function clientIp(req: Request): string | undefined {
  return req.ip;
}

export function userAgent(req: Request): string | undefined {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua.slice(0, 512) : undefined;
}
