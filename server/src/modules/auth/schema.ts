import { z } from 'zod';

export const email = z.string().trim().toLowerCase().email().max(254);

/** Client-derived authentication hash. Opaque to the server; just bound its size. */
export const authHash = z.string().min(32).max(512);

const opaqueBlob = (max: number) => z.string().min(1).max(max);

export const registerSchema = z.object({
  email,
  passwordHash: authHash,
  publicKey: opaqueBlob(4096),
  encryptedPrivateKey: opaqueBlob(16384),
  wrappedMasterKey: opaqueBlob(2048),
  salt: z.string().min(16).max(256),
  kdfIterations: z.number().int().min(100_000).max(10_000_000).optional(),
});

export const loginSchema = z.object({
  email,
  passwordHash: authHash,
});

export const verifyTwoFactorSchema = z
  .object({
    token: z.string().trim().max(32).optional(),
    backupCode: z.string().trim().max(32).optional(),
  })
  .refine((v) => Boolean(v.token || v.backupCode), { message: 'token or backupCode is required' });

export const refreshSchema = z.object({
  refreshToken: z.string().min(16).max(512),
});
