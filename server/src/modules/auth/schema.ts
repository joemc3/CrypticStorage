import { z } from 'zod';

export const email = z.string().trim().toLowerCase().email().max(254);

/** Client-derived authentication hash. Opaque to the server; just bound its size. */
export const authHash = z.string().min(32).max(512);

const opaqueBlob = (max: number) => z.string().min(1).max(max);

export const CONTRACT_PHRASE = 'I understand there is no way back';

export const registerSchema = z.object({
  email,
  passwordHash: authHash,
  publicKey: opaqueBlob(4096),
  encryptedPrivateKey: opaqueBlob(16384),
  wrappedMasterKey: opaqueBlob(2048),
  salt: z.string().min(16).max(256),
  kdfIterations: z.number().int().min(100_000).max(10_000_000).optional(),
  // Absent counts as wrong: the service answers 400 CONTRACT_NOT_ACKNOWLEDGED, not a generic 422.
  contractPhrase: z.string().default(''),
  displayName: z.string().trim().min(1).max(64).optional(),
});

export const verifyEmailSchema = z.object({ token: z.string().min(16).max(256) });

export const checkInSchema = z.object({ token: z.string().min(16).max(256) });

export const resendVerificationSchema = z.object({ email });

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
