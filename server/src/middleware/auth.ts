import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { UnauthorizedError } from '../lib/errors';
import { logger } from '../lib/logger';
import { onOwnerActivity } from '../modules/handoff/activity';
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

const ACTIVITY_INTERVAL_MS = 5 * 60_000;

/** Record activity for the lock handoff: one UPDATE, and only when the stored value is stale. */
async function touchActivity(userId: string): Promise<void> {
  const now = Date.now();
  try {
    const touched = await prisma.user.updateMany({
      where: { id: userId, lastActivityAt: { lt: new Date(now - ACTIVITY_INTERVAL_MS) } },
      data: { lastActivityAt: new Date(now) },
    });
    // The owner was seen: warned rules start over. Only when the throttle actually wrote, so most requests skip it.
    if (touched.count > 0) await onOwnerActivity(userId);
  } catch (err) {
    logger.warn({ err }, 'activity touch failed');
  }
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
  if (scope === 'access') await touchActivity(payload.sub);
}

export function auth(req: Request): AuthContext {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
}
