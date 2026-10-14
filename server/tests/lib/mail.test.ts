import { sendMail, outbox, clearOutbox } from '../../src/lib/mail';
import { verifyEmail } from '../../src/mail/templates';
import { api } from '../helpers/api';

describe('mail log driver', () => {
  beforeEach(() => clearOutbox());

  it('stores a sent message and returns it from outbox()', async () => {
    await sendMail({ to: 'a@example.com', subject: 'Hello', text: 'Body' });
    const box = outbox();
    expect(box).toHaveLength(1);
    expect(box[0]).toMatchObject({ to: 'a@example.com', subject: 'Hello', text: 'Body' });
    expect(box[0]?.sentAt).toBeInstanceOf(Date);
  });

  it('clearOutbox() empties the outbox', async () => {
    await sendMail({ to: 'a@example.com', subject: 's', text: 't' });
    clearOutbox();
    expect(outbox()).toEqual([]);
  });

  it('keeps only the last 100 messages, newest last', async () => {
    for (let i = 0; i < 101; i++) await sendMail({ to: `u${i}@example.com`, subject: `s${i}`, text: 't' });
    const box = outbox();
    expect(box).toHaveLength(100);
    expect(box[0]?.subject).toBe('s1');
    expect(box[99]?.subject).toBe('s100');
  });
});

describe('verifyEmail template', () => {
  it('has the designed subject and the link exactly once, with no other URL', () => {
    const link = 'https://example.com/verify/abc123';
    const { subject, text } = verifyEmail(link);
    expect(subject).toBe('Verify your email for CrypticStorage');
    expect(text.split(link).length - 1).toBe(1);
    expect(text.replace(link, '')).not.toContain('http');
    expect(text).toContain('Open the link to finish creating your safe. If you did not sign up, ignore this and nothing will happen.');
  });
});

describe('env validation for the smtp mail driver', () => {
  const keys = ['MAIL_DRIVER', 'SMTP_URL', 'MAIL_FROM'] as const;
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => keys.forEach((k) => (saved[k] = process.env[k])));
  afterEach(() =>
    keys.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    })
  );

  it('fails naming SMTP_URL and MAIL_FROM when MAIL_DRIVER=smtp without them', () => {
    process.env.MAIL_DRIVER = 'smtp';
    delete process.env.SMTP_URL;
    delete process.env.MAIL_FROM;
    expect(() => jest.isolateModules(() => require('../../src/config/env'))).toThrow(/SMTP_URL[\s\S]*MAIL_FROM|MAIL_FROM[\s\S]*SMTP_URL/);
  });

  it('loads with the log driver and no SMTP settings', () => {
    process.env.MAIL_DRIVER = 'log';
    delete process.env.SMTP_URL;
    expect(() => jest.isolateModules(() => require('../../src/config/env'))).not.toThrow();
  });
});

describe('GET/DELETE /api/_test/mail', () => {
  beforeEach(() => clearOutbox());

  it('filters by recipient and clears', async () => {
    await sendMail({ to: 'x@example.com', subject: 'one', text: 't' });
    await sendMail({ to: 'y@example.com', subject: 'two', text: 't' });
    const one = await api().get('/api/_test/mail').query({ to: 'x@example.com' });
    expect(one.status).toBe(200);
    expect(one.body.data.map((m: { subject: string }) => m.subject)).toEqual(['one']);
    const all = await api().get('/api/_test/mail');
    expect(all.body.data).toHaveLength(2);
    expect((await api().delete('/api/_test/mail')).status).toBe(200);
    expect(outbox()).toEqual([]);
  });
});
