import { prisma } from '../src/config/database';
import { redisClient } from '../src/config/redis';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.JWT_EXPIRES_IN = '7d';

// Mock Redis for tests
jest.mock('../src/config/redis', () => ({
  redisClient: {
    ping: jest.fn().mockResolvedValue('PONG'),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    quit: jest.fn().mockResolvedValue('OK'),
  },
  setCache: jest.fn().mockResolvedValue(undefined),
  getCache: jest.fn().mockResolvedValue(null),
  deleteCache: jest.fn().mockResolvedValue(undefined),
  deleteCachePattern: jest.fn().mockResolvedValue(undefined),
}));

// Mock MinIO storage service
jest.mock('../src/config/storage', () => ({
  storageClient: {
    bucketExists: jest.fn().mockResolvedValue(true),
    makeBucket: jest.fn().mockResolvedValue(undefined),
    putObject: jest.fn().mockResolvedValue({ etag: 'test-etag' }),
    getObject: jest.fn().mockResolvedValue({}),
    removeObject: jest.fn().mockResolvedValue(undefined),
    statObject: jest.fn().mockResolvedValue({ size: 1024 }),
  },
}));

// Mock storage service functions
jest.mock('../src/services/storage.service', () => ({
  uploadFile: jest.fn().mockResolvedValue({
    storagePath: 'test/path/file.enc',
    etag: 'test-etag',
  }),
  uploadThumbnail: jest.fn().mockResolvedValue({
    thumbnailPath: 'test/path/thumbnail.jpg',
  }),
  downloadFile: jest.fn().mockImplementation(() => {
    const { Readable } = require('stream');
    const stream = new Readable();
    stream.push('encrypted file content');
    stream.push(null);
    return Promise.resolve({
      stream,
      metadata: { size: 1024 },
    });
  }),
  deleteFile: jest.fn().mockResolvedValue(undefined),
  deleteMultipleFiles: jest.fn().mockResolvedValue(undefined),
  validateStorageQuota: jest.fn().mockReturnValue(true),
}));

// Mock logger to reduce noise in tests
jest.mock('../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  logApiRequest: jest.fn(),
}));

// Clean up database after all tests
afterAll(async () => {
  await prisma.$disconnect();
});

// Global test utilities
global.testUtils = {
  createTestUser: async (overrides = {}) => {
    const bcrypt = require('bcrypt');
    const { v4: uuidv4 } = require('uuid');

    const defaultUser = {
      id: uuidv4(),
      email: `test-${Date.now()}@example.com`,
      username: `testuser${Date.now()}`,
      passwordHash: await bcrypt.hash('Test123!@#', 12),
      salt: 'test-salt',
      masterKeyEncrypted: 'encrypted-master-key',
      publicKey: 'public-key',
      privateKeyEncrypted: 'encrypted-private-key',
      storageQuota: BigInt(10737418240), // 10GB
      storageUsed: BigInt(0),
      isActive: true,
      emailVerified: false,
      ...overrides,
    };

    return await prisma.user.create({
      data: defaultUser,
    });
  },

  createTestFile: async (userId: string, overrides = {}) => {
    const { v4: uuidv4 } = require('uuid');

    const defaultFile = {
      id: uuidv4(),
      userId,
      filenameEncrypted: 'encrypted-filename',
      filenameIv: 'filename-iv',
      fileKeyEncrypted: 'encrypted-file-key',
      fileSize: BigInt(1024),
      encryptedSize: BigInt(1536),
      mimeType: 'application/octet-stream',
      storagePath: 'test/path/file.enc',
      fileHash: 'test-hash',
      encryptionAlgorithm: 'AES-256-GCM',
      ...overrides,
    };

    return await prisma.file.create({
      data: defaultFile,
    });
  },

  cleanupTestData: async () => {
    // Clean up in reverse order of dependencies
    await prisma.auditLog.deleteMany({});
    await prisma.fileVersion.deleteMany({});
    await prisma.share.deleteMany({});
    await prisma.file.deleteMany({});
    await prisma.folder.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({});
  },
};

// Extend global type for TypeScript
declare global {
  var testUtils: {
    createTestUser: (overrides?: any) => Promise<any>;
    createTestFile: (userId: string, overrides?: any) => Promise<any>;
    cleanupTestData: () => Promise<void>;
  };
}
