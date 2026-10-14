import { randomBytes } from 'crypto';
import { api, bearer, registerUser, uploadFile, type TestUser } from './api';

// The server cannot tell a blob from random bytes, and must never be sent anything else.
export const blob = (n = 48): string => randomBytes(n).toString('base64');

export async function acceptedWitnesses(owner: TestUser, count: number): Promise<TestUser[]> {
  const out: TestUser[] = [];
  for (let i = 0; i < count; i += 1) {
    const w = await registerUser();
    const invited = await api().post('/api/witnesses').set(bearer(owner)).send({ email: w.email }).expect(201);
    await api().post(`/api/witnesses/invitations/${invited.body.data.id}/accept`).set(bearer(w)).expect(200);
    out.push(w);
  }
  return out;
}

export async function mkdir(user: TestUser, parentId?: string): Promise<string> {
  const res = await api().post('/api/folders').set(bearer(user)).send({ encryptedName: blob(), encryptedNameIV: 'ivivivivivivivivi', parentId });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}

export const upload = (user: TestUser, folderId?: string) => uploadFile(user, randomBytes(32), folderId ? { folderId } : {});

export interface World {
  owner: TestUser;
  witnesses: TestUser[];
  recipient: TestUser;
}

export async function world(witnessCount = 3): Promise<World> {
  const owner = await registerUser();
  return { owner, witnesses: await acceptedWitnesses(owner, witnessCount), recipient: await registerUser() };
}

export function shares(witnesses: TestUser[]) {
  return witnesses.map((w, i) => ({ witnessUserId: w.id, shareIndex: i + 1, wrappedShare: blob() }));
}

export function ruleBody(w: World, target: { fileId?: string; folderId?: string }, fileIds: string[], over: Record<string, unknown> = {}) {
  return {
    ...target,
    periodDays: 30,
    recipients: [{ userId: w.recipient.id, wrappedReleaseKey: blob(256) }],
    items: fileIds.map((fileId) => ({ fileId, wrappedFileKey: blob() })),
    shares: shares(w.witnesses),
    wrappedReleaseKeyOwner: blob(),
    ...over,
  };
}
