import { authenticator } from 'otplib';
import { prisma } from '../../src/config/prisma';
import * as mail from '../../src/lib/mail';
import { outbox } from '../../src/lib/mail';
import { runCleanup } from '../../src/jobs/cleanup';
import { api, bearer, closeDatabase, prepareDatabase, registerUser, registrationPayload, verificationToken } from '../helpers/api';

beforeEach(prepareDatabase);
afterAll(closeDatabase);

describe('POST /api/auth/register', () => {
  it('refuses without the contract phrase', async () => {
    const { contractPhrase: _omit, ...without } = registrationPayload();
    const missing = await api().post('/api/auth/register').send(without);
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('CONTRACT_NOT_ACKNOWLEDGED');
    const wrong = await api().post('/api/auth/register').send(registrationPayload({ contractPhrase: 'i understand there is no way back' }));
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe('CONTRACT_NOT_ACKNOWLEDGED');
    expect(outbox()).toHaveLength(0);
  });

  it('creates an unverified account, sends one mail and issues no tokens', async () => {
    const payload = registrationPayload({ displayName: 'Ada' });
    const res = await api().post('/api/auth/register').send(payload);
    expect(res.status).toBe(201);
    expect(res.body.data.verificationRequired).toBe(true);
    expect(res.body.data).not.toHaveProperty('tokens');
    expect(res.body.data).not.toHaveProperty('user');
    const mails = outbox().filter((m) => m.to === payload.email);
    expect(mails).toHaveLength(1);
    expect(outbox()).toHaveLength(1);
    expect(mails[0]!.text).toContain('/verify/');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: payload.email } });
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.contractAcknowledgedAt).not.toBeNull();
    expect(user.displayName).toBe('Ada');
  });

  it('still answers 201 when the verification mail cannot be sent', async () => {
    const spy = jest.spyOn(mail, 'sendMail').mockRejectedValue(new Error('smtp down'));
    try {
      const payload = registrationPayload();
      const res = await api().post('/api/auth/register').send(payload);
      expect(res.status).toBe(201);
      expect(res.body.data.verificationRequired).toBe(true);
      expect(spy).toHaveBeenCalled();
      const user = await prisma.user.findUniqueOrThrow({ where: { email: payload.email } });
      expect(user.emailVerifiedAt).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it('rejects a duplicate email', async () => {
    const payload = registrationPayload();
    await api().post('/api/auth/register').send(payload);
    const res = await api().post('/api/auth/register').send({ ...registrationPayload(), email: payload.email.toUpperCase() });
    expect(res.status).toBe(409);
  });

  it('validates the body', async () => {
    const res = await api().post('/api/auth/register').send({ email: 'nope', passwordHash: 'short' });
    expect(res.status).toBe(422);
    expect(res.body.errors).toHaveProperty('email');
    expect(res.body.errors).toHaveProperty('publicKey');
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with the right credential and returns the vault', async () => {
    const user = await registerUser();
    const res = await api().post('/api/auth/login').send({ email: user.email, passwordHash: user.passwordHash });
    expect(res.status).toBe(200);
    expect(res.body.data.requiresTwoFactor).toBe(false);
    expect(res.body.data.user.wrappedMasterKey).toEqual(expect.any(String));
    expect(res.body.data.user.kdfIterations).toBe(600000);
    expect(res.body.data.tokens.accessToken).toEqual(expect.any(String));
  });

  it('rejects a wrong credential and unknown users identically', async () => {
    const user = await registerUser();
    const wrong = await api().post('/api/auth/login').send({ email: user.email, passwordHash: 'x'.repeat(64) });
    const unknown = await api().post('/api/auth/login').send({ email: 'nobody@example.com', passwordHash: 'x'.repeat(64) });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });
});

describe('token lifecycle', () => {
  it('protects routes, refreshes with rotation, and logs out', async () => {
    const user = await registerUser();

    expect((await api().get('/api/users/profile')).status).toBe(401);
    expect((await api().get('/api/users/profile').set(bearer(user))).status).toBe(200);

    const refreshed = await api().post('/api/auth/refresh').send({ refreshToken: user.refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.refreshToken).not.toBe(user.refreshToken);

    // Old refresh token is dead after rotation.
    expect((await api().post('/api/auth/refresh').send({ refreshToken: user.refreshToken })).status).toBe(401);
    // New access token works.
    expect((await api().get('/api/users/profile').set(bearer(refreshed.body.data.accessToken))).status).toBe(200);

    const logout = await api().post('/api/auth/logout').set(bearer(refreshed.body.data.accessToken));
    expect(logout.status).toBe(200);
    expect((await api().get('/api/users/profile').set(bearer(refreshed.body.data.accessToken))).status).toBe(401);
    expect((await api().post('/api/auth/refresh').send({ refreshToken: refreshed.body.data.refreshToken })).status).toBe(401);
  });

  it('rejects garbage tokens', async () => {
    expect((await api().get('/api/users/profile').set(bearer('not-a-jwt'))).status).toBe(401);
  });
});

describe('two-factor authentication', () => {
  async function enable2fa(user: Awaited<ReturnType<typeof registerUser>>) {
    const setup = await api().post('/api/users/2fa/setup').set(bearer(user));
    expect(setup.status).toBe(200);
    expect(setup.body.data.qrCode).toMatch(/^data:image\/png;base64,/);
    const secret: string = setup.body.data.secret;

    const bad = await api().post('/api/users/2fa/enable').set(bearer(user)).send({ token: '000000' });
    expect(bad.status).toBe(401);

    const enable = await api().post('/api/users/2fa/enable').set(bearer(user)).send({ token: authenticator.generate(secret) });
    expect(enable.status).toBe(200);
    expect(enable.body.data.backupCodes).toHaveLength(8);
    return { secret, backupCodes: enable.body.data.backupCodes as string[] };
  }

  it('requires a second step at login and accepts a TOTP code', async () => {
    const user = await registerUser();
    const { secret } = await enable2fa(user);

    const login = await api().post('/api/auth/login').send({ email: user.email, passwordHash: user.passwordHash });
    expect(login.status).toBe(200);
    expect(login.body.data.requiresTwoFactor).toBe(true);
    expect(login.body.data.user.wrappedMasterKey).toBe(''); // vault withheld until verified
    const challenge: string = login.body.data.tokens.accessToken;

    // The challenge token cannot be used as a session.
    expect((await api().get('/api/users/profile').set(bearer(challenge))).status).toBe(401);

    const wrong = await api().post('/api/auth/verify-2fa').set(bearer(challenge)).send({ token: '123456' });
    expect(wrong.status).toBe(401);

    const ok = await api().post('/api/auth/verify-2fa').set(bearer(challenge)).send({ token: authenticator.generate(secret) });
    expect(ok.status).toBe(200);
    expect(ok.body.data.requiresTwoFactor).toBe(false);
    expect(ok.body.data.user.wrappedMasterKey).not.toBe('');
    expect((await api().get('/api/users/profile').set(bearer(ok.body.data.tokens.accessToken))).status).toBe(200);
    // Challenge is single-use.
    expect((await api().post('/api/auth/verify-2fa').set(bearer(challenge)).send({ token: authenticator.generate(secret) })).status).toBe(401);
  });

  it('accepts each backup code exactly once', async () => {
    const user = await registerUser();
    const { backupCodes } = await enable2fa(user);
    const code = backupCodes[0]!;

    const login1 = await api().post('/api/auth/login').send({ email: user.email, passwordHash: user.passwordHash });
    const first = await api().post('/api/auth/verify-2fa').set(bearer(login1.body.data.tokens.accessToken)).send({ backupCode: code.toLowerCase() });
    expect(first.status).toBe(200);

    const login2 = await api().post('/api/auth/login').send({ email: user.email, passwordHash: user.passwordHash });
    const second = await api().post('/api/auth/verify-2fa').set(bearer(login2.body.data.tokens.accessToken)).send({ backupCode: code });
    expect(second.status).toBe(401);
  });

  it('can be disabled with a code and the password', async () => {
    const user = await registerUser();
    const { secret } = await enable2fa(user);
    const res = await api()
      .post('/api/users/2fa/disable')
      .set(bearer(user))
      .send({ token: authenticator.generate(secret), passwordHash: user.passwordHash });
    expect(res.status).toBe(200);
    const login = await api().post('/api/auth/login').send({ email: user.email, passwordHash: user.passwordHash });
    expect(login.body.data.requiresTwoFactor).toBe(false);
  });
});

describe('email verification', () => {
  async function signUp() {
    const payload = registrationPayload();
    expect((await api().post('/api/auth/register').send(payload)).status).toBe(201);
    return payload;
  }
  const login = (p: { email: string; passwordHash: string }) => api().post('/api/auth/login').send({ email: p.email, passwordHash: p.passwordHash });

  it('gates login until the email is verified', async () => {
    const p = await signUp();
    const blocked = await login(p);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('EMAIL_UNVERIFIED');
    const wrong = await login({ email: p.email, passwordHash: 'x'.repeat(64) });
    expect(wrong.status).toBe(401);

    const verify = await api().post('/api/auth/verify-email').send({ token: verificationToken(p.email) });
    expect(verify.status).toBe(200);
    expect(verify.body.data).toEqual({ email: p.email });
    const ok = await login(p);
    expect(ok.status).toBe(200);
    expect(ok.body.data.tokens.accessToken).toEqual(expect.any(String));
  });

  it('accepts a token once and rejects garbage', async () => {
    const p = await signUp();
    const token = verificationToken(p.email);
    expect((await api().post('/api/auth/verify-email').send({ token })).status).toBe(200);
    const again = await api().post('/api/auth/verify-email').send({ token });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('TOKEN_INVALID');
    const junk = await api().post('/api/auth/verify-email').send({ token: 'g'.repeat(40) });
    expect(junk.status).toBe(400);
    expect(junk.body.code).toBe('TOKEN_INVALID');
  });

  it('resends only for an existing unverified account', async () => {
    const p = await signUp();
    const resend = (email: string) => api().post('/api/auth/resend-verification').send({ email });

    expect((await resend('nobody@example.com')).status).toBe(202);
    expect(outbox()).toHaveLength(1);

    expect((await resend(p.email)).status).toBe(202);
    expect(outbox()).toHaveLength(2);

    await api().post('/api/auth/verify-email').send({ token: verificationToken(p.email) });
    expect((await resend(p.email)).status).toBe(202);
    expect(outbox()).toHaveLength(2);
  });

  it('cleanup removes stale unverified accounts only', async () => {
    const stale = await signUp();
    const fresh = await signUp();
    const old = await registerUser();
    const eightDays = new Date(Date.now() - 8 * 86_400_000);
    await prisma.user.updateMany({ where: { email: { in: [stale.email, old.email] } }, data: { createdAt: eightDays } });

    const result = await runCleanup();
    expect(result.unverifiedUsers).toBe(1);
    expect(await prisma.user.findUnique({ where: { email: stale.email } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { email: fresh.email } })).not.toBeNull();
    expect(await prisma.user.findUnique({ where: { email: old.email } })).not.toBeNull();
  });
});
