import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { storage } from '../storage';

/** Remove abandoned uploads and expired sessions. Safe to run concurrently. */
export async function runCleanup(): Promise<{ pendingFiles: number; sessions: number; unverifiedUsers: number }> {
  const cutoff = new Date(Date.now() - env.PENDING_UPLOAD_TTL_HOURS * 3_600_000);
  const stale = await prisma.file.findMany({ where: { status: 'PENDING', createdAt: { lt: cutoff } }, select: { id: true, storageKey: true } });
  if (stale.length) {
    await prisma.file.deleteMany({ where: { id: { in: stale.map((f) => f.id) } } });
    const driver = storage();
    await Promise.allSettled(stale.map((f) => driver.delete(f.storageKey)));
  }
  const sessions = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  // Accounts that never proved their email are abandoned sign-ups; their tokens cascade.
  const unverified = await prisma.user.deleteMany({ where: { emailVerifiedAt: null, createdAt: { lt: weekAgo } } });
  await prisma.emailToken.deleteMany({ where: { OR: [{ expiresAt: { lt: weekAgo } }, { usedAt: { lt: weekAgo } }] } });
  return { pendingFiles: stale.length, sessions: sessions.count, unverifiedUsers: unverified.count };
}

export function startCleanupJob(intervalMs = 60 * 60 * 1000): () => void {
  const tick = () => {
    runCleanup()
      .then((r) => {
        if (r.pendingFiles || r.sessions || r.unverifiedUsers) logger.info(r, 'cleanup');
      })
      .catch((err) => logger.warn({ err }, 'cleanup failed'));
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  setTimeout(tick, 5_000).unref();
  return () => clearInterval(timer);
}
