import bcrypt from 'bcrypt';
import type { Request } from 'express';
import type { User } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { ConflictError, UnauthorizedError } from '../../lib/errors';
import { randomToken, safeEqual, sha256Hex, decryptAtRest } from '../../lib/crypto';
import { signAccessToken } from '../../lib/jwt';
import { verifyTotp } from '../../lib/totp';
import { audit } from '../../lib/audit';
import { clientIp, userAgent } from '../../lib/http';
import { toAuthenticatedUser, toPublicUser } from '../dto';
import type { loginSchema, registerSchema } from './schema';

const BCRYPT_ROUNDS = 12;
const TWO_FACTOR_WINDOW_SECONDS = 5 * 60;

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export async function hashCredential(value: string): Promise<string> {
  return bcrypt.hash(value, BCRYPT_ROUNDS);
}

export async function verifyCredential(value: string, hash: string): Promise<boolean> {
  return bcrypt.compare(value, hash);
}

/** Create a session row and issue the access/refresh pair bound to it. */
export async function issueSession(user: User, req: Request): Promise<Tokens> {
  const refreshToken = randomToken(48);
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: sha256Hex(refreshToken),
      expiresAt,
      ipAddress: clientIp(req),
      userAgent: userAgent(req),
    },
  });
  return {
    accessToken: signAccessToken({ sub: user.id, sid: session.id, scope: 'access' }),
    refreshToken,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  };
}

/** Short-lived session used only to complete the second factor. */
async function issueTwoFactorChallenge(user: User, req: Request): Promise<Tokens> {
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: sha256Hex(randomToken(48)), // never handed out
      expiresAt: new Date(Date.now() + TWO_FACTOR_WINDOW_SECONDS * 1000),
      ipAddress: clientIp(req),
      userAgent: userAgent(req),
    },
  });
  return {
    accessToken: signAccessToken({ sub: user.id, sid: session.id, scope: '2fa' }, TWO_FACTOR_WINDOW_SECONDS),
    refreshToken: '',
    expiresIn: TWO_FACTOR_WINDOW_SECONDS,
  };
}

export async function register(input: z.infer<typeof registerSchema>, req: Request) {
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw new ConflictError('An account with this email already exists');

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await hashCredential(input.passwordHash),
      salt: input.salt,
      kdfIterations: input.kdfIterations ?? 600_000,
      wrappedMasterKey: input.wrappedMasterKey,
      publicKey: input.publicKey,
      encryptedPrivateKey: input.encryptedPrivateKey,
      storageQuota: BigInt(env.DEFAULT_STORAGE_QUOTA_BYTES),
      lastLoginAt: new Date(),
    },
  });

  const tokens = await issueSession(user, req);
  audit(req, { userId: user.id, action: 'auth.register' });
  return { user: toAuthenticatedUser(user), tokens };
}

export async function login(input: z.infer<typeof loginSchema>, req: Request) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // Always run bcrypt to keep timing uniform for unknown emails.
  const valid = user ? await verifyCredential(input.passwordHash, user.passwordHash) : await bcrypt.compare(input.passwordHash, DUMMY_HASH).then(() => false);
  if (!user || !valid) {
    audit(req, { userId: user?.id, action: 'auth.login', success: false, metadata: { email: input.email } });
    throw new UnauthorizedError('Invalid email or password');
  }

  if (user.twoFactorEnabled) {
    const tokens = await issueTwoFactorChallenge(user, req);
    audit(req, { userId: user.id, action: 'auth.login.2fa_challenge' });
    return {
      requiresTwoFactor: true,
      user: { ...toPublicUser(user), encryptedPrivateKey: '', wrappedMasterKey: '', salt: '', kdfIterations: user.kdfIterations },
      tokens,
    };
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const tokens = await issueSession(user, req);
  audit(req, { userId: user.id, action: 'auth.login' });
  return { requiresTwoFactor: false, user: toAuthenticatedUser(user), tokens };
}

const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO5Yp0oJ1Z4u9jSg5nQdHq1dXK6n0vZ5e';

export async function completeTwoFactor(
  userId: string,
  challengeSessionId: string,
  input: { token?: string; backupCode?: string },
  req: Request
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.twoFactorEnabled || !user.totpSecretEnc) throw new UnauthorizedError('Two-factor authentication is not enabled');

  let ok = false;
  let usedBackupHash: string | null = null;

  if (input.token) {
    ok = verifyTotp(decryptAtRest(user.totpSecretEnc), input.token);
  } else if (input.backupCode) {
    const normalized = input.backupCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const hash = sha256Hex(normalized);
    usedBackupHash = user.backupCodeHashes.find((h) => safeEqual(h, hash)) ?? null;
    ok = usedBackupHash !== null;
  }

  if (!ok) {
    audit(req, { userId: user.id, action: 'auth.2fa.verify', success: false });
    throw new UnauthorizedError('Invalid verification code');
  }

  await prisma.$transaction([
    prisma.session.delete({ where: { id: challengeSessionId } }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        ...(usedBackupHash ? { backupCodeHashes: user.backupCodeHashes.filter((h) => h !== usedBackupHash) } : {}),
      },
    }),
  ]);

  const tokens = await issueSession(user, req);
  audit(req, { userId: user.id, action: 'auth.2fa.verify', metadata: { method: input.token ? 'totp' : 'backup_code' } });
  return { requiresTwoFactor: false, user: toAuthenticatedUser(user), tokens };
}

export async function refresh(refreshToken: string, req: Request): Promise<Tokens> {
  const hash = sha256Hex(refreshToken);
  const session = await prisma.session.findUnique({ where: { refreshTokenHash: hash } });
  if (!session || session.expiresAt.getTime() < Date.now()) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    throw new UnauthorizedError('Refresh token is invalid or expired');
  }

  // Rotate: the old refresh token stops working immediately.
  const nextToken = randomToken(48);
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  await prisma.session.update({
    where: { id: session.id },
    data: { refreshTokenHash: sha256Hex(nextToken), expiresAt, lastUsedAt: new Date(), ipAddress: clientIp(req), userAgent: userAgent(req) },
  });

  return {
    accessToken: signAccessToken({ sub: session.userId, sid: session.id, scope: 'access' }),
    refreshToken: nextToken,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  };
}

export async function logout(sessionId: string, userId: string, req: Request): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId, userId } });
  audit(req, { userId, action: 'auth.logout' });
}
