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
  /** The k the shares were split with; the service refuses with THRESHOLD_CHANGED when it is not the owner's now. */
  threshold: z.number().int(),
  wrappedReleaseKeyOwner: blob,
});

/**
 * A re-split for the rule's current witnesses. The witness-is-recipient check (WITNESS_MAY_BE_RECIPIENT) applies
 * at creation only and is not repeated here, so a stale rule can always be repaired.
 */
export const replaceSharesSchema = z.object({ shares: z.array(shareInput).max(20), threshold: z.number().int() });
export const addItemsSchema = z.object({ items: z.array(itemInput).max(50_000) });
export const ruleIdParamSchema = z.object({ id: uuid });

export const openRequestSchema = z.object({ ownerId: uuid });
export const voteSchema = z.object({
  shares: z.array(z.object({ ruleId: uuid, recipientUserId: uuid, wrappedShare: blob })).max(50_000),
});
export const requestIdParamSchema = z.object({ id: uuid });
