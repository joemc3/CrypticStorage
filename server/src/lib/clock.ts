import { isTest } from '../config/env';

let override: Date | null = null;

/** The current time. Tests may pin it through /api/_test/clock; nothing else ever sets an override. */
export function now(): Date {
  return override ? new Date(override.getTime()) : new Date();
}

export function setClockOverride(value: Date | null): void {
  if (!isTest) throw new Error('The clock can only be overridden under NODE_ENV=test');
  override = value;
}
