import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { useAuthStore } from '../../stores/auth.store';
import { useUIStore } from '../../stores/ui.store';
import { RepairAtUnlock } from './RepairAtUnlock';

const repair = vi.hoisted(() => ({ repairAtUnlock: vi.fn() }));
vi.mock('../../services/rules.service', () => repair);

describe('RepairAtUnlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUIStore.setState({ toasts: [] });
    useAuthStore.setState({ status: 'locked' });
  });

  it('does nothing while the vault is locked', () => {
    render(<RepairAtUnlock />);
    expect(repair.repairAtUnlock).not.toHaveBeenCalled();
  });

  it('repairs once the vault unlocks and stays silent on success', async () => {
    repair.repairAtUnlock.mockResolvedValue({ repaired: 2, failed: 0 });
    render(<RepairAtUnlock />);
    act(() => useAuthStore.setState({ status: 'unlocked' }));
    await waitFor(() => expect(repair.repairAtUnlock).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(useUIStore.getState().toasts).toHaveLength(0);
  });

  it('toasts only when a rule could not be repaired', async () => {
    repair.repairAtUnlock.mockResolvedValue({ repaired: 0, failed: 1 });
    render(<RepairAtUnlock />);
    act(() => useAuthStore.setState({ status: 'unlocked' }));
    await waitFor(() => expect(useUIStore.getState().toasts).toHaveLength(1));
    expect(useUIStore.getState().toasts[0]).toMatchObject({ type: 'error', message: 'Some handoff rules could not be repaired.', description: 'Open the dashboard to retry.' });
  });

  it('repairs again after a lock and unlock', async () => {
    repair.repairAtUnlock.mockResolvedValue({ repaired: 0, failed: 0 });
    render(<RepairAtUnlock />);
    act(() => useAuthStore.setState({ status: 'unlocked' }));
    act(() => useAuthStore.setState({ status: 'locked' }));
    act(() => useAuthStore.setState({ status: 'unlocked' }));
    await waitFor(() => expect(repair.repairAtUnlock).toHaveBeenCalledTimes(2));
  });
});
