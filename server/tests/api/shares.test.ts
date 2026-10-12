import { randomBytes } from 'crypto';
import { api, bearer, binaryParser, closeDatabase, prepareDatabase, registerUser, uploadFile } from '../helpers/api';

beforeEach(prepareDatabase);
afterAll(closeDatabase);

describe('share links', () => {
  it('serves a file anonymously through a link and counts downloads', async () => {
    const owner = await registerUser();
    const content = randomBytes(2048);
    const file = await uploadFile(owner, content);

    const created = await api().post('/api/shares/links').set(bearer(owner)).send({ fileId: file.id, maxDownloads: 2 });
    expect(created.status).toBe(201);
    expect(created.body.data.url).toBe(`http://localhost:3000/s/${created.body.data.token}`);
    expect(created.body.data.passwordProtected).toBe(false);

    const info = await api().get(`/api/shares/public/${created.body.data.token}`);
    expect(info.status).toBe(200);
    expect(info.body.data).toMatchObject({ fileId: file.id, encryptedSize: content.length, passwordProtected: false, downloadsRemaining: 2 });
    expect(info.body.data.encryptedName).toEqual(expect.any(String));

    for (let i = 0; i < 2; i++) {
      const url = await api().post(`/api/shares/public/${created.body.data.token}/download-url`).send({});
      expect(url.status).toBe(200);
      const bytes = await api().get(url.body.data.downloadUrl).buffer(true).parse(binaryParser);
      expect(bytes.status).toBe(200);
      expect((bytes.body as Buffer).equals(content)).toBe(true);
    }
    // Third download exceeds the cap.
    expect((await api().post(`/api/shares/public/${created.body.data.token}/download-url`).send({})).status).toBe(410);

    const mine = await api().get(`/api/files/${file.id}/links`).set(bearer(owner));
    expect(mine.body.data[0].downloadCount).toBe(2);
  });

  it('gates the download behind a password but still exposes ciphertext metadata', async () => {
    const owner = await registerUser();
    const file = await uploadFile(owner, randomBytes(10));
    const link = await api().post('/api/shares/links').set(bearer(owner)).send({ fileId: file.id, password: 'hunter2' });
    const token = link.body.data.token;

    expect((await api().get(`/api/shares/public/${token}`)).body.data.passwordProtected).toBe(true);
    const missing = await api().post(`/api/shares/public/${token}/download-url`).send({});
    expect(missing.status).toBe(401);
    expect(missing.body.code).toBe('PASSWORD_REQUIRED');
    expect((await api().post(`/api/shares/public/${token}/download-url`).send({ password: 'wrong' })).status).toBe(401);
    expect((await api().post(`/api/shares/public/${token}/download-url`).send({ password: 'hunter2' })).status).toBe(200);
  });

  it('honours expiry and revocation', async () => {
    const owner = await registerUser();
    const file = await uploadFile(owner, randomBytes(10));

    const past = await api().post('/api/shares/links').set(bearer(owner)).send({ fileId: file.id, expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(past.status).toBe(422);

    const soon = await api().post('/api/shares/links').set(bearer(owner)).send({ fileId: file.id, expiresAt: new Date(Date.now() + 60_000).toISOString() });
    expect(soon.status).toBe(201);
    expect((await api().get(`/api/shares/public/${soon.body.data.token}`)).status).toBe(200);

    expect((await api().delete(`/api/shares/links/${soon.body.data.id}`).set(bearer(owner))).status).toBe(200);
    expect((await api().get(`/api/shares/public/${soon.body.data.token}`)).status).toBe(410);
    expect((await api().get(`/api/shares/public/${'a'.repeat(32)}`)).status).toBe(404);
  });

  it('only the owner can create or revoke links', async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const file = await uploadFile(owner, randomBytes(10));
    expect((await api().post('/api/shares/links').set(bearer(other)).send({ fileId: file.id })).status).toBe(404);
    const link = await api().post('/api/shares/links').set(bearer(owner)).send({ fileId: file.id });
    expect((await api().delete(`/api/shares/links/${link.body.data.id}`).set(bearer(other))).status).toBe(404);
  });
});

describe('user-to-user shares', () => {
  it('lets a recipient see and download a shared file until it is revoked', async () => {
    const owner = await registerUser();
    const recipient = await registerUser();
    const content = randomBytes(500);
    const file = await uploadFile(owner, content);

    const key = await api().get('/api/users/public-key').query({ email: recipient.email }).set(bearer(owner));
    expect(key.status).toBe(200);
    expect(key.body.data.publicKey).toEqual(expect.any(String));

    const share = await api()
      .post('/api/shares')
      .set(bearer(owner))
      .send({ fileId: file.id, recipientEmail: recipient.email.toUpperCase(), encryptedFileKey: randomBytes(64).toString('base64'), permissions: 'read' });
    expect(share.status).toBe(201);
    expect(share.body.data.recipientEmail).toBe(recipient.email);

    const withMe = await api().get('/api/shares/with-me').set(bearer(recipient));
    expect(withMe.body.data).toHaveLength(1);
    expect(withMe.body.data[0]).toMatchObject({ id: file.id, shareId: share.body.data.id, sharedBy: { email: owner.email } });

    const url = await api().get(`/api/files/${file.id}/download-url`).set(bearer(recipient));
    expect(url.status).toBe(200);
    const bytes = await api().get(url.body.data.downloadUrl).buffer(true).parse(binaryParser);
    expect((bytes.body as Buffer).equals(content)).toBe(true);

    // Recipient cannot mutate the owner's file.
    expect((await api().delete(`/api/files/${file.id}`).set(bearer(recipient))).status).toBe(404);

    expect((await api().get(`/api/files/${file.id}/shares`).set(bearer(owner))).body.data).toHaveLength(1);
    expect((await api().delete(`/api/shares/${share.body.data.id}`).set(bearer(recipient))).status).toBe(200);
    expect((await api().get('/api/shares/with-me').set(bearer(recipient))).body.data).toHaveLength(0);
    expect((await api().get(`/api/files/${file.id}/download-url`).set(bearer(recipient))).status).toBe(404);
  });

  it('rejects unknown recipients and self-shares', async () => {
    const owner = await registerUser();
    const file = await uploadFile(owner, randomBytes(10));
    const payload = { fileId: file.id, encryptedFileKey: randomBytes(64).toString('base64') };
    expect((await api().post('/api/shares').set(bearer(owner)).send({ ...payload, recipientEmail: 'ghost@example.com' })).status).toBe(404);
    expect((await api().post('/api/shares').set(bearer(owner)).send({ ...payload, recipientEmail: owner.email })).status).toBe(400);
  });
});
