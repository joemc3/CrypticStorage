import { z } from 'zod';
import { email } from '../auth/schema';

export const uuid = z.string().uuid();

const futureDate = z
  .string()
  .datetime({ offset: true })
  .transform((s) => new Date(s))
  .refine((d) => d.getTime() > Date.now(), { message: 'expiresAt must be in the future' });

export const createUserShareSchema = z.object({
  fileId: uuid,
  recipientEmail: email,
  /** File key wrapped with the recipient's RSA-OAEP public key (base64). */
  encryptedFileKey: z.string().min(16).max(2048),
  permissions: z.enum(['read', 'write']).default('read'),
  expiresAt: futureDate.optional(),
});

export const createLinkSchema = z.object({
  fileId: uuid,
  password: z.string().min(4).max(256).optional(),
  expiresAt: futureDate.optional(),
  maxDownloads: z.number().int().min(1).max(100_000).optional(),
});

export const linkPasswordSchema = z.object({
  password: z.string().max(256).optional(),
});

export const tokenParamSchema = z.object({ token: z.string().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/) });

export const idParamSchema = z.object({ id: uuid });
