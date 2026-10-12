import { randomBytes } from 'crypto';
import { api, bearer, closeDatabase, prepareDatabase, registerUser, uploadFile } from '../helpers/api';
import { storage } from '../../src/storage';
import { prisma } from '../../src/config/prisma';

beforeEach(prepareDatabase);
afterAll(closeDatabase);

const name = { encryptedName: 'enc-name', encryptedNameIV: 'ivivivivivivivivi' };

async function mkdir(user: Awaited<ReturnType<typeof registerUser>>, parentId?: string) {
  const res = await api().post('/api/folders').set(bearer(user)).send({ ...name, parentId });
  expect(res.status).toBe(201);
  return res.body.data as { id: string; parentId?: string };
}

describe('folders', () => {
  it('creates, lists by parent, renames and moves', async () => {
    const user = await registerUser();
    const root = await mkdir(user);
    const child = await mkdir(user, root.id);

    expect((await api().get('/api/folders').set(bearer(user))).body.data.map((f: { id: string }) => f.id)).toEqual([root.id]);
    expect((await api().get('/api/folders').query({ parentId: root.id }).set(bearer(user))).body.data.map((f: { id: string }) => f.id)).toEqual([child.id]);

    const renamed = await api().patch(`/api/folders/${root.id}`).set(bearer(user)).send({ encryptedName: 'renamed', encryptedNameIV: 'ivivivivivivivivi' });
    expect(renamed.body.data.encryptedName).toBe('renamed');

    const moved = await api().post(`/api/folders/${child.id}/move`).set(bearer(user)).send({ parentId: null });
    expect(moved.body.data.parentId).toBeUndefined();
    expect((await api().get('/api/folders').set(bearer(user))).body.data).toHaveLength(2);
  });

  it('refuses cycles', async () => {
    const user = await registerUser();
    const a = await mkdir(user);
    const b = await mkdir(user, a.id);
    const c = await mkdir(user, b.id);
    expect((await api().post(`/api/folders/${a.id}/move`).set(bearer(user)).send({ parentId: c.id })).status).toBe(400);
    expect((await api().post(`/api/folders/${a.id}/move`).set(bearer(user)).send({ parentId: a.id })).status).toBe(400);
  });

  it('is private per user', async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const folder = await mkdir(alice);
    expect((await api().get(`/api/folders/${folder.id}`).set(bearer(bob))).status).toBe(404);
    expect((await api().post('/api/folders').set(bearer(bob)).send({ ...name, parentId: folder.id })).status).toBe(404);
  });

  it('deletes a subtree, its files, their bytes and the quota they used', async () => {
    const user = await registerUser();
    const a = await mkdir(user);
    const b = await mkdir(user, a.id);
    const f1 = await uploadFile(user, randomBytes(100), { folderId: a.id });
    const f2 = await uploadFile(user, randomBytes(200), { folderId: b.id });
    const keep = await uploadFile(user, randomBytes(50));

    const keys = await prisma.file.findMany({ where: { id: { in: [f1.id, f2.id] } }, select: { storageKey: true } });
    expect(await storage().stat(keys[0]!.storageKey)).not.toBeNull();

    expect((await api().delete(`/api/folders/${a.id}`).set(bearer(user))).status).toBe(200);
    expect((await api().get(`/api/folders/${b.id}`).set(bearer(user))).status).toBe(404);
    expect((await api().get(`/api/files/${f2.id}`).set(bearer(user))).status).toBe(404);
    expect((await api().get(`/api/files/${keep.id}`).set(bearer(user))).status).toBe(200);
    for (const k of keys) expect(await storage().stat(k.storageKey)).toBeNull();
    expect((await api().get('/api/storage/stats').set(bearer(user))).body.data).toMatchObject({ used: 50, fileCount: 1, folderCount: 0 });
  });
});
