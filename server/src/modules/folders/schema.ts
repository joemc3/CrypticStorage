import { z } from 'zod';

export const uuid = z.string().uuid();
const encrypted = z.string().min(1).max(4096);
const ivString = z.string().min(8).max(64);

export const createFolderSchema = z.object({
  encryptedName: encrypted,
  encryptedNameIV: ivString,
  parentId: uuid.optional(),
});

export const updateFolderSchema = z
  .object({
    encryptedName: encrypted.optional(),
    encryptedNameIV: ivString.optional(),
    parentId: uuid.nullable().optional(),
  })
  .refine((v) => (v.encryptedName === undefined) === (v.encryptedNameIV === undefined), {
    message: 'encryptedName and encryptedNameIV must be provided together',
  });

export const moveFolderSchema = z.object({ parentId: uuid.nullable().optional() });

export const listFoldersQuerySchema = z.object({ parentId: uuid.optional() });

export const idParamSchema = z.object({ id: uuid });
