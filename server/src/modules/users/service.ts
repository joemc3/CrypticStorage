import type { Request } from 'express';
import type { z } from 'zod';
import { prisma } from '../../config/prisma';
import { BadRequestError, ConflictError, NotFoundError, UnauthorizedError } from '../../lib/errors';
import { decryptAtRest, encryptAtRest, randomBackupCode, sha256Hex, spkiFingerprint } from '../../lib/crypto';
import { generateTotpSecret, totpQrCodeDataUrl, verifyTotp } from '../../lib/totp';
import { audit } from '../../lib/audit';
import { storage } from '../../storage';
import { hashCredential, verifyCredential } from '../auth/service';
import { toPublicUser } from '../dto';
import { withdrawFromAllSets } from '../witnesses/service';
import type { updateProfileSchema } from './schema';

async function loadUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');
  return user;
}

async function assertPassword(userId: string, passwordHash: string | undefined) {
  const user = await loadUser(userId);
  if (!passwordHash || !(await verifyCredential(passwordHash, user.passwordHash))) {
    throw new UnauthorizedError('Invalid password');
  }
  return user;
}

export async function getProfile(userId: string) {
  return toPublicUser(await loadUser(userId));
}

export async function updateProfile(userId: string, sessionId: string, input: z.infer<typeof updateProfileSchema>, req: Request) {
  const sensitive = Boolean(input.newPasswordHash || input.wrappedMasterKey || input.encryptedPrivateKey || input.salt || input.kdfIterations);
  // Display name and lock period are not sensitive, so they need no password.
  if (sensitive) await assertPassword(userId, input.currentPasswordHash ?? '');
  else await loadUser(userId);

  const changingPassword = Boolean(input.newPasswordHash);
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.user.update({
      where: { id: userId },
      data: {
        displayName: input.displayName,
        lockAfterMinutes: input.lockAfterMinutes,
        passwordHash: input.newPasswordHash ? await hashCredential(input.newPasswordHash) : undefined,
        salt: input.salt,
        kdfIterations: input.kdfIterations,
        wrappedMasterKey: input.wrappedMasterKey,
        encryptedPrivateKey: input.encryptedPrivateKey,
      },
    });
    if (changingPassword) {
      // Everyone else gets logged out; the current session survives.
      await tx.session.deleteMany({ where: { userId, NOT: { id: sessionId } } });
    }
    return next;
  });

  audit(req, {
    userId,
    action: changingPassword ? 'user.password_change' : 'user.profile_update',
  });
  return toPublicUser(updated);
}

export async function deleteAccount(userId: string, passwordHash: string, req: Request): Promise<void> {
  await assertPassword(userId, passwordHash);
  // Before the cascade: the owners this user witnesses for must see their set shrink, not a silent dead slot (R42).
  await withdrawFromAllSets(userId);
  const files = await prisma.file.findMany({ where: { userId }, select: { storageKey: true } });
  await prisma.user.delete({ where: { id: userId } });
  const driver = storage();
  await Promise.allSettled(files.map((f) => driver.delete(f.storageKey)));
  audit(req, { userId: null, action: 'user.delete', metadata: { userId, files: files.length } });
}

function toTrust(row: { fingerprint: string; verifiedInPerson: boolean; firstSeenAt: Date; lastSeenAt: Date }) {
  return {
    fingerprint: row.fingerprint,
    verifiedInPerson: row.verifiedInPerson,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
  };
}

/** Read-only: the client compares the fingerprint with `trust` and then decides whether to record it. */
export async function publicKeyForEmail(callerId: string, email: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, publicKey: true, emailVerifiedAt: true } });
  // Unverified accounts answer exactly like missing ones, so they cannot be told apart.
  if (!user || !user.emailVerifiedAt) throw new NotFoundError('No user with that email');
  const row = await prisma.trustedKey.findUnique({
    where: { userId_contactUserId: { userId: callerId, contactUserId: user.id } },
  });
  return { id: user.id, email: user.email, publicKey: user.publicKey, fingerprint: spkiFingerprint(user.publicKey), trust: row ? toTrust(row) : null };
}

/**
 * Upserts the caller's trust row for a contact with the contact's current key.
 * `verifiedInPerson` undefined leaves the flag as it was (false on insert).
 */
export async function recordContactKey(callerId: string, contactId: string, verifiedInPerson: boolean | undefined) {
  const contact = await prisma.user.findUnique({ where: { id: contactId }, select: { publicKey: true, emailVerifiedAt: true } });
  if (!contact || !contact.emailVerifiedAt) throw new NotFoundError('No such contact');
  const fingerprint = spkiFingerprint(contact.publicKey);
  const now = new Date();
  const row = await prisma.trustedKey.upsert({
    where: { userId_contactUserId: { userId: callerId, contactUserId: contactId } },
    create: { userId: callerId, contactUserId: contactId, fingerprint, verifiedInPerson: verifiedInPerson ?? false, firstSeenAt: now, lastSeenAt: now },
    update: { fingerprint, lastSeenAt: now, ...(verifiedInPerson === undefined ? {} : { verifiedInPerson }) },
  });
  return toTrust(row);
}

// ---------------------------------------------------------------------------
// Two-factor authentication
// ---------------------------------------------------------------------------

export async function setupTwoFactor(userId: string) {
  const user = await loadUser(userId);
  if (user.twoFactorEnabled) throw new ConflictError('Two-factor authentication is already enabled');
  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: userId }, data: { totpPendingEnc: encryptAtRest(secret) } });
  return { secret, qrCode: await totpQrCodeDataUrl(user.email, secret), backupCodes: [] as string[] };
}

function issueBackupCodes(): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: 8 }, () => randomBackupCode());
  return { codes, hashes: codes.map((c) => sha256Hex(c.replace(/[^A-Z0-9]/g, ''))) };
}

export async function enableTwoFactor(userId: string, token: string, req: Request) {
  const user = await loadUser(userId);
  if (user.twoFactorEnabled) throw new ConflictError('Two-factor authentication is already enabled');
  if (!user.totpPendingEnc) throw new BadRequestError('Call /2fa/setup first');
  if (!verifyTotp(decryptAtRest(user.totpPendingEnc), token)) {
    audit(req, { userId, action: 'user.2fa.enable', success: false });
    throw new UnauthorizedError('Invalid verification code');
  }
  const { codes, hashes } = issueBackupCodes();
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: true, totpSecretEnc: user.totpPendingEnc, totpPendingEnc: null, backupCodeHashes: hashes },
  });
  audit(req, { userId, action: 'user.2fa.enable' });
  return { backupCodes: codes };
}

export async function disableTwoFactor(userId: string, token: string, passwordHash: string, req: Request): Promise<void> {
  const user = await assertPassword(userId, passwordHash);
  if (!user.twoFactorEnabled || !user.totpSecretEnc) throw new BadRequestError('Two-factor authentication is not enabled');
  if (!verifyTotp(decryptAtRest(user.totpSecretEnc), token)) {
    audit(req, { userId, action: 'user.2fa.disable', success: false });
    throw new UnauthorizedError('Invalid verification code');
  }
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: false, totpSecretEnc: null, totpPendingEnc: null, backupCodeHashes: [] },
  });
  audit(req, { userId, action: 'user.2fa.disable' });
}

export async function regenerateBackupCodes(userId: string, passwordHash: string, req: Request) {
  const user = await assertPassword(userId, passwordHash);
  if (!user.twoFactorEnabled) throw new BadRequestError('Two-factor authentication is not enabled');
  const { codes, hashes } = issueBackupCodes();
  await prisma.user.update({ where: { id: userId }, data: { backupCodeHashes: hashes } });
  audit(req, { userId, action: 'user.2fa.backup_codes' });
  return { backupCodes: codes };
}

// ---------------------------------------------------------------------------
// Stats and activity
// ---------------------------------------------------------------------------

export async function storageStats(userId: string) {
  const [user, fileCount, folderCount] = await Promise.all([
    loadUser(userId),
    prisma.file.count({ where: { userId, status: 'READY' } }),
    prisma.folder.count({ where: { userId } }),
  ]);
  return { used: Number(user.storageUsed), limit: Number(user.storageQuota), fileCount, folderCount };
}

export async function activity(userId: string, page: number, pageSize: number) {
  const where = { userId };
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      action: r.action,
      resourceType: r.resourceType ?? '',
      resourceId: r.resourceId ?? '',
      metadata: (r.metadata as Record<string, unknown> | null) ?? {},
      ipAddress: r.ipAddress ?? '',
      userAgent: r.userAgent ?? '',
      success: r.success,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
