import request from 'supertest';
import type { Response as AgentResponse } from 'superagent';
import type { Express } from 'express';
import { randomBytes } from 'crypto';
import { createApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { storage } from '../../src/storage';

let app: Express | null = null;

export function api(): ReturnType<typeof request> {
  if (!app) app = createApp();
  return request(app);
}

export async function prepareDatabase(): Promise<void> {
  await storage().init();
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "sessions", "file_shares", "share_links", "files", "folders", "users" RESTART IDENTITY CASCADE'
  );
}

export async function closeDatabase(): Promise<void> {
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
    ...overrides,
  };
}

export async function registerUser(overrides: Partial<Record<string, unknown>> = {}): Promise<TestUser> {
  const payload = registrationPayload(overrides);
  const res = await api().post('/api/auth/register').send(payload);
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    id: res.body.data.user.id,
    email: payload.email as string,
    passwordHash: payload.passwordHash as string,
    accessToken: res.body.data.tokens.accessToken,
    refreshToken: res.body.data.tokens.refreshToken,
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
