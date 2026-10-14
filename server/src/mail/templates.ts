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

/** "13 Oct 2026, 14:05 UTC", in UTC for the same reason as `mailDate`. */
export function mailTime(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${mailDate(d)}, ${hh}:${mm} UTC`;
}

export function requestOpenedOwner(i: { witness: string; time: string; k: number; link: string }): { subject: string; text: string } {
  return {
    subject: 'A witness asked to release your items',
    text: `${i.witness} opened a release request at ${i.time}. Sign in to cancel it; if ${i.k} witnesses vote first, what you marked is released.\n\n${i.link}\n`,
  };
}

export function requestOpenedWitness(i: { witness: string; owner: string; link: string }): { subject: string; text: string } {
  return {
    subject: `${i.witness} asked to release ${i.owner}'s items`,
    text: `You can add your vote or refuse. If ${i.owner} signs in, the request is cancelled.\n\n${i.link}\n`,
  };
}

export function voteAdded(i: { witness: string; time: string; count: number; k: number; link: string }): { subject: string; text: string } {
  return {
    subject: `Release request: ${i.count} of ${i.k} votes`,
    text: `${i.witness} added a vote at ${i.time}. Sign in now to cancel the request.\n\n${i.link}\n`,
  };
}

export function releaseCompleted(i: { k: number; time: string; link: string }): { subject: string; text: string } {
  return {
    subject: 'Your witnesses released your items',
    text: `${i.k} witnesses voted, and what you marked went to the people you named at ${i.time}. Your own copies are unchanged.\n\n${i.link}\n`,
  };
}

export function requestCancelled(owner: string, link: string): { subject: string; text: string } {
  return {
    subject: `${owner} signed in, so the request is cancelled`,
    text: `Nothing was released. There is nothing for you to do.\n\n${link}\n`,
  };
}

/** Recipient copy after a quorum release; emails.md has no separate quorum copy, so this is the timer one. */
export const releasedRecipient = releasedByTimerRecipient;
