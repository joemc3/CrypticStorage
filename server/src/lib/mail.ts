import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from './logger';

export interface MailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailMessage extends MailInput {
  sentAt: Date;
}

const OUTBOX_LIMIT = 100;
const messages: MailMessage[] = [];
let transport: Transporter | null = null;

function smtp(): Transporter {
  transport ??= nodemailer.createTransport(env.SMTP_URL);
  return transport;
}

export async function sendMail(input: MailInput): Promise<void> {
  if (env.MAIL_DRIVER === 'smtp') {
    await smtp().sendMail({ from: env.MAIL_FROM, to: input.to, subject: input.subject, text: input.text, html: input.html });
    return;
  }
  // Log only the envelope: the body carries a one-time link.
  logger.info({ to: input.to, subject: input.subject }, 'mail (log driver)');
  messages.push({ ...input, sentAt: new Date() });
  if (messages.length > OUTBOX_LIMIT) messages.splice(0, messages.length - OUTBOX_LIMIT);
}

/** Messages held by the log driver, newest last. Always empty under the smtp driver. */
export function outbox(): MailMessage[] {
  return [...messages];
}

export function clearOutbox(): void {
  messages.length = 0;
}
