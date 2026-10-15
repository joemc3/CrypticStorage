import { useEffect } from 'react';
import { useAuthStore } from '../../stores/auth.store';
import { useUIStore } from '../../stores/ui.store';
import { repairAtUnlock } from '../../services/rules.service';

export const REPAIR_FAILED_MESSAGE = 'Some handoff rules could not be repaired.';
export const REPAIR_FAILED_DESCRIPTION = 'Open the dashboard to retry.';

/**
 * Renders nothing. Whenever the vault becomes unlocked (sign in, two-factor, unlock after a reload),
 * re-split stale rules and wrap files a covered folder gained. Silent on success; a toast only on failure.
 */
export const RepairAtUnlock = () => {
  const status = useAuthStore((s) => s.status);
  const addToast = useUIStore((s) => s.addToast);

  useEffect(() => {
    if (status !== 'unlocked') return;
    repairAtUnlock()
      .then((result) => {
        if (result.failed > 0) addToast({ type: 'error', message: REPAIR_FAILED_MESSAGE, description: REPAIR_FAILED_DESCRIPTION });
      })
      // Listing the rules failed (offline, signed out): nothing was touched, and the dashboard retries.
      .catch(() => undefined);
  }, [status, addToast]);

  return null;
};
