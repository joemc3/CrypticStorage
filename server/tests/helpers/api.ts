import request from 'supertest';
import type { Response as AgentResponse } from 'superagent';
import type { Express } from 'express';
import http, { type Server } from 'http';
import { randomBytes } from 'crypto';
import { createApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { storage } from '../../src/storage';
import { clearOutbox, outbox } from '../../src/lib/mail';
import { CONTRACT_PHRASE } from '../../src/modules/auth/schema';

let app: Express | null = null;
let server: Server | null = null;

/**
 * Supertest given a bare app listens on every interface but connects to 127.0.0.1. On a machine where another
 * program holds 127.0.0.1 on the same ephemeral port, the request reaches that program instead (a 401, a 404 or a
 * reset from nowhere). So each test file gets one server bound to 127.0.0.1 itself, started in prepareDatabase.
 */
export function api(): ReturnType<typeof request> {
  if (!app) app = createApp();
  return request(server ?? app);
}

async function listenOnLoopback(): Promise<void> {
  if (server) return;
  if (!app) app = createApp();
  const s = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => resolve());
  });
  server = s;
}

export async function prepareDatabase(): Promise<void> {
  await listenOnLoopback();
  await storage().init();
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "email_tokens", "sessions", "file_shares", "share_links", "files", "folders", "users" RESTART IDENTITY CASCADE'
  );
  clearOutbox();
}

/** Token from the newest verification message sent to `to`. */
export function verificationToken(to: string): string {
  const mails = outbox().filter((m) => m.to === to);
  const link = /\/verify\/([A-Za-z0-9_-]+)/.exec(mails[mails.length - 1]?.text ?? '');
  if (!link) throw new Error(`no verification mail for ${to}`);
  return link[1]!;
}

export async function closeDatabase(): Promise<void> {
  if (server) {
    const s = server;
    server = null;
    s.closeAllConnections();
    await new Promise<void>((resolve) => s.close(() => resolve()));
  }
  await prisma.$disconnect();
}

export interface TestUser {
  id: string;
  email: string;
  passwordHash: string;
  accessToken: string;
  refreshToken: string;
}

let counter = 0;

export function registrationPayload(overrides: Partial<Record<string, unknown>> = {}) {
  counter += 1;
  return {
    email: `user${counter}-${Date.now()}@example.com`,
    passwordHash: randomBytes(32).toString('hex'),
    publicKey: `spki-${randomBytes(24).toString('base64')}`,
    encryptedPrivateKey: JSON.stringify({ data: randomBytes(64).toString('base64'), iv: randomBytes(12).toString('base64') }),
    wrappedMasterKey: JSON.stringify({ data: randomBytes(48).toString('base64'), iv: randomBytes(12).toString('base64') }),
    salt: randomBytes(16).toString('base64'),
    contractPhrase: CONTRACT_PHRASE,
    ...overrides,
  };
}

export async function registerUser(overrides: Partial<Record<string, unknown>> = {}): Promise<TestUser> {
  const payload = registrationPayload(overrides);
  const res = await api().post('/api/auth/register').send(payload);
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  const email = payload.email as string;
  const verify = await api().post('/api/auth/verify-email').send({ token: verificationToken(email) });
  if (verify.status !== 200) throw new Error(`verify failed: ${verify.status} ${JSON.stringify(verify.body)}`);
  const login = await api().post('/api/auth/login').send({ email, passwordHash: payload.passwordHash });
  if (login.status !== 200) throw new Error(`login failed: ${login.status} ${JSON.stringify(login.body)}`);
  return {
    id: login.body.data.user.id,
    email,
    passwordHash: payload.passwordHash as string,
    accessToken: login.body.data.tokens.accessToken,
    refreshToken: login.body.data.tokens.refreshToken,
  };
}

export function bearer(user: TestUser | string): { Authorization: string } {
  return { Authorization: `Bearer ${typeof user === 'string' ? user : user.accessToken}` };
}

export function fileMetadata(size: number, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    encryptedName: randomBytes(24).toString('base64'),
    encryptedNameIV: randomBytes(12).toString('base64'),
    encryptedFileKey: randomBytes(48).toString('base64'),
    fileKeyIV: randomBytes(12).toString('base64'),
    iv: randomBytes(12).toString('base64'),
    encryptedSize: size,
    mimeType: 'application/octet-stream',
    ...overrides,
  };
}

/** Full three-step upload. Returns the READY file DTO. */
export async function uploadFile(user: TestUser, content: Buffer, overrides: Partial<Record<string, unknown>> = {}) {
  const reserve = await api().post('/api/files/upload-url').set(bearer(user)).send(fileMetadata(content.length, overrides));
  if (reserve.status !== 201) throw new Error(`upload-url failed: ${reserve.status} ${JSON.stringify(reserve.body)}`);
  const put = await api().put(reserve.body.data.uploadUrl).set('Content-Type', 'application/octet-stream').send(content);
  if (put.status !== 204) throw new Error(`content PUT failed: ${put.status} ${JSON.stringify(put.body)}`);
  const confirm = await api().post(`/api/files/${reserve.body.data.fileId}/confirm`).set(bearer(user));
  if (confirm.status !== 200) throw new Error(`confirm failed: ${confirm.status} ${JSON.stringify(confirm.body)}`);
  return confirm.body.data as { id: string; folderId?: string; encryptedSize: number; status: string };
}

export async function downloadFile(user: TestUser, fileId: string): Promise<Buffer> {
  const url = await api().get(`/api/files/${fileId}/download-url`).set(bearer(user));
  if (url.status !== 200) throw new Error(`download-url failed: ${url.status} ${JSON.stringify(url.body)}`);
  const res = await api().get(url.body.data.downloadUrl).buffer(true).parse(binaryParser);
  if (res.status !== 200) throw new Error(`content GET failed: ${res.status}`);
  return res.body as Buffer;
}

export function binaryParser(res: AgentResponse, callback: (err: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
  res.on('error', (err: Error) => callback(err, Buffer.alloc(0)));
}
