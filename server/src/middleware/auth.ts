import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { UnauthorizedError } from '../lib/errors';
import { verifyAccessToken, type AccessScope } from '../lib/jwt';

export interface AuthContext {
  userId: string;
  sessionId: string;
  scope: AccessScope;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function bearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

/** Require a full access token with a live session. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  authenticate(req, 'access').then(() => next(), next);
}

/** Require the short-lived token issued after password login when 2FA is pending. */
export function requireTwoFactorPending(req: Request, _res: Response, next: NextFunction): void {
  authenticate(req, '2fa').then(() => next(), next);
}

async function authenticate(req: Request, scope: AccessScope): Promise<void> {
  const token = bearer(req);
  if (!token) throw new UnauthorizedError();
  const payload = verifyAccessToken(token);
  if (payload.scope !== scope) throw new UnauthorizedError('Token scope not permitted here');

  const session = await prisma.session.findUnique({ where: { id: payload.sid }, select: { id: true, userId: true, expiresAt: true } });
  if (!session || session.userId !== payload.sub || session.expiresAt.getTime() < Date.now()) {
    throw new UnauthorizedError('Session expired');
  }
  req.auth = { userId: payload.sub, sessionId: payload.sid, scope };
}

export function auth(req: Request): AuthContext {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
}
