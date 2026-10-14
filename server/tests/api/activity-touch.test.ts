import { api, bearer, closeDatabase, prepareDatabase, registerUser } from '../helpers/api';
import { prisma } from '../../src/config/prisma';

beforeEach(prepareDatabase);
afterAll(closeDatabase);

describe('activity touch', () => {
  const lastActivity = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).lastActivityAt.getTime();

  it('updates lastActivityAt at most once per five minutes', async () => {
    const user = await registerUser();
    const initial = await lastActivity(user.id);

    await api().get('/api/users/profile').set(bearer(user));
    expect(await lastActivity(user.id)).toBe(initial);

    const stale = new Date(Date.now() - 6 * 60_000);
    await prisma.user.update({ where: { id: user.id }, data: { lastActivityAt: stale } });
    await api().get('/api/users/profile').set(bearer(user));
    const touched = await lastActivity(user.id);
    expect(touched).toBeGreaterThan(stale.getTime() + 5 * 60_000);

    await api().get('/api/users/profile').set(bearer(user));
    expect(await lastActivity(user.id)).toBe(touched);
  });
});
