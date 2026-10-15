import { prisma } from '../../config/prisma';
import { cancelOpenRequests } from './requests';

/**
 * The owner was seen: every rule that had started warning goes back to active and forgets its reminders.
 * One UPDATE; with no warning rules it matches nothing. An open release request against the owner is cancelled too.
 */
export async function onOwnerActivity(userId: string): Promise<void> {
  await prisma.handoffRule.updateMany({
    where: { ownerId: userId, state: 'warning' },
    data: { state: 'active', reminded75At: null, reminded90At: null, reminded95At: null },
  });
  await cancelOpenRequests(userId);
}
