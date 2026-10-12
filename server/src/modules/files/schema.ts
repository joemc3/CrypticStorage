import { z } from 'zod';
import { env } from '../../config/env';

export const uuid = z.string().uuid();
const encrypted = z.string().min(1).max(4096);
const ivString = z.string().min(8).max(64);

export const createUploadSchema = z.object({
  encryptedName: encrypted,
  encryptedNameIV: ivString,
  encryptedFileKey: z.string().min(16).max(512),
  fileKeyIV: ivString,
  /** Base nonce for chunked content encryption. */
  iv: ivString,
  encryptedSize: z.number().int().min(0).max(env.MAX_FILE_SIZE_BYTES),
  mimeType: z.string().trim().min(1).max(255).default('application/octet-stream'),
  folderId: uuid.optional(),
});

export const updateFileSchema = z
  .object({
    encryptedName: encrypted.optional(),
    encryptedNameIV: ivString.optional(),
    folderId: uuid.nullable().optional(),
  })
  .refine((v) => (v.encryptedName === undefined) === (v.encryptedNameIV === undefined), {
    message: 'encryptedName and encryptedNameIV must be provided together',
  });

export const moveFileSchema = z.object({ folderId: uuid.nullable().optional() });

export const listFilesQuerySchema = z.object({ folderId: uuid.optional() });

export const idParamSchema = z.object({ id: uuid });

export const contentTokenQuerySchema = z.object({ token: z.string().min(16).max(2048) });
