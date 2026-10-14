/**
 * Idle lock timer. No React in here.
 *
 * Calls onLock() once after `minutes` without a pointer, key or scroll event,
 * and immediately on pagehide. A visibilitychange to visible counts as activity.
 * The timer length is fixed at start: when `minutes` changes, the caller stops
 * and starts again.
 */

export interface IdleLockOptions {
  minutes: number;
  onLock: () => void;
  target?: Window;
  doc?: Document;
}

export function startIdleLock({ minutes, onLock, target = window, doc = document }: IdleLockOptions): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const fire = () => {
    clearTimeout(timer);
    timer = undefined;
    onLock();
  };
  const reset = () => {
    clearTimeout(timer);
    timer = setTimeout(fire, minutes * 60_000);
  };
  const onVisible = () => {
    if (doc.visibilityState === 'visible') reset();
  };

  const activity = ['pointerdown', 'keydown'] as const;
  activity.forEach((t) => target.addEventListener(t, reset));
  target.addEventListener('scroll', reset, { capture: true, passive: true });
  target.addEventListener('pagehide', fire);
  doc.addEventListener('visibilitychange', onVisible);
  reset();

  return () => {
    clearTimeout(timer);
    timer = undefined;
    activity.forEach((t) => target.removeEventListener(t, reset));
    target.removeEventListener('scroll', reset, { capture: true });
    target.removeEventListener('pagehide', fire);
    doc.removeEventListener('visibilitychange', onVisible);
  };
}
