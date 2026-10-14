import { randomBytes } from 'crypto';
import { api, bearer, closeDatabase, prepareDatabase, registerUser, uploadFile } from '../helpers/api';
import { prisma } from '../../src/config/prisma';
import { storage } from '../../src/storage';

beforeEach(prepareDatabase);
afterAll(closeDatabase);

describe('profile', () => {
  it('returns the public profile without key material', async () => {
    const user = await registerUser();
    const res = await api().get('/api/users/profile').set(bearer(user));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: user.id, email: user.email, twoFactorEnabled: false });
    expect(res.body.data).not.toHaveProperty('wrappedMasterKey');
    expect(res.body.data).not.toHaveProperty('passwordHash');
  });

  it('changes the password, re-wraps the vault and logs out other sessions', async () => {
    const user = await registerUser();
    const other = await api().post('/api/auth/login').send({ email: user.email, passwordHash: user.passwordHash });
    const otherToken = other.body.data.tokens.accessToken;

    const next = { passwordHash: randomBytes(32).toString('hex'), salt: randomBytes(16).toString('base64'), wrapped: JSON.stringify({ data: 'new', iv: 'new' }) };
    const missing = await api().patch('/api/users/profile').set(bearer(user)).send({ newPasswordHash: next.passwordHash, salt: next.salt, wrappedMasterKey: next.wrapped });
    expect(missing.status).toBe(422);

    const wrong = await api().patch('/api/users/profile').set(bearer(user)).send({ currentPasswordHash: 'x'.repeat(64), newPasswordHash: next.passwordHash, salt: next.salt, wrappedMasterKey: next.wrapped });
    expect(wrong.status).toBe(401);

    const ok = await api().patch('/api/users/profile').set(bearer(user)).send({ currentPasswordHash: user.passwordHash, newPasswordHash: next.passwordHash, salt: next.salt, wrappedMasterKey: next.wrapped });
    expect(ok.status).toBe(200);

    expect((await api().post('/api/auth/login').send({ email: user.email, passwordHash: user.passwordHash })).status).toBe(401);
    const login = await api().post('/api/auth/login').send({ email: user.email, passwordHash: next.passwordHash });
    expect(login.status).toBe(200);
    expect(login.body.data.user.wrappedMasterKey).toBe(next.wrapped);
    expect(login.body.data.user.salt).toBe(next.salt);

    expect((await api().get('/api/users/profile').set(bearer(user))).status).toBe(200); // current session kept
    expect((await api().get('/api/users/profile').set(bearer(otherToken))).status).toBe(401); // others revoked
  });

  it('does not change the email, even with password confirmation', async () => {
    const user = await registerUser();
    const res = await api().patch('/api/users/profile').set(bearer(user)).send({ email: 'New@Example.com', currentPasswordHash: user.passwordHash });
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(user.email);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email).toBe(user.email);
  });

  it('reports displayName, lockAfterMinutes and emailVerifiedAt', async () => {
    const user = await registerUser();
    const res = await api().get('/api/users/profile').set(bearer(user));
    expect(res.body.data.displayName).toBeNull();
    expect(res.body.data.lockAfterMinutes).toBe(5);
    expect(typeof res.body.data.emailVerifiedAt).toBe('string');
  });

  it('sets and clears the display name without a password', async () => {
    const user = await registerUser();
    const set = await api().patch('/api/users/profile').set(bearer(user)).send({ displayName: 'Joe' });
    expect(set.status).toBe(200);
    expect((await api().get('/api/users/profile').set(bearer(user))).body.data.displayName).toBe('Joe');
    const cleared = await api().patch('/api/users/profile').set(bearer(user)).send({ displayName: null });
    expect(cleared.status).toBe(200);
    expect((await api().get('/api/users/profile').set(bearer(user))).body.data.displayName).toBeNull();
  });

  it('rejects a display name longer than 64 characters', async () => {
    const user = await registerUser();
    const res = await api().patch('/api/users/profile').set(bearer(user)).send({ displayName: 'a'.repeat(65) });
    expect(res.status).toBe(422);
  });

  it('bounds lockAfterMinutes to 1..30', async () => {
    const user = await registerUser();
    const patch = (n: number) => api().patch('/api/users/profile').set(bearer(user)).send({ lockAfterMinutes: n });
    expect((await patch(0)).status).toBe(422);
    expect((await patch(31)).status).toBe(422);
    const low = await patch(1);
    expect(low.status).toBe(200);
    expect(low.body.data.lockAfterMinutes).toBe(1);
    expect((await patch(30)).status).toBe(200);
  });

  it('deletes the account together with its files and bytes', async () => {
    const user = await registerUser();
    const file = await uploadFile(user, randomBytes(64));
    const key = (await prisma.file.findUniqueOrThrow({ where: { id: file.id } })).storageKey;

    expect((await api().delete('/api/users/profile').set(bearer(user)).send({ passwordHash: 'y'.repeat(64) })).status).toBe(401);
    expect((await api().delete('/api/users/profile').set(bearer(user)).send({ passwordHash: user.passwordHash })).status).toBe(200);

    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.file.count()).toBe(0);
    expect(await storage().stat(key)).toBeNull();
    expect((await api().post('/api/auth/login').send({ email: user.email, passwordHash: user.passwordHash })).status).toBe(401);
  });
});

describe('health', () => {
  it('reports ok', async () => {
    const res = await api().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'ok', storage: 'local' });
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await api().get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
