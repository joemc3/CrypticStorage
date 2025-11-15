/**
 * Integration Tests for File Endpoints
 * Tests /api/files routes: upload, download, list, update, delete
 */

import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import path from 'path';
import fs from 'fs';

describe('File Endpoints', () => {
  let testUser: any;
  let accessToken: string;

  beforeEach(async () => {
    await global.testUtils.cleanupTestData();
    testUser = await global.testUtils.createTestUser();

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: 'Test123!@#',
      });

    accessToken = loginResponse.body.data.accessToken;
  });

  afterAll(async () => {
    await global.testUtils.cleanupTestData();
  });

  describe('POST /api/files/upload', () => {
    it('should upload file successfully', async () => {
      const testBuffer = Buffer.from('test file content');

      const response = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('filenameEncrypted', 'encrypted-filename')
        .field('filenameIv', 'filename-iv')
        .field('fileKeyEncrypted', 'encrypted-key')
        .field('fileSize', '1024')
        .field('encryptedSize', '1536')
        .field('mimeType', 'application/pdf')
        .field('fileHash', 'test-hash')
        .attach('file', testBuffer, 'test.pdf')
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('storagePath');
    });

    it('should reject upload without authentication', async () => {
      const testBuffer = Buffer.from('test file content');

      await request(app)
        .post('/api/files/upload')
        .attach('file', testBuffer, 'test.pdf')
        .expect(401);
    });

    it('should reject upload exceeding quota', async () => {
      // Set very low quota
      await prisma.user.update({
        where: { id: testUser.id },
        data: { storageQuota: BigInt(100) },
      });

      const testBuffer = Buffer.from('test file content');

      await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('filenameEncrypted', 'encrypted-filename')
        .field('filenameIv', 'filename-iv')
        .field('fileKeyEncrypted', 'encrypted-key')
        .field('fileSize', '1024')
        .field('encryptedSize', '200') // Exceeds quota
        .field('mimeType', 'application/pdf')
        .field('fileHash', 'test-hash')
        .attach('file', testBuffer, 'test.pdf')
        .expect(402);
    });

    it('should reject upload with missing required fields', async () => {
      const testBuffer = Buffer.from('test file content');

      await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', testBuffer, 'test.pdf')
        .expect(400);
    });

    it('should update storage usage on upload', async () => {
      const testBuffer = Buffer.from('test file content');
      const encryptedSize = 1536;

      await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('filenameEncrypted', 'encrypted-filename')
        .field('filenameIv', 'filename-iv')
        .field('fileKeyEncrypted', 'encrypted-key')
        .field('fileSize', '1024')
        .field('encryptedSize', encryptedSize.toString())
        .field('mimeType', 'application/pdf')
        .field('fileHash', 'test-hash')
        .attach('file', testBuffer, 'test.pdf')
        .expect(201);

      const updatedUser = await prisma.user.findUnique({
        where: { id: testUser.id },
      });

      expect(Number(updatedUser?.storageUsed)).toBeGreaterThanOrEqual(encryptedSize);
    });

    it('should upload file to parent folder', async () => {
      const folder = await prisma.folder.create({
        data: {
          id: 'test-folder',
          userId: testUser.id,
          nameEncrypted: 'folder',
          nameIv: 'iv',
        },
      });

      const testBuffer = Buffer.from('test file content');

      const response = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('filenameEncrypted', 'encrypted-filename')
        .field('filenameIv', 'filename-iv')
        .field('fileKeyEncrypted', 'encrypted-key')
        .field('fileSize', '1024')
        .field('encryptedSize', '1536')
        .field('mimeType', 'application/pdf')
        .field('fileHash', 'test-hash')
        .field('parentFolderId', folder.id)
        .attach('file', testBuffer, 'test.pdf')
        .expect(201);

      expect(response.body.data.parentFolderId).toBe(folder.id);
    });

    it('should create audit log on upload', async () => {
      const testBuffer = Buffer.from('test file content');

      const response = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('filenameEncrypted', 'encrypted-filename')
        .field('filenameIv', 'filename-iv')
        .field('fileKeyEncrypted', 'encrypted-key')
        .field('fileSize', '1024')
        .field('encryptedSize', '1536')
        .field('mimeType', 'application/pdf')
        .field('fileHash', 'test-hash')
        .attach('file', testBuffer, 'test.pdf')
        .expect(201);

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          userId: testUser.id,
          action: 'FILE_UPLOAD',
          resourceId: response.body.data.id,
        },
      });

      expect(auditLog).toBeDefined();
    });
  });

  describe('GET /api/files', () => {
    beforeEach(async () => {
      // Create some test files
      await global.testUtils.createTestFile(testUser.id);
      await global.testUtils.createTestFile(testUser.id);
      await global.testUtils.createTestFile(testUser.id);
    });

    it('should list user files', async () => {
      const response = await request(app)
        .get('/api/files')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.files).toBeInstanceOf(Array);
      expect(response.body.data.files.length).toBeGreaterThanOrEqual(3);
      expect(response.body.data).toHaveProperty('total');
    });

    it('should reject listing without authentication', async () => {
      await request(app)
        .get('/api/files')
        .expect(401);
    });

    it('should paginate files', async () => {
      const response = await request(app)
        .get('/api/files?page=1&limit=2')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.files.length).toBeLessThanOrEqual(2);
      expect(response.body.data.limit).toBe(2);
    });

    it('should filter files by folder', async () => {
      const folder = await prisma.folder.create({
        data: {
          id: 'filter-folder',
          userId: testUser.id,
          nameEncrypted: 'folder',
          nameIv: 'iv',
        },
      });

      await global.testUtils.createTestFile(testUser.id, {
        parentFolderId: folder.id,
      });

      const response = await request(app)
        .get(`/api/files?folderId=${folder.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.files).toBeInstanceOf(Array);
      response.body.data.files.forEach((file: any) => {
        expect(file.parentFolderId).toBe(folder.id);
      });
    });

    it('should sort files', async () => {
      const response = await request(app)
        .get('/api/files?sortBy=createdAt&sortOrder=desc')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.files).toBeInstanceOf(Array);
    });

    it('should not show other users files', async () => {
      const otherUser = await global.testUtils.createTestUser();
      await global.testUtils.createTestFile(otherUser.id);

      const response = await request(app)
        .get('/api/files')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const otherUserFiles = response.body.data.files.filter(
        (file: any) => file.userId === otherUser.id
      );

      expect(otherUserFiles).toHaveLength(0);
    });
  });

  describe('GET /api/files/:id', () => {
    let testFile: any;

    beforeEach(async () => {
      testFile = await global.testUtils.createTestFile(testUser.id);
    });

    it('should get file details', async () => {
      const response = await request(app)
        .get(`/api/files/${testFile.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testFile.id);
      expect(response.body.data).toHaveProperty('filenameEncrypted');
      expect(response.body.data).toHaveProperty('fileSize');
    });

    it('should reject getting non-existent file', async () => {
      await request(app)
        .get('/api/files/non-existent-id')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('should reject getting other users file', async () => {
      const otherUser = await global.testUtils.createTestUser();
      const otherFile = await global.testUtils.createTestFile(otherUser.id);

      await request(app)
        .get(`/api/files/${otherFile.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('should reject getting deleted file', async () => {
      await prisma.file.update({
        where: { id: testFile.id },
        data: { isDeleted: true },
      });

      await request(app)
        .get(`/api/files/${testFile.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('GET /api/files/:id/download', () => {
    let testFile: any;

    beforeEach(async () => {
      testFile = await global.testUtils.createTestFile(testUser.id);
    });

    it('should download file', async () => {
      const response = await request(app)
        .get(`/api/files/${testFile.id}/download`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.header['content-type']).toBeDefined();
    });

    it('should reject download without authentication', async () => {
      await request(app)
        .get(`/api/files/${testFile.id}/download`)
        .expect(401);
    });

    it('should reject download of non-existent file', async () => {
      await request(app)
        .get('/api/files/non-existent-id/download')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('should reject download of other users file', async () => {
      const otherUser = await global.testUtils.createTestUser();
      const otherFile = await global.testUtils.createTestFile(otherUser.id);

      await request(app)
        .get(`/api/files/${otherFile.id}/download`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('should create audit log on download', async () => {
      await request(app)
        .get(`/api/files/${testFile.id}/download`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          userId: testUser.id,
          action: 'FILE_DOWNLOAD',
          resourceId: testFile.id,
        },
      });

      expect(auditLog).toBeDefined();
    });
  });

  describe('PATCH /api/files/:id', () => {
    let testFile: any;

    beforeEach(async () => {
      testFile = await global.testUtils.createTestFile(testUser.id);
    });

    it('should update file name', async () => {
      const response = await request(app)
        .patch(`/api/files/${testFile.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          filenameEncrypted: 'new-encrypted-name',
          filenameIv: 'new-iv',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.filenameEncrypted).toBe('new-encrypted-name');
    });

    it('should move file to folder', async () => {
      const folder = await prisma.folder.create({
        data: {
          id: 'move-folder',
          userId: testUser.id,
          nameEncrypted: 'folder',
          nameIv: 'iv',
        },
      });

      const response = await request(app)
        .patch(`/api/files/${testFile.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          parentFolderId: folder.id,
        })
        .expect(200);

      expect(response.body.data.parentFolderId).toBe(folder.id);
    });

    it('should move file to root', async () => {
      const response = await request(app)
        .patch(`/api/files/${testFile.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          parentFolderId: null,
        })
        .expect(200);

      expect(response.body.data.parentFolderId).toBeNull();
    });

    it('should reject update without authentication', async () => {
      await request(app)
        .patch(`/api/files/${testFile.id}`)
        .send({
          filenameEncrypted: 'new-name',
        })
        .expect(401);
    });

    it('should reject update of other users file', async () => {
      const otherUser = await global.testUtils.createTestUser();
      const otherFile = await global.testUtils.createTestFile(otherUser.id);

      await request(app)
        .patch(`/api/files/${otherFile.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          filenameEncrypted: 'new-name',
        })
        .expect(404);
    });

    it('should reject update to non-existent folder', async () => {
      await request(app)
        .patch(`/api/files/${testFile.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          parentFolderId: 'non-existent-folder',
        })
        .expect(404);
    });
  });

  describe('DELETE /api/files/:id', () => {
    let testFile: any;

    beforeEach(async () => {
      testFile = await global.testUtils.createTestFile(testUser.id, {
        encryptedSize: BigInt(2048),
      });

      await prisma.user.update({
        where: { id: testUser.id },
        data: { storageUsed: BigInt(2048) },
      });
    });

    it('should soft delete file', async () => {
      const response = await request(app)
        .delete(`/api/files/${testFile.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      const deletedFile = await prisma.file.findUnique({
        where: { id: testFile.id },
      });

      expect(deletedFile?.isDeleted).toBe(true);
    });

    it('should permanently delete file with query param', async () => {
      const response = await request(app)
        .delete(`/api/files/${testFile.id}?permanent=true`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const deletedFile = await prisma.file.findUnique({
        where: { id: testFile.id },
      });

      expect(deletedFile).toBeNull();
    });

    it('should update storage usage on delete', async () => {
      await request(app)
        .delete(`/api/files/${testFile.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const updatedUser = await prisma.user.findUnique({
        where: { id: testUser.id },
      });

      expect(Number(updatedUser?.storageUsed)).toBe(0);
    });

    it('should reject delete without authentication', async () => {
      await request(app)
        .delete(`/api/files/${testFile.id}`)
        .expect(401);
    });

    it('should reject delete of other users file', async () => {
      const otherUser = await global.testUtils.createTestUser();
      const otherFile = await global.testUtils.createTestFile(otherUser.id);

      await request(app)
        .delete(`/api/files/${otherFile.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('should create audit log on delete', async () => {
      await request(app)
        .delete(`/api/files/${testFile.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          userId: testUser.id,
          action: 'FILE_DELETE',
          resourceId: testFile.id,
        },
      });

      expect(auditLog).toBeDefined();
    });
  });

  describe('POST /api/files/:id/restore', () => {
    let deletedFile: any;

    beforeEach(async () => {
      deletedFile = await global.testUtils.createTestFile(testUser.id, {
        isDeleted: true,
        deletedAt: new Date(),
        encryptedSize: BigInt(1024),
      });
    });

    it('should restore deleted file', async () => {
      const response = await request(app)
        .post(`/api/files/${deletedFile.id}/restore`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.isDeleted).toBe(false);
    });

    it('should update storage usage on restore', async () => {
      await request(app)
        .post(`/api/files/${deletedFile.id}/restore`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const updatedUser = await prisma.user.findUnique({
        where: { id: testUser.id },
      });

      expect(Number(updatedUser?.storageUsed)).toBeGreaterThanOrEqual(1024);
    });

    it('should reject restore if quota exceeded', async () => {
      await prisma.user.update({
        where: { id: testUser.id },
        data: { storageQuota: BigInt(100), storageUsed: BigInt(50) },
      });

      await request(app)
        .post(`/api/files/${deletedFile.id}/restore`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(402);
    });

    it('should reject restore of active file', async () => {
      const activeFile = await global.testUtils.createTestFile(testUser.id);

      await request(app)
        .post(`/api/files/${activeFile.id}/restore`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('GET /api/files/storage/stats', () => {
    beforeEach(async () => {
      await global.testUtils.createTestFile(testUser.id, {
        encryptedSize: BigInt(1024),
      });
      await global.testUtils.createTestFile(testUser.id, {
        encryptedSize: BigInt(2048),
      });

      await prisma.user.update({
        where: { id: testUser.id },
        data: { storageUsed: BigInt(3072) },
      });
    });

    it('should get storage statistics', async () => {
      const response = await request(app)
        .get('/api/files/storage/stats')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('quota');
      expect(response.body.data).toHaveProperty('used');
      expect(response.body.data).toHaveProperty('available');
      expect(response.body.data).toHaveProperty('usagePercentage');
      expect(response.body.data).toHaveProperty('fileCount');
    });

    it('should reject stats without authentication', async () => {
      await request(app)
        .get('/api/files/storage/stats')
        .expect(401);
    });
  });
});
