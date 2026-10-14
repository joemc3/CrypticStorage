import { useEffect } from 'react';
import { useAuth } from './useAuth';
import { startIdleLock } from '../lib/idle';

/** While unlocked, locks the vault after the user's idle period and when the page is hidden for good. */
export function useIdleLock(): void {
  const { status, user, lock } = useAuth();
  const minutes = user?.lockAfterMinutes ?? 5;

  useEffect(() => {
    if (status !== 'unlocked') return;
    return startIdleLock({ minutes, onLock: lock });
  }, [status, minutes, lock]);
}
