import { z } from 'zod';
import { email } from '../auth/schema';

export const inviteSchema = z.object({ email });

/** Integer only here. The bounds depend on the owner's current set and are checked in the service. */
export const thresholdSchema = z.object({ k: z.number().int() });
