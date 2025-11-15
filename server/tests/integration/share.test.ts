/**
 * Integration Tests for Share Endpoints
 * Tests /api/shares routes: create, access, revoke, download
 */

import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';

describe('Share Endpoints', () => {
  let testUser: any;
  let testFile: any;
  let accessToken: string;

  beforeEach(async () => {
    await global.testUtils.cleanupTestData();
    testUser = await global.testUtils.createTestUser();
    testFile = await global.testUtils.createTestFile(testUser.id);

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

  describe('POST /api/shares', () => {
    it('should create share link successfully', async () => {
      const response = await request(app)
        .post('/api/shares')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          fileId: testFile.id,
          fileKeyEncrypted: 'encrypted-file-key',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('shareToken');
      expect(response.body.data).toHaveProperty('shareUrl');
      expect(response.body.data.fileId).toBe(testFile.id);
    });

    it('should create share with password', async () => {
      const response = await request(app)
        .post('/api/shares')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          fileId: testFile.id,
          fileKeyEncrypted: 'encrypted-file-key',
          password: 'SecurePass123',
        })
        .expect(201);

      expect(response.body.data.hasPassword).toBe(true);
      expect(response.body.data.passwordHash).toBeUndefined(); // Should not expose hash
    });

    it('should create share with expiration', async () => {
      const futureDate = new Date(Date.now() + 86400000); // Tomorrow

      const response = await request(app)
        .post('/api/shares')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          fileId: testFile.id,
          fileKeyEncrypted: 'encrypted-file-key',
          expiresAt: futureDate.toISOString(),
        })
        .expect(201);

      expect(response.body.data.expiresAt).toBeDefined();
    });

    it('should create share with max downloads', async () => {
      const response = await request(app)
        .post('/api/shares')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          fileId: testFile.id,
          fileKeyEncrypted: 'encrypted-file-key',
          maxDownloads: 5,
        })
        .expect(201);

      expect(response.body.data.maxDownloads).toBe(5);
    });

    it('should reject share creation without authentication', async () => {
      await request(app)
        .post('/api/shares')
        .send({
          fileId: testFile.id,
          fileKeyEncrypted: 'encrypted-file-key',
        })
        .expect(401);
    });

    it('should reject share for non-existent file', async () => {
      await request(app)
        .post('/api/shares')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          fileId: 'non-existent-file-id',
          fileKeyEncrypted: 'encrypted-file-key',
        })
        .expect(404);
    });

    it('should reject share for other users file', async () => {
      const otherUser = await global.testUtils.createTestUser();
      const otherFile = await global.testUtils.createTestFile(otherUser.id);

      await request(app)
        .post('/api/shares')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          fileId: otherFile.id,
          fileKeyEncrypted: 'encrypted-file-key',
        })
        .expect(404);
    });

    it('should reject share with past expiration date', async () => {
      const pastDate = new Date(Date.now() - 86400000); // Yesterday

      await request(app)
        .post('/api/shares')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          fileId: testFile.id,
          fileKeyEncrypted: 'encrypted-file-key',
          expiresAt: pastDate.toISOString(),
        })
        .expect(400);
    });

    it('should reject share with invalid max downloads', async () => {
      await request(app)
        .post('/api/shares')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          fileId: testFile.id,
          fileKeyEncrypted: 'encrypted-file-key',
          maxDownloads: 0,
        })
        .expect(400);
    });

    it('should create audit log on share creation', async () => {
      const response = await request(app)
        .post('/api/shares')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          fileId: testFile.id,
          fileKeyEncrypted: 'encrypted-file-key',
        })
        .expect(201);

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          userId: testUser.id,
          action: 'SHARE_CREATE',
          resourceId: response.body.data.id,
        },
      });

      expect(auditLog).toBeDefined();
    });
  });

  describe('GET /api/shares', () => {
    beforeEach(async () => {
      // Create multiple shares
      await prisma.share.createMany({
        data: [
          {
            id: 'share-1',
            fileId: testFile.id,
            ownerId: testUser.id,
            shareToken: 'token-1',
            fileKeyEncrypted: 'key-1',
          },
          {
            id: 'share-2',
            fileId: testFile.id,
            ownerId: testUser.id,
            shareToken: 'token-2',
            fileKeyEncrypted: 'key-2',
          },
        ],
      });
    });

    it('should list user shares', async () => {
      const response = await request(app)
        .get('/api/shares')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.shares).toBeInstanceOf(Array);
      expect(response.body.data.shares.length).toBeGreaterThanOrEqual(2);
      expect(response.body.data).toHaveProperty('total');
    });

    it('should reject listing without authentication', async () => {
      await request(app)
        .get('/api/shares')
        .expect(401);
    });

    it('should paginate shares', async () => {
      const response = await request(app)
        .get('/api/shares?page=1&limit=1')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.shares.length).toBeLessThanOrEqual(1);
    });

    it('should filter shares by file', async () => {
      const response = await request(app)
        .get(`/api/shares?fileId=${testFile.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      response.body.data.shares.forEach((share: any) => {
        expect(share.file.id).toBe(testFile.id);
      });
    });

    it('should not show other users shares', async () => {
      const otherUser = await global.testUtils.createTestUser();
      const otherFile = await global.testUtils.createTestFile(otherUser.id);

      await prisma.share.create({
        data: {
          id: 'other-share',
          fileId: otherFile.id,
          ownerId: otherUser.id,
          shareToken: 'other-token',
          fileKeyEncrypted: 'other-key',
        },
      });

      const response = await request(app)
        .get('/api/shares')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const otherUserShares = response.body.data.shares.filter(
        (share: any) => share.ownerId === otherUser.id
      );

      expect(otherUserShares).toHaveLength(0);
    });

    it('should not expose password hash', async () => {
      const response = await request(app)
        .get('/api/shares')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      response.body.data.shares.forEach((share: any) => {
        expect(share.passwordHash).toBeUndefined();
      });
    });
  });

  describe('GET /api/shares/:id', () => {
    let testShare: any;

    beforeEach(async () => {
      testShare = await prisma.share.create({
        data: {
          id: 'test-share-id',
          fileId: testFile.id,
          ownerId: testUser.id,
          shareToken: 'test-token',
          fileKeyEncrypted: 'encrypted-key',
        },
      });
    });

    it('should get share details', async () => {
      const response = await request(app)
        .get(`/api/shares/${testShare.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testShare.id);
      expect(response.body.data).toHaveProperty('shareUrl');
    });

    it('should reject getting non-existent share', async () => {
      await request(app)
        .get('/api/shares/non-existent-id')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('should reject getting other users share', async () => {
      const otherUser = await global.testUtils.createTestUser();
      const otherFile = await global.testUtils.createTestFile(otherUser.id);
      const otherShare = await prisma.share.create({
        data: {
          id: 'other-share-id',
          fileId: otherFile.id,
          ownerId: otherUser.id,
          shareToken: 'other-token',
          fileKeyEncrypted: 'other-key',
        },
      });

      await request(app)
        .get(`/api/shares/${otherShare.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('PATCH /api/shares/:id', () => {
    let testShare: any;

    beforeEach(async () => {
      testShare = await prisma.share.create({
        data: {
          id: 'update-share-id',
          fileId: testFile.id,
          ownerId: testUser.id,
          shareToken: 'update-token',
          fileKeyEncrypted: 'encrypted-key',
        },
      });
    });

    it('should update share expiration', async () => {
      const futureDate = new Date(Date.now() + 86400000);

      const response = await request(app)
        .patch(`/api/shares/${testShare.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          expiresAt: futureDate.toISOString(),
        })
        .expect(200);

      expect(response.body.data.expiresAt).toBeDefined();
    });

    it('should update share password', async () => {
      const response = await request(app)
        .patch(`/api/shares/${testShare.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          password: 'NewPassword123',
        })
        .expect(200);

      expect(response.body.data.hasPassword).toBe(true);
    });

    it('should remove share password', async () => {
      const response = await request(app)
        .patch(`/api/shares/${testShare.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          password: null,
        })
        .expect(200);

      expect(response.body.data.hasPassword).toBe(false);
    });

    it('should update share status', async () => {
      const response = await request(app)
        .patch(`/api/shares/${testShare.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          isActive: false,
        })
        .expect(200);

      expect(response.body.data.isActive).toBe(false);
    });

    it('should update max downloads', async () => {
      const response = await request(app)
        .patch(`/api/shares/${testShare.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          maxDownloads: 10,
        })
        .expect(200);

      expect(response.body.data.maxDownloads).toBe(10);
    });

    it('should reject update without authentication', async () => {
      await request(app)
        .patch(`/api/shares/${testShare.id}`)
        .send({
          isActive: false,
        })
        .expect(401);
    });

    it('should reject update of other users share', async () => {
      const otherUser = await global.testUtils.createTestUser();
      const otherFile = await global.testUtils.createTestFile(otherUser.id);
      const otherShare = await prisma.share.create({
        data: {
          id: 'other-update-share',
          fileId: otherFile.id,
          ownerId: otherUser.id,
          shareToken: 'other-update-token',
          fileKeyEncrypted: 'other-key',
        },
      });

      await request(app)
        .patch(`/api/shares/${otherShare.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          isActive: false,
        })
        .expect(404);
    });
  });

  describe('DELETE /api/shares/:id', () => {
    let testShare: any;

    beforeEach(async () => {
      testShare = await prisma.share.create({
        data: {
          id: 'delete-share-id',
          fileId: testFile.id,
          ownerId: testUser.id,
          shareToken: 'delete-token',
          fileKeyEncrypted: 'encrypted-key',
        },
      });
    });

    it('should delete share', async () => {
      const response = await request(app)
        .delete(`/api/shares/${testShare.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      const deletedShare = await prisma.share.findUnique({
        where: { id: testShare.id },
      });

      expect(deletedShare).toBeNull();
    });

    it('should reject delete without authentication', async () => {
      await request(app)
        .delete(`/api/shares/${testShare.id}`)
        .expect(401);
    });

    it('should reject delete of other users share', async () => {
      const otherUser = await global.testUtils.createTestUser();
      const otherFile = await global.testUtils.createTestFile(otherUser.id);
      const otherShare = await prisma.share.create({
        data: {
          id: 'other-delete-share',
          fileId: otherFile.id,
          ownerId: otherUser.id,
          shareToken: 'other-delete-token',
          fileKeyEncrypted: 'other-key',
        },
      });

      await request(app)
        .delete(`/api/shares/${otherShare.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('should create audit log on delete', async () => {
      await request(app)
        .delete(`/api/shares/${testShare.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          userId: testUser.id,
          action: 'SHARE_DELETE',
          resourceId: testShare.id,
        },
      });

      expect(auditLog).toBeDefined();
    });
  });

  describe('GET /share/:token (Public Share Access)', () => {
    let publicShare: any;

    beforeEach(async () => {
      publicShare = await prisma.share.create({
        data: {
          id: 'public-share-id',
          fileId: testFile.id,
          ownerId: testUser.id,
          shareToken: 'public-test-token',
          fileKeyEncrypted: 'encrypted-key',
        },
      });
    });

    it('should access share without authentication', async () => {
      const response = await request(app)
        .get(`/share/${publicShare.shareToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('file');
    });

    it('should reject access to non-existent share', async () => {
      await request(app)
        .get('/share/non-existent-token')
        .expect(404);
    });

    it('should reject access to inactive share', async () => {
      await prisma.share.update({
        where: { id: publicShare.id },
        data: { isActive: false },
      });

      await request(app)
        .get(`/share/${publicShare.shareToken}`)
        .expect(403);
    });

    it('should reject access to expired share', async () => {
      await prisma.share.update({
        where: { id: publicShare.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await request(app)
        .get(`/share/${publicShare.shareToken}`)
        .expect(403);
    });

    it('should require password for protected share', async () => {
      const bcrypt = require('bcrypt');
      const passwordHash = await bcrypt.hash('SharePass123', 10);

      await prisma.share.update({
        where: { id: publicShare.id },
        data: { passwordHash },
      });

      await request(app)
        .get(`/share/${publicShare.shareToken}`)
        .expect(403);
    });
  });

  describe('POST /share/:token/access (Share Access with Password)', () => {
    let protectedShare: any;

    beforeEach(async () => {
      const bcrypt = require('bcrypt');
      const passwordHash = await bcrypt.hash('SharePass123', 10);

      protectedShare = await prisma.share.create({
        data: {
          id: 'protected-share-id',
          fileId: testFile.id,
          ownerId: testUser.id,
          shareToken: 'protected-token',
          fileKeyEncrypted: 'encrypted-key',
          passwordHash,
        },
      });
    });

    it('should access protected share with correct password', async () => {
      const response = await request(app)
        .post(`/share/${protectedShare.shareToken}/access`)
        .send({ password: 'SharePass123' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject access with wrong password', async () => {
      await request(app)
        .post(`/share/${protectedShare.shareToken}/access`)
        .send({ password: 'WrongPassword' })
        .expect(403);
    });

    it('should reject access without password', async () => {
      await request(app)
        .post(`/share/${protectedShare.shareToken}/access`)
        .send({})
        .expect(403);
    });
  });

  describe('GET /share/:token/download (Public Download)', () => {
    let downloadShare: any;

    beforeEach(async () => {
      downloadShare = await prisma.share.create({
        data: {
          id: 'download-share-id',
          fileId: testFile.id,
          ownerId: testUser.id,
          shareToken: 'download-token',
          fileKeyEncrypted: 'encrypted-key',
          downloadCount: 0,
        },
      });
    });

    it('should download shared file', async () => {
      const response = await request(app)
        .get(`/share/${downloadShare.shareToken}/download`)
        .expect(200);

      expect(response.header['content-type']).toBeDefined();
    });

    it('should increment download count', async () => {
      await request(app)
        .get(`/share/${downloadShare.shareToken}/download`)
        .expect(200);

      const updatedShare = await prisma.share.findUnique({
        where: { id: downloadShare.id },
      });

      expect(updatedShare?.downloadCount).toBe(1);
    });

    it('should reject download when limit reached', async () => {
      await prisma.share.update({
        where: { id: downloadShare.id },
        data: {
          maxDownloads: 2,
          downloadCount: 2,
        },
      });

      await request(app)
        .get(`/share/${downloadShare.shareToken}/download`)
        .expect(403);
    });

    it('should require password for protected download', async () => {
      const bcrypt = require('bcrypt');
      const passwordHash = await bcrypt.hash('DownloadPass', 10);

      await prisma.share.update({
        where: { id: downloadShare.id },
        data: { passwordHash },
      });

      await request(app)
        .get(`/share/${downloadShare.shareToken}/download`)
        .expect(403);
    });

    it('should update lastAccessed on download', async () => {
      const beforeDownload = downloadShare.lastAccessed;

      await request(app)
        .get(`/share/${downloadShare.shareToken}/download`)
        .expect(200);

      const updatedShare = await prisma.share.findUnique({
        where: { id: downloadShare.id },
      });

      expect(updatedShare?.lastAccessed).toBeDefined();
      if (beforeDownload) {
        expect(updatedShare?.lastAccessed?.getTime()).toBeGreaterThan(
          beforeDownload.getTime()
        );
      }
    });

    it('should create audit log on download', async () => {
      await request(app)
        .get(`/share/${downloadShare.shareToken}/download`)
        .expect(200);

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          action: 'SHARE_DOWNLOAD',
          resourceId: downloadShare.id,
        },
      });

      expect(auditLog).toBeDefined();
    });
  });

  describe('GET /api/shares/file/:fileId/stats', () => {
    beforeEach(async () => {
      // Create multiple shares for the file
      await prisma.share.createMany({
        data: [
          {
            id: 'stats-share-1',
            fileId: testFile.id,
            ownerId: testUser.id,
            shareToken: 'stats-token-1',
            fileKeyEncrypted: 'key-1',
            downloadCount: 5,
          },
          {
            id: 'stats-share-2',
            fileId: testFile.id,
            ownerId: testUser.id,
            shareToken: 'stats-token-2',
            fileKeyEncrypted: 'key-2',
            downloadCount: 3,
            isActive: false,
          },
        ],
      });
    });

    it('should get share statistics for file', async () => {
      const response = await request(app)
        .get(`/api/shares/file/${testFile.id}/stats`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalShares');
      expect(response.body.data).toHaveProperty('activeShares');
      expect(response.body.data).toHaveProperty('totalDownloads');
      expect(response.body.data.totalShares).toBeGreaterThanOrEqual(2);
    });

    it('should reject stats without authentication', async () => {
      await request(app)
        .get(`/api/shares/file/${testFile.id}/stats`)
        .expect(401);
    });
  });
});
