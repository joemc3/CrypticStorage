import { z } from 'zod';

const uuid = z.string().uuid();
/** The server treats every wrapped key as an opaque string; it only bounds the size. */
const blob = z.string().min(1).max(16 * 1024);

export const recipientInput = z.object({ userId: uuid, wrappedReleaseKey: blob });
export const itemInput = z.object({ fileId: uuid, wrappedFileKey: blob });
export const shareInput = z.object({ witnessUserId: uuid, shareIndex: z.number().int(), wrappedShare: blob });

/** Which of fileId and folderId is set, the period, and the coverage are checked in the service with distinct codes. */
export const createRuleSchema = z.object({
  fileId: uuid.optional(),
  folderId: uuid.optional(),
  periodDays: z.number().int(),
  recipients: z.array(recipientInput).max(50),
  items: z.array(itemInput).max(50_000),
  shares: z.array(shareInput).max(20),
  wrappedReleaseKeyOwner: blob,
});

export const replaceSharesSchema = z.object({ shares: z.array(shareInput).max(20) });
export const addItemsSchema = z.object({ items: z.array(itemInput).max(50_000) });
export const ruleIdParamSchema = z.object({ id: uuid });

export const openRequestSchema = z.object({ ownerId: uuid });
export const voteSchema = z.object({
  shares: z.array(z.object({ ruleId: uuid, recipientUserId: uuid, wrappedShare: blob })).max(50_000),
});
export const requestIdParamSchema = z.object({ id: uuid });
