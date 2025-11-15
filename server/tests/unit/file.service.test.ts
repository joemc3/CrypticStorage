/**
 * Unit Tests for File Service
 * Tests file upload, download, update, delete, and storage management
 */

import { Readable } from 'stream';
import { prisma } from '../../src/config/database';
import * as fileService from '../../src/services/file.service';
import {
  NotFoundError,
  ValidationError,
  PaymentRequiredError,
  StorageError,
} from '../../src/utils/errors';

describe('File Service', () => {
  let testUser: any;

  beforeEach(async () => {
    await global.testUtils.cleanupTestData();
    testUser = await global.testUtils.createTestUser();
  });

  afterAll(async () => {
    await global.testUtils.cleanupTestData();
  });

  describe('File Creation', () => {
    it('should create file successfully', async () => {
      const fileData = Buffer.from('test file content');
      const createData = {
        userId: testUser.id,
        filenameEncrypted: 'encrypted-filename',
        filenameIv: 'filename-iv',
        fileKeyEncrypted: 'encrypted-key',
        fileSize: 1024,
        encryptedSize: 1536,
        mimeType: 'application/pdf',
        fileHash: 'test-hash',
        fileData,
      };

      const file = await fileService.createFile(createData);

      expect(file).toHaveProperty('id');
      expect(file.userId).toBe(testUser.id);
      expect(file.filenameEncrypted).toBe(createData.filenameEncrypted);
      expect(file.storagePath).toBeDefined();
    });

    it('should update user storage usage on file creation', async () => {
      const fileData = Buffer.from('test file content');
      const encryptedSize = 2048;

      await fileService.createFile({
        userId: testUser.id,
        filenameEncrypted: 'encrypted-filename',
        filenameIv: 'filename-iv',
        fileKeyEncrypted: 'encrypted-key',
        fileSize: 1024,
        encryptedSize,
        mimeType: 'application/pdf',
        fileHash: 'test-hash',
        fileData,
      });

      const updatedUser = await prisma.user.findUnique({
        where: { id: testUser.id },
      });

      expect(Number(updatedUser?.storageUsed)).toBe(encryptedSize);
    });

    it('should reject file creation when quota exceeded', async () => {
      // Update user to have very low quota
      await prisma.user.update({
        where: { id: testUser.id },
        data: { storageQuota: BigInt(100) },
      });

      const fileData = Buffer.from('test file content');

      await expect(
        fileService.createFile({
          userId: testUser.id,
          filenameEncrypted: 'encrypted-filename',
          filenameIv: 'filename-iv',
          fileKeyEncrypted: 'encrypted-key',
          fileSize: 1024,
          encryptedSize: 200, // Exceeds quota
          mimeType: 'application/pdf',
          fileHash: 'test-hash',
          fileData,
        })
      ).rejects.toThrow(PaymentRequiredError);
    });

    it('should reject file with zero size', async () => {
      const fileData = Buffer.from('');

      await expect(
        fileService.createFile({
          userId: testUser.id,
          filenameEncrypted: 'encrypted-filename',
          filenameIv: 'filename-iv',
          fileKeyEncrypted: 'encrypted-key',
          fileSize: 0,
          encryptedSize: 0,
          mimeType: 'application/pdf',
          fileHash: 'test-hash',
          fileData,
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should reject file with negative size', async () => {
      const fileData = Buffer.from('test');

      await expect(
        fileService.createFile({
          userId: testUser.id,
          filenameEncrypted: 'encrypted-filename',
          filenameIv: 'filename-iv',
          fileKeyEncrypted: 'encrypted-key',
          fileSize: -100,
          encryptedSize: -100,
          mimeType: 'application/pdf',
          fileHash: 'test-hash',
          fileData,
        })
      ).rejects.toThrow();
    });

    it('should create file in parent folder', async () => {
      // Create a folder first
      const folder = await prisma.folder.create({
        data: {
          id: 'folder-id',
          userId: testUser.id,
          nameEncrypted: 'encrypted-folder-name',
          nameIv: 'folder-iv',
        },
      });

      const fileData = Buffer.from('test file content');
      const file = await fileService.createFile({
        userId: testUser.id,
        parentFolderId: folder.id,
        filenameEncrypted: 'encrypted-filename',
        filenameIv: 'filename-iv',
        fileKeyEncrypted: 'encrypted-key',
        fileSize: 1024,
        encryptedSize: 1536,
        mimeType: 'application/pdf',
        fileHash: 'test-hash',
        fileData,
      });

      expect(file.parentFolderId).toBe(folder.id);
    });

    it('should reject file creation with non-existent parent folder', async () => {
      const fileData = Buffer.from('test file content');

      await expect(
        fileService.createFile({
          userId: testUser.id,
          parentFolderId: 'non-existent-folder-id',
          filenameEncrypted: 'encrypted-filename',
          filenameIv: 'filename-iv',
          fileKeyEncrypted: 'encrypted-key',
          fileSize: 1024,
          encryptedSize: 1536,
          mimeType: 'application/pdf',
          fileHash: 'test-hash',
          fileData,
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('should upload thumbnail if provided', async () => {
      const fileData = Buffer.from('test file content');
      const thumbnailData = Buffer.from('thumbnail data');

      const file = await fileService.createFile({
        userId: testUser.id,
        filenameEncrypted: 'encrypted-filename',
        filenameIv: 'filename-iv',
        fileKeyEncrypted: 'encrypted-key',
        fileSize: 1024,
        encryptedSize: 1536,
        mimeType: 'image/jpeg',
        fileHash: 'test-hash',
        fileData,
        thumbnailData,
      });

      expect(file.thumbnailPath).toBeDefined();
    });
  });

  describe('File Retrieval', () => {
    let testFile: any;

    beforeEach(async () => {
      testFile = await global.testUtils.createTestFile(testUser.id);
    });

    it('should get file by ID', async () => {
      const file = await fileService.getFileById(testFile.id, testUser.id);

      expect(file).toBeDefined();
      expect(file.id).toBe(testFile.id);
      expect(file.userId).toBe(testUser.id);
    });

    it('should reject getting file owned by different user', async () => {
      const otherUser = await global.testUtils.createTestUser();

      await expect(
        fileService.getFileById(testFile.id, otherUser.id)
      ).rejects.toThrow(NotFoundError);
    });

    it('should reject getting deleted file', async () => {
      await prisma.file.update({
        where: { id: testFile.id },
        data: { isDeleted: true },
      });

      await expect(
        fileService.getFileById(testFile.id, testUser.id)
      ).rejects.toThrow(NotFoundError);
    });

    it('should get files list', async () => {
      // Create multiple files
      await global.testUtils.createTestFile(testUser.id);
      await global.testUtils.createTestFile(testUser.id);

      const result = await fileService.getFiles({
        userId: testUser.id,
      });

      expect(result.files.length).toBeGreaterThanOrEqual(3);
      expect(result.total).toBeGreaterThanOrEqual(3);
    });

    it('should filter files by parent folder', async () => {
      const folder = await prisma.folder.create({
        data: {
          id: 'test-folder',
          userId: testUser.id,
          nameEncrypted: 'folder',
          nameIv: 'iv',
        },
      });

      await global.testUtils.createTestFile(testUser.id, {
        parentFolderId: folder.id,
      });

      const result = await fileService.getFiles({
        userId: testUser.id,
        parentFolderId: folder.id,
      });

      expect(result.files.length).toBe(1);
      expect(result.files[0].parentFolderId).toBe(folder.id);
    });

    it('should paginate files', async () => {
      // Create multiple files
      for (let i = 0; i < 5; i++) {
        await global.testUtils.createTestFile(testUser.id);
      }

      const result = await fileService.getFiles({
        userId: testUser.id,
        limit: 2,
        offset: 0,
      });

      expect(result.files.length).toBe(2);
      expect(result.limit).toBe(2);
    });

    it('should sort files', async () => {
      const result = await fileService.getFiles({
        userId: testUser.id,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      expect(result.files).toBeDefined();
    });
  });

  describe('File Download', () => {
    let testFile: any;

    beforeEach(async () => {
      testFile = await global.testUtils.createTestFile(testUser.id);
    });

    it('should download file successfully', async () => {
      const result = await fileService.downloadFile(
        testFile.id,
        testUser.id
      );

      expect(result.stream).toBeDefined();
      expect(result.file).toBeDefined();
      expect(result.file.id).toBe(testFile.id);
    });

    it('should reject download of non-existent file', async () => {
      await expect(
        fileService.downloadFile('non-existent-id', testUser.id)
      ).rejects.toThrow(NotFoundError);
    });

    it('should reject download by different user', async () => {
      const otherUser = await global.testUtils.createTestUser();

      await expect(
        fileService.downloadFile(testFile.id, otherUser.id)
      ).rejects.toThrow(NotFoundError);
    });

    it('should reject download of deleted file', async () => {
      await prisma.file.update({
        where: { id: testFile.id },
        data: { isDeleted: true },
      });

      await expect(
        fileService.downloadFile(testFile.id, testUser.id)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('File Update', () => {
    let testFile: any;

    beforeEach(async () => {
      testFile = await global.testUtils.createTestFile(testUser.id);
    });

    it('should update file name', async () => {
      const updatedFile = await fileService.updateFile(
        testFile.id,
        testUser.id,
        {
          filenameEncrypted: 'new-encrypted-name',
          filenameIv: 'new-iv',
        }
      );

      expect(updatedFile.filenameEncrypted).toBe('new-encrypted-name');
      expect(updatedFile.filenameIv).toBe('new-iv');
    });

    it('should move file to different folder', async () => {
      const folder = await prisma.folder.create({
        data: {
          id: 'new-folder',
          userId: testUser.id,
          nameEncrypted: 'folder',
          nameIv: 'iv',
        },
      });

      const updatedFile = await fileService.updateFile(
        testFile.id,
        testUser.id,
        {
          parentFolderId: folder.id,
        }
      );

      expect(updatedFile.parentFolderId).toBe(folder.id);
    });

    it('should move file to root (null parent)', async () => {
      const updatedFile = await fileService.updateFile(
        testFile.id,
        testUser.id,
        {
          parentFolderId: null,
        }
      );

      expect(updatedFile.parentFolderId).toBeNull();
    });

    it('should reject update by different user', async () => {
      const otherUser = await global.testUtils.createTestUser();

      await expect(
        fileService.updateFile(testFile.id, otherUser.id, {
          filenameEncrypted: 'new-name',
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('should reject update to non-existent folder', async () => {
      await expect(
        fileService.updateFile(testFile.id, testUser.id, {
          parentFolderId: 'non-existent-folder',
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('File Deletion', () => {
    let testFile: any;

    beforeEach(async () => {
      testFile = await global.testUtils.createTestFile(testUser.id, {
        encryptedSize: BigInt(2048),
      });

      // Update user storage
      await prisma.user.update({
        where: { id: testUser.id },
        data: { storageUsed: BigInt(2048) },
      });
    });

    it('should soft delete file', async () => {
      await fileService.deleteFile(testFile.id, testUser.id, false);

      const deletedFile = await prisma.file.findUnique({
        where: { id: testFile.id },
      });

      expect(deletedFile?.isDeleted).toBe(true);
      expect(deletedFile?.deletedAt).toBeDefined();
    });

    it('should update storage usage on soft delete', async () => {
      await fileService.deleteFile(testFile.id, testUser.id, false);

      const updatedUser = await prisma.user.findUnique({
        where: { id: testUser.id },
      });

      expect(Number(updatedUser?.storageUsed)).toBe(0);
    });

    it('should permanently delete file', async () => {
      await fileService.deleteFile(testFile.id, testUser.id, true);

      const deletedFile = await prisma.file.findUnique({
        where: { id: testFile.id },
      });

      expect(deletedFile).toBeNull();
    });

    it('should reject deletion by different user', async () => {
      const otherUser = await global.testUtils.createTestUser();

      await expect(
        fileService.deleteFile(testFile.id, otherUser.id, false)
      ).rejects.toThrow(NotFoundError);
    });

    it('should not double-decrement storage on already deleted file', async () => {
      // Soft delete once
      await fileService.deleteFile(testFile.id, testUser.id, false);

      const userAfterFirst = await prisma.user.findUnique({
        where: { id: testUser.id },
      });

      // Permanent delete
      await fileService.deleteFile(testFile.id, testUser.id, true);

      const userAfterSecond = await prisma.user.findUnique({
        where: { id: testUser.id },
      });

      expect(userAfterFirst?.storageUsed).toEqual(userAfterSecond?.storageUsed);
    });
  });

  describe('File Restoration', () => {
    let deletedFile: any;

    beforeEach(async () => {
      deletedFile = await global.testUtils.createTestFile(testUser.id, {
        isDeleted: true,
        deletedAt: new Date(),
        encryptedSize: BigInt(1024),
      });
    });

    it('should restore deleted file', async () => {
      const restoredFile = await fileService.restoreFile(
        deletedFile.id,
        testUser.id
      );

      expect(restoredFile.isDeleted).toBe(false);
      expect(restoredFile.deletedAt).toBeNull();
    });

    it('should update storage usage on restoration', async () => {
      await fileService.restoreFile(deletedFile.id, testUser.id);

      const updatedUser = await prisma.user.findUnique({
        where: { id: testUser.id },
      });

      expect(Number(updatedUser?.storageUsed)).toBe(1024);
    });

    it('should reject restoration if quota exceeded', async () => {
      // Set very low quota
      await prisma.user.update({
        where: { id: testUser.id },
        data: { storageQuota: BigInt(100), storageUsed: BigInt(50) },
      });

      await expect(
        fileService.restoreFile(deletedFile.id, testUser.id)
      ).rejects.toThrow(PaymentRequiredError);
    });

    it('should reject restoration of non-deleted file', async () => {
      const activeFile = await global.testUtils.createTestFile(testUser.id);

      await expect(
        fileService.restoreFile(activeFile.id, testUser.id)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('File Versioning', () => {
    let testFile: any;

    beforeEach(async () => {
      testFile = await global.testUtils.createTestFile(testUser.id);
    });

    it('should create file version', async () => {
      const versionData = Buffer.from('version content');

      const version = await fileService.createFileVersion({
        fileId: testFile.id,
        userId: testUser.id,
        versionNumber: 2,
        fileData: versionData,
        fileSize: 1024,
        fileKeyEncrypted: 'version-key',
      });

      expect(version).toBeDefined();
      expect(version.fileId).toBe(testFile.id);
      expect(version.versionNumber).toBe(2);
    });

    it('should reject version for non-existent file', async () => {
      const versionData = Buffer.from('version content');

      await expect(
        fileService.createFileVersion({
          fileId: 'non-existent',
          userId: testUser.id,
          versionNumber: 2,
          fileData: versionData,
          fileSize: 1024,
          fileKeyEncrypted: 'version-key',
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('Storage Statistics', () => {
    beforeEach(async () => {
      // Create some files
      await global.testUtils.createTestFile(testUser.id, {
        encryptedSize: BigInt(1024),
      });
      await global.testUtils.createTestFile(testUser.id, {
        encryptedSize: BigInt(2048),
      });
      await global.testUtils.createTestFile(testUser.id, {
        encryptedSize: BigInt(512),
        isDeleted: true,
      });

      // Update storage
      await prisma.user.update({
        where: { id: testUser.id },
        data: { storageUsed: BigInt(3072) },
      });
    });

    it('should get user storage stats', async () => {
      const stats = await fileService.getUserStorageStats(testUser.id);

      expect(stats).toHaveProperty('quota');
      expect(stats).toHaveProperty('used');
      expect(stats).toHaveProperty('available');
      expect(stats).toHaveProperty('usagePercentage');
      expect(stats).toHaveProperty('fileCount');
      expect(stats).toHaveProperty('deletedFileCount');
    });

    it('should count active files correctly', async () => {
      const stats = await fileService.getUserStorageStats(testUser.id);

      expect(stats.fileCount).toBe(2); // Not counting deleted
    });

    it('should count deleted files correctly', async () => {
      const stats = await fileService.getUserStorageStats(testUser.id);

      expect(stats.deletedFileCount).toBe(1);
    });

    it('should calculate usage percentage', async () => {
      const stats = await fileService.getUserStorageStats(testUser.id);

      expect(stats.usagePercentage).toBeGreaterThan(0);
      expect(stats.usagePercentage).toBeLessThanOrEqual(100);
    });
  });

  describe('File Deduplication', () => {
    it('should find file by hash', async () => {
      const testFile = await global.testUtils.createTestFile(testUser.id, {
        fileHash: 'unique-hash-12345',
      });

      const found = await fileService.findFileByHash(testUser.id, 'unique-hash-12345');

      expect(found).toBeDefined();
      expect(found?.id).toBe(testFile.id);
    });

    it('should not find deleted file by hash', async () => {
      await global.testUtils.createTestFile(testUser.id, {
        fileHash: 'deleted-hash',
        isDeleted: true,
      });

      const found = await fileService.findFileByHash(testUser.id, 'deleted-hash');

      expect(found).toBeNull();
    });

    it('should not find other user files by hash', async () => {
      const otherUser = await global.testUtils.createTestUser();
      await global.testUtils.createTestFile(otherUser.id, {
        fileHash: 'other-user-hash',
      });

      const found = await fileService.findFileByHash(testUser.id, 'other-user-hash');

      expect(found).toBeNull();
    });
  });
});
