/** Copy comes from docs/design/output/emails.md. No email ever contains a file or folder name. */
export function verifyEmail(link: string): { subject: string; text: string } {
  return {
    subject: 'Verify your email for CrypticStorage',
    text: `Open the link to finish creating your safe. If you did not sign up, ignore this and nothing will happen.\n\n${link}\n`,
  };
}

export function witnessInvitation(ownerName: string, link: string): { subject: string; text: string } {
  return {
    subject: `${ownerName} asked you to be a witness`,
    text: `Together with others they name, you could release their items to the people they chose, and you could never read those items yourself. Open the link to accept or decline.\n\n${link}\n`,
  };
}

export function recipientNotice(ownerName: string, link: string): { subject: string; text: string } {
  return {
    subject: `${ownerName} has set something aside for you`,
    text: `You will receive it on their terms. There is nothing to do now.\n\n${link}\n`,
  };
}

export function ruleRevoked(ownerName: string, link: string): { subject: string; text: string } {
  return {
    subject: 'A handoff rule naming you was withdrawn',
    text: `${ownerName} withdrew a rule that named you. Nothing will be released from it.\n\n${link}\n`,
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "13 Oct 2026", in UTC so the same instant reads the same on every server. */
export function mailDate(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "A", "A and B", "A, B and C". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** 365 -> "1 year", 1825 -> "5 years", 3650 -> "10 years", otherwise "n days". */
export function periodLabel(days: number): string {
  if (days === 365) return '1 year';
  if (days === 1825) return '5 years';
  if (days === 3650) return '10 years';
  return `${days} days`;
}

export interface ReminderInput {
  recipients: string;
  date: string;
  link: string;
}

export function reminder75(i: ReminderInput & { lastActivity: string }): { subject: string; text: string } {
  return {
    subject: `A handoff rule releases on ${i.date}`,
    text: `You have not signed in since ${i.lastActivity}, so a rule you made will release to ${i.recipients} on ${i.date}. Sign in, or follow this link, to reset the clock.\n\n${i.link}\n`,
  };
}

export function reminder90(i: ReminderInput & { days: number }): { subject: string; text: string } {
  return {
    subject: `A handoff rule releases in ${i.days === 1 ? '1 day' : `${i.days} days`}`,
    text: `This is your second reminder; ${i.recipients} receive what the rule covers on ${i.date}. Following this link resets the clock, and nothing else is needed.\n\n${i.link}\n`,
  };
}

export function finalWarning(i: ReminderInput): { subject: string; text: string } {
  return {
    subject: `Final notice: a handoff rule releases on ${i.date}`,
    text: `If you do not sign in or follow this link by then, ${i.recipients} will receive what the rule covers. This is the last email before it happens.\n\n${i.link}\n`,
  };
}

export function releasedByTimerOwner(i: { period: string; recipients: string; date: string; link: string }): { subject: string; text: string } {
  return {
    subject: 'A handoff rule has released',
    text: `After ${i.period} without a sign-in, a rule you made released to ${i.recipients} on ${i.date}. Your own copies are unchanged.\n\n${i.link}\n`,
  };
}

export function releasedByTimerRecipient(ownerName: string, link: string): { subject: string; text: string } {
  return {
    subject: `${ownerName} has handed something to you`,
    text: `It released on ${ownerName}'s terms and is now in Shared with me. Sign in to open it.\n\n${link}\n`,
  };
}
