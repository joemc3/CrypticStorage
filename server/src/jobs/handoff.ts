import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { audit } from '../lib/audit';
import { sendMail } from '../lib/mail';
import { now as clockNow } from '../lib/clock';
import { randomToken, sha256Hex } from '../lib/crypto';
import { nextCheckInAt } from '../modules/handoff/service';
import { STAMP_FIELDS, WARNING_FRACTIONS, type Level } from '../modules/handoff/thresholds';
import { finalWarning, joinNames, mailDate, periodLabel, releasedByTimerOwner, releasedByTimerRecipient, reminder75, reminder90 } from '../mail/templates';

const DAY_MS = 86_400_000;
const CHECK_IN_TOKEN_TTL_MS = 30 * DAY_MS;


const OPEN = ['active', 'warning'] as const;
const person = { id: true, email: true, displayName: true } as const;
const name = (p: { email: string; displayName: string | null }) => p.displayName ?? p.email;

interface Pending {
  ruleId: string;
  /** Stamp fields this tick wrote, so a failed send can undo exactly those. */
  wrote: Level[];
  stamped: Date;
  level: Level;
  releaseAt: Date;
  recipients: string[];
}

/**
 * One pass of the dead-man's switch. Safe to run concurrently with itself: every state change is
 * claimed with a conditional update, and only the run that wins the claim sends the mail.
 */
export async function runHandoffTimer(now: () => Date = clockNow): Promise<{ warned: number; released: number }> {
  const at = now();
  const rules = await prisma.handoffRule.findMany({
    where: { state: { in: [...OPEN] } },
    include: { owner: { select: { ...person, lastActivityAt: true } }, recipients: { include: { user: { select: person } } } },
    orderBy: { createdAt: 'asc' },
  });

  let released = 0;
  let warned = 0;
  // owner id -> level -> the rules that crossed it this tick
  const pending = new Map<string, { owner: (typeof rules)[number]['owner']; byLevel: Map<Level, Pending[]> }>();

  for (const rule of rules) {
    const period = rule.periodDays * DAY_MS;
    const elapsed = at.getTime() - rule.owner.lastActivityAt.getTime();
    const recipients = rule.recipients.map((r) => name(r.user));
    const releaseAt = nextCheckInAt(rule.owner.lastActivityAt, rule.periodDays);

    if (elapsed >= period) {
      // Not claimed if the owner was seen, or the rule revoked, since we read it.
      const claim = await prisma.handoffRule.updateMany({
        where: { id: rule.id, state: { in: [...OPEN] }, owner: { lastActivityAt: { lte: new Date(at.getTime() - period) } } },
        data: { state: 'released_timer', releasedAt: at },
      });
      if (claim.count === 0) continue;
      released += 1;
      await sendReleaseMails(rule, recipients, at);
      audit(undefined, {
        userId: rule.owner.id,
        action: 'handoff.rule.released_timer',
        resourceType: 'handoff_rule',
        resourceId: rule.id,
        metadata: { periodDays: rule.periodDays, recipients: rule.recipients.length },
      });
      continue;
    }

    const stamps = { 75: rule.reminded75At, 90: rule.reminded90At, 95: rule.reminded95At } as const;
    const passed = ([75, 90, 95] as const).filter((l) => elapsed >= period * WARNING_FRACTIONS[l]);
    const due = passed.filter((l) => stamps[l] === null);
    if (due.length === 0) continue;
    const top = due[due.length - 1]!;
    const stampField = STAMP_FIELDS;

    const claim = await prisma.handoffRule.updateMany({
      // The owner's activity must still be the value we read, or this reminder would be for someone just seen.
      where: { id: rule.id, state: { in: [...OPEN] }, [stampField[top]]: null, owner: { lastActivityAt: rule.owner.lastActivityAt } },
      data: {
        state: 'warning',
        ...(passed.includes(75) ? { reminded75At: rule.reminded75At ?? at } : {}),
        ...(passed.includes(90) ? { reminded90At: rule.reminded90At ?? at } : {}),
        ...(passed.includes(95) ? { reminded95At: rule.reminded95At ?? at } : {}),
      },
    });
    if (claim.count === 0) continue;
    warned += 1;
    const entry = pending.get(rule.owner.id) ?? { owner: rule.owner, byLevel: new Map() };
    entry.byLevel.set(top, [...(entry.byLevel.get(top) ?? []), { ruleId: rule.id, wrote: due, stamped: at, level: top, releaseAt, recipients }]);
    pending.set(rule.owner.id, entry);
  }

  for (const { owner, byLevel } of pending.values()) {
    let link: string | undefined;
    try {
      // One token per owner per tick, shared by every reminder that goes out in it.
      const token = randomToken(32);
      await prisma.emailToken.create({
        data: { userId: owner.id, purpose: 'check_in', tokenHash: sha256Hex(token), expiresAt: new Date(at.getTime() + CHECK_IN_TOKEN_TTL_MS) },
      });
      link = `${env.APP_URL}/check-in/${token}`;
    } catch (err) {
      logger.warn({ err, userId: owner.id }, 'check-in token not created');
      for (const group of byLevel.values()) await rollback(group);
      continue;
    }
    for (const [level, group] of byLevel) {
      const date = mailDate(new Date(Math.min(...group.map((g) => g.releaseAt.getTime()))));
      const recipients = joinNames([...new Set(group.flatMap((g) => g.recipients))]);
      const days = Math.max(1, Math.ceil((Math.min(...group.map((g) => g.releaseAt.getTime())) - at.getTime()) / DAY_MS));
      const common = { recipients, date, link: link! };
      const mail =
        level === 75
          ? reminder75({ ...common, lastActivity: mailDate(owner.lastActivityAt) })
          : level === 90
            ? reminder90({ ...common, days })
            : finalWarning(common);
      try {
        await sendMail({ to: owner.email, ...mail });
      } catch (err) {
        // Give the stamps back so the next tick tries again; a lost final warning would mean release without notice.
        logger.warn({ err, userId: owner.id, level }, 'reminder not sent');
        await rollback(group);
        warned -= group.length;
      }
    }
  }
  return { warned, released };
}

/** Undo this tick's stamps, matching the value written so a concurrent tick's claim is not touched. */
async function rollback(group: Pending[]): Promise<void> {
  for (const p of group) {
    try {
      for (const level of p.wrote) {
        await prisma.handoffRule.updateMany({ where: { id: p.ruleId, [STAMP_FIELDS[level]]: p.stamped }, data: { [STAMP_FIELDS[level]]: null } });
      }
      await prisma.handoffRule.updateMany({
        where: { id: p.ruleId, state: 'warning', reminded75At: null, reminded90At: null, reminded95At: null },
        data: { state: 'active' },
      });
    } catch (err) {
      logger.warn({ err, ruleId: p.ruleId }, 'reminder stamps not rolled back');
    }
  }
}

async function sendReleaseMails(
  rule: { periodDays: number; owner: { email: string; displayName: string | null }; recipients: Array<{ user: { email: string } }> },
  recipientNames: string[],
  at: Date
): Promise<void> {
  try {
    await sendMail({
      to: rule.owner.email,
      ...releasedByTimerOwner({ period: periodLabel(rule.periodDays), recipients: joinNames(recipientNames), date: mailDate(at), link: `${env.APP_URL}/dashboard` }),
    });
  } catch (err) {
    logger.warn({ err }, 'release mail to owner not sent');
  }
  for (const r of rule.recipients) {
    try {
      await sendMail({ to: r.user.email, ...releasedByTimerRecipient(name(rule.owner), `${env.APP_URL}/shared`) });
    } catch (err) {
      logger.warn({ err }, 'release mail to recipient not sent');
    }
  }
}

export function startHandoffJob(intervalMs = 15 * 60_000, now?: () => Date): () => void {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    runHandoffTimer(now)
      .then((r) => {
        if (r.warned || r.released) logger.info(r, 'handoff timer');
      })
      .catch((err) => logger.warn({ err }, 'handoff timer failed'))
      .finally(() => {
        running = false;
      });
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  const first = setTimeout(tick, 10_000);
  first.unref();
  return () => {
    clearInterval(timer);
    clearTimeout(first);
  };
}
