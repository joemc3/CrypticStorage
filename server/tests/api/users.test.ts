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

  it('changes the email with password confirmation and refuses taken addresses', async () => {
    const user = await registerUser();
    const other = await registerUser();
    expect((await api().patch('/api/users/profile').set(bearer(user)).send({ email: other.email, currentPasswordHash: user.passwordHash })).status).toBe(409);
    const ok = await api().patch('/api/users/profile').set(bearer(user)).send({ email: 'New@Example.com', currentPasswordHash: user.passwordHash });
    expect(ok.status).toBe(200);
    expect(ok.body.data.email).toBe('new@example.com');
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
