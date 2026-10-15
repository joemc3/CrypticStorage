import type { HandoffRule } from '../../services/api.service';
import { joinNames } from '../../services/rules.service';

export { joinNames };

const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "13 Oct 2026". Always with the year: a rule's dates are far away or long ago. */
export function formatDay(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  // Spelled out rather than left to Intl, whose short September is "Sept" in some runtimes and "Sep" in others.
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** "13 Oct, 14:02": a day and a time, for the moments in a release request. */
export function formatDayTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getDate()} ${MONTHS[date.getMonth()]}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

export const PERIOD_CHOICES = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '1 year' },
  { days: 1825, label: '5 years' },
  { days: 3650, label: '10 years' },
] as const;

export const CUSTOM_MIN_DAYS = 7;
export const CUSTOM_MAX_DAYS = 3650;

export function periodLabel(days: number): string {
  return PERIOD_CHOICES.find((p) => p.days === days)?.label ?? `${days} days`;
}

export type Person = { email: string; displayName?: string | null };
export const personName = (p: Person) => p.displayName || p.email;
/** A release-request opener or voter: null, or no email, means their account no longer exists. */
export const witnessName = (p: { email: string | null; displayName?: string | null } | null) =>
  p?.email ? p.displayName || p.email : 'A former witness';
export const recipientNames = (rule: Pick<HandoffRule, 'recipients'>) => joinNames(rule.recipients.map(personName));

/** The same "75 / 90 / 95 %" dates the server's reminders use, from a start date and a period. */
export function reminderDates(from: Date, periodDays: number): { first: Date; second: Date; final: Date } {
  return { first: addDays(from, periodDays * 0.75), second: addDays(from, periodDays * 0.9), final: addDays(from, periodDays * 0.95) };
}

/** When the clock last reset: the next check-in date minus the period. */
export function lastResetOf(rule: Pick<HandoffRule, 'nextCheckInAt' | 'periodDays'>): Date | null {
  if (!rule.nextCheckInAt) return null;
  const next = new Date(rule.nextCheckInAt);
  return Number.isNaN(next.getTime()) ? null : addDays(next, -rule.periodDays);
}

export const stateLabel: Record<HandoffRule['state'], string> = {
  active: 'Active',
  warning: 'Warning',
  released_timer: 'Released by timer',
  released_quorum: 'Released by witnesses',
  revoked: 'Revoked',
};

export function badgeState(state: HandoffRule['state']): 'active' | 'warning' | 'released' | 'revoked' {
  return state === 'released_timer' || state === 'released_quorum' ? 'released' : state;
}
