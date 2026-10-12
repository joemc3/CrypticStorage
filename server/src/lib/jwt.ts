import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UnauthorizedError } from './errors';

export type AccessScope = 'access' | '2fa';
export type ContentScope = 'upload' | 'download';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  scope: AccessScope;
}

export interface ContentTokenPayload {
  fid: string;
  scope: ContentScope;
  sub?: string;
  /** Share link id when the download is on behalf of an anonymous link. */
  lid?: string;
}

export function signAccessToken(payload: AccessTokenPayload, ttlSeconds = env.ACCESS_TOKEN_TTL_SECONDS): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: ttlSeconds, issuer: 'crypticstorage' });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { issuer: 'crypticstorage' }) as jwt.JwtPayload;
    if (typeof decoded.sub !== 'string' || typeof decoded.sid !== 'string') throw new Error('bad payload');
    if (decoded.scope !== 'access' && decoded.scope !== '2fa') throw new Error('bad scope');
    return { sub: decoded.sub, sid: decoded.sid, scope: decoded.scope };
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}

export function signContentToken(payload: ContentTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.CONTENT_TOKEN_TTL_SECONDS, issuer: 'crypticstorage:content' });
}

export function verifyContentToken(token: string, expectedScope: ContentScope): ContentTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { issuer: 'crypticstorage:content' }) as jwt.JwtPayload;
    if (typeof decoded.fid !== 'string' || decoded.scope !== expectedScope) throw new Error('bad payload');
    return {
      fid: decoded.fid,
      scope: decoded.scope,
      sub: typeof decoded.sub === 'string' ? decoded.sub : undefined,
      lid: typeof decoded.lid === 'string' ? decoded.lid : undefined,
    };
  } catch {
    throw new UnauthorizedError('Invalid or expired content token');
  }
}
