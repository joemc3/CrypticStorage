import { randomBytes } from 'crypto';
import { api, bearer, closeDatabase, downloadFile, fileMetadata, prepareDatabase, registerUser, uploadFile } from '../helpers/api';
import { prisma } from '../../src/config/prisma';

beforeEach(prepareDatabase);
afterAll(closeDatabase);

describe('upload flow', () => {
  it('reserves, receives and confirms an upload, then serves the same bytes back', async () => {
    const user = await registerUser();
    const content = randomBytes(300_000);

    const reserve = await api().post('/api/files/upload-url').set(bearer(user)).send(fileMetadata(content.length));
    expect(reserve.status).toBe(201);
    expect(reserve.body.data.uploadUrl).toMatch(/^\/api\/files\/[0-9a-f-]+\/content\?token=/);
    expect(reserve.body.data.method).toBe('PUT');

    // Not listed while pending.
    expect((await api().get('/api/files').set(bearer(user))).body.data).toHaveLength(0);
    // Confirm before any bytes arrive fails cleanly.
    expect((await api().post(`/api/files/${reserve.body.data.fileId}/confirm`).set(bearer(user))).status).toBe(400);

    const put = await api().put(reserve.body.data.uploadUrl).set('Content-Type', 'application/octet-stream').send(content);
    expect(put.status).toBe(204);

    const confirm = await api().post(`/api/files/${reserve.body.data.fileId}/confirm`).set(bearer(user));
    expect(confirm.status).toBe(200);
    expect(confirm.body.data).toMatchObject({ id: reserve.body.data.fileId, status: 'READY', encryptedSize: content.length });
    expect(confirm.body.data).not.toHaveProperty('storageKey');

    const list = await api().get('/api/files').set(bearer(user));
    expect(list.body.data).toHaveLength(1);

    const profile = await api().get('/api/users/profile').set(bearer(user));
    expect(profile.body.data.storageUsed).toBe(content.length);

    const downloaded = await downloadFile(user, reserve.body.data.fileId);
    expect(downloaded.equals(content)).toBe(true);
  });

  it('rejects uploads that do not match the declared size', async () => {
    const user = await registerUser();
    const reserve = await api().post('/api/files/upload-url').set(bearer(user)).send(fileMetadata(100));

    const tooBig = await api().put(reserve.body.data.uploadUrl).set('Content-Type', 'application/octet-stream').send(randomBytes(101));
    expect([400, 413]).toContain(tooBig.status);

    const tooSmall = await api().put(reserve.body.data.uploadUrl).set('Content-Type', 'application/octet-stream').send(randomBytes(99));
    expect(tooSmall.status).toBe(400);

    const confirm = await api().post(`/api/files/${reserve.body.data.fileId}/confirm`).set(bearer(user));
    expect(confirm.status).toBe(400);
  });

  it('rejects an upload token for a different file and a download token used for upload', async () => {
    const user = await registerUser();
    const a = await api().post('/api/files/upload-url').set(bearer(user)).send(fileMetadata(10));
    const b = await api().post('/api/files/upload-url').set(bearer(user)).send(fileMetadata(10));
    const tokenA = new URL(a.body.data.uploadUrl, 'http://x').searchParams.get('token')!;
    const crossed = await api().put(`/api/files/${b.body.data.fileId}/content?token=${encodeURIComponent(tokenA)}`).send(randomBytes(10));
    expect(crossed.status).toBe(404);

    const file = await uploadFile(user, randomBytes(10));
    const dl = await api().get(`/api/files/${file.id}/download-url`).set(bearer(user));
    const dlToken = new URL(dl.body.data.downloadUrl, 'http://x').searchParams.get('token')!;
    const misuse = await api().put(`/api/files/${file.id}/content?token=${encodeURIComponent(dlToken)}`).send(randomBytes(10));
    expect(misuse.status).toBe(401);
  });

  it('enforces the storage quota at reservation and at confirm', async () => {
    const user = await registerUser();
    await prisma.user.update({ where: { id: user.id }, data: { storageQuota: 1000n } });

    await uploadFile(user, randomBytes(600));
    const over = await api().post('/api/files/upload-url').set(bearer(user)).send(fileMetadata(500));
    expect(over.status).toBe(507);

    // Two concurrent reservations that individually fit but together do not: the second confirm fails.
    const r1 = await api().post('/api/files/upload-url').set(bearer(user)).send(fileMetadata(300));
    const r2 = await api().post('/api/files/upload-url').set(bearer(user)).send(fileMetadata(300));
    await api().put(r1.body.data.uploadUrl).send(randomBytes(300));
    await api().put(r2.body.data.uploadUrl).send(randomBytes(300));
    expect((await api().post(`/api/files/${r1.body.data.fileId}/confirm`).set(bearer(user))).status).toBe(200);
    expect((await api().post(`/api/files/${r2.body.data.fileId}/confirm`).set(bearer(user))).status).toBe(507);
    expect((await api().get(`/api/files/${r2.body.data.fileId}`).set(bearer(user))).status).toBe(404);
  });

  it('allows an empty file', async () => {
    const user = await registerUser();
    const file = await uploadFile(user, Buffer.alloc(0));
    expect(file.encryptedSize).toBe(0);
    expect((await downloadFile(user, file.id)).length).toBe(0);
  });
});

describe('file management', () => {
  it('isolates files between users', async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const file = await uploadFile(alice, randomBytes(50));
    expect((await api().get(`/api/files/${file.id}`).set(bearer(bob))).status).toBe(404);
    expect((await api().get(`/api/files/${file.id}/download-url`).set(bearer(bob))).status).toBe(404);
    expect((await api().delete(`/api/files/${file.id}`).set(bearer(bob))).status).toBe(404);
    expect((await api().get('/api/files').set(bearer(bob))).body.data).toHaveLength(0);
  });

  it('renames, moves, copies and deletes while keeping quota accounting straight', async () => {
    const user = await registerUser();
    const folder = await api().post('/api/folders').set(bearer(user)).send({ encryptedName: 'enc', encryptedNameIV: 'ivivivivivivivivivivivivivivivivivivivi' });
    expect(folder.status).toBe(201);
    const content = randomBytes(120);
    const file = await uploadFile(user, content);

    const renamed = await api().patch(`/api/files/${file.id}`).set(bearer(user)).send({ encryptedName: 'new-name', encryptedNameIV: 'newivnewivnewiv' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.encryptedName).toBe('new-name');

    const moved = await api().post(`/api/files/${file.id}/move`).set(bearer(user)).send({ folderId: folder.body.data.id });
    expect(moved.body.data.folderId).toBe(folder.body.data.id);
    expect((await api().get('/api/files').set(bearer(user))).body.data).toHaveLength(0);
    expect((await api().get('/api/files').query({ folderId: folder.body.data.id }).set(bearer(user))).body.data).toHaveLength(1);

    const copied = await api().post(`/api/files/${file.id}/copy`).set(bearer(user)).send({ folderId: null });
    expect(copied.status).toBe(201);
    expect(copied.body.data.id).not.toBe(file.id);
    expect(copied.body.data.folderId).toBeUndefined();
    expect((await downloadFile(user, copied.body.data.id)).equals(content)).toBe(true);
    expect((await api().get('/api/storage/stats').set(bearer(user))).body.data).toMatchObject({ used: content.length * 2, fileCount: 2, folderCount: 1 });

    expect((await api().delete(`/api/files/${file.id}`).set(bearer(user))).status).toBe(200);
    expect((await api().get(`/api/files/${file.id}`).set(bearer(user))).status).toBe(404);
    expect((await api().get('/api/storage/stats').set(bearer(user))).body.data.used).toBe(content.length);
    // Download URL for a deleted file is gone too.
    const dl = await api().get(`/api/files/${copied.body.data.id}/download-url`).set(bearer(user));
    await api().delete(`/api/files/${copied.body.data.id}`).set(bearer(user));
    expect((await api().get(dl.body.data.downloadUrl)).status).toBe(404);
  });

  it('refuses to move a file into another user\'s folder', async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const bobFolder = await api().post('/api/folders').set(bearer(bob)).send({ encryptedName: 'x', encryptedNameIV: 'ivivivivivivivivi' });
    const file = await uploadFile(alice, randomBytes(10));
    const res = await api().post(`/api/files/${file.id}/move`).set(bearer(alice)).send({ folderId: bobFolder.body.data.id });
    expect(res.status).toBe(404);
  });

  it('records activity', async () => {
    const user = await registerUser();
    await uploadFile(user, randomBytes(10));
    // Audit writes are fire-and-forget; poll until they land (a slow CI runner can take more than one tick).
    const wanted = ['auth.register', 'file.upload.start', 'file.upload.complete'];
    let res = await api().get('/api/activity').set(bearer(user));
    for (let i = 0; i < 40; i++) {
      const seen = res.body.data?.items?.map((it: { action: string }) => it.action) ?? [];
      if (wanted.every((a) => seen.includes(a))) break;
      await new Promise((r) => setTimeout(r, 50));
      res = await api().get('/api/activity').set(bearer(user));
    }
    expect(res.status).toBe(200);
    const actions = res.body.data.items.map((i: { action: string }) => i.action);
    expect(actions).toEqual(expect.arrayContaining(wanted));
    expect(res.body.data.total).toBeGreaterThanOrEqual(3);
  });
});
