import { z } from 'zod';
import { authHash, email } from '../auth/schema';

export const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(64).nullable().optional(),
    lockAfterMinutes: z.number().int().min(1).max(30).optional(),
    currentPasswordHash: authHash.optional(),
    newPasswordHash: authHash.optional(),
    salt: z.string().min(16).max(256).optional(),
    kdfIterations: z.number().int().min(100_000).max(10_000_000).optional(),
    wrappedMasterKey: z.string().min(1).max(2048).optional(),
    encryptedPrivateKey: z.string().min(1).max(16384).optional(),
  })
  .superRefine((v, ctx) => {
    const sensitive = Boolean(v.newPasswordHash || v.kdfIterations || v.wrappedMasterKey || v.encryptedPrivateKey || v.salt);
    if (sensitive && !v.currentPasswordHash) {
      ctx.addIssue({ code: 'custom', path: ['currentPasswordHash'], message: 'Current password is required for this change' });
    }
    if (v.newPasswordHash && !(v.salt && v.wrappedMasterKey)) {
      ctx.addIssue({ code: 'custom', path: ['wrappedMasterKey'], message: 'A password change must include the new salt and re-wrapped master key' });
    }
  });

export const passwordConfirmSchema = z.object({ passwordHash: authHash });

export const totpTokenSchema = z.object({ token: z.string().trim().regex(/^\d{6}$/, 'Token must be 6 digits') });

export const disableTwoFactorSchema = z.object({
  token: z.string().trim().regex(/^\d{6}$/, 'Token must be 6 digits'),
  passwordHash: authHash,
});

export const publicKeyQuerySchema = z.object({ email });

export const activityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
