// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startIdleLock } from './idle';

const MIN = 60_000;

describe('startIdleLock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('locks after the configured minutes, once', () => {
    const onLock = vi.fn();
    startIdleLock({ minutes: 5, onLock });
    vi.advanceTimersByTime(5 * MIN - 1);
    expect(onLock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onLock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20 * MIN);
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('delays the lock when the person acts', () => {
    const onLock = vi.fn();
    startIdleLock({ minutes: 5, onLock });
    vi.advanceTimersByTime(4 * MIN);
    window.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(5 * MIN - 1);
    expect(onLock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it.each(['keydown', 'scroll'])('resets on %s', (type) => {
    const onLock = vi.fn();
    startIdleLock({ minutes: 1, onLock });
    vi.advanceTimersByTime(MIN - 1);
    window.dispatchEvent(new Event(type));
    vi.advanceTimersByTime(MIN - 1);
    expect(onLock).not.toHaveBeenCalled();
  });

  it('resets when the page becomes visible again', () => {
    const onLock = vi.fn();
    startIdleLock({ minutes: 1, onLock });
    vi.advanceTimersByTime(MIN - 1);
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(MIN - 1);
    expect(onLock).not.toHaveBeenCalled();
  });

  it('locks immediately on pagehide', () => {
    const onLock = vi.fn();
    startIdleLock({ minutes: 5, onLock });
    window.dispatchEvent(new Event('pagehide'));
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('does nothing after stop', () => {
    const onLock = vi.fn();
    const stop = startIdleLock({ minutes: 5, onLock });
    stop();
    window.dispatchEvent(new Event('pagehide'));
    vi.advanceTimersByTime(10 * MIN);
    expect(onLock).not.toHaveBeenCalled();
  });
});
