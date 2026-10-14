let override: Date | null = null;

/** The current time. Tests may pin it through /api/_test/clock; nothing else ever sets an override. */
export function now(): Date {
  return override ? new Date(override.getTime()) : new Date();
}

export function setClockOverride(value: Date | null): void {
  override = value;
}
