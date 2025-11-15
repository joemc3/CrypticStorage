/**
 * Integration Tests for Authentication Endpoints
 * Tests /api/auth routes: register, login, logout, 2FA
 */

import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';

describe('Authentication Endpoints', () => {
  beforeEach(async () => {
    await global.testUtils.cleanupTestData();
  });

  afterAll(async () => {
    await global.testUtils.cleanupTestData();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'newuser@example.com',
        username: 'newuser',
        password: 'Test123!@#',
        masterKey: 'encrypted-master-key',
        publicKey: 'public-key',
        privateKeyEncrypted: 'encrypted-private-key',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data.user.email).toBe(userData.email);
    });

    it('should reject registration with existing email', async () => {
      const userData = {
        email: 'duplicate@example.com',
        username: 'user1',
        password: 'Test123!@#',
        masterKey: 'encrypted-master-key',
        publicKey: 'public-key',
        privateKeyEncrypted: 'encrypted-private-key',
      };

      // First registration
      await request(app).post('/api/auth/register').send(userData);

      // Attempt duplicate registration
      const response = await request(app)
        .post('/api/auth/register')
        .send({ ...userData, username: 'user2' })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Email already registered');
    });

    it('should reject registration with existing username', async () => {
      const userData = {
        email: 'user1@example.com',
        username: 'duplicateuser',
        password: 'Test123!@#',
        masterKey: 'encrypted-master-key',
        publicKey: 'public-key',
        privateKeyEncrypted: 'encrypted-private-key',
      };

      // First registration
      await request(app).post('/api/auth/register').send(userData);

      // Attempt duplicate registration
      const response = await request(app)
        .post('/api/auth/register')
        .send({ ...userData, email: 'user2@example.com' })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Username already taken');
    });

    it('should reject registration with invalid email', async () => {
      const userData = {
        email: 'invalid-email',
        username: 'testuser',
        password: 'Test123!@#',
        masterKey: 'encrypted-master-key',
        publicKey: 'public-key',
        privateKeyEncrypted: 'encrypted-private-key',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject registration with weak password', async () => {
      const userData = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'weak', // Too weak
        masterKey: 'encrypted-master-key',
        publicKey: 'public-key',
        privateKeyEncrypted: 'encrypted-private-key',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should create audit log on registration', async () => {
      const userData = {
        email: 'audit@example.com',
        username: 'audituser',
        password: 'Test123!@#',
        masterKey: 'encrypted-master-key',
        publicKey: 'public-key',
        privateKeyEncrypted: 'encrypted-private-key',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          userId: response.body.data.user.id,
          action: 'USER_REGISTERED',
        },
      });

      expect(auditLog).toBeDefined();
    });
  });

  describe('POST /api/auth/login', () => {
    let testUser: any;

    beforeEach(async () => {
      testUser = await global.testUtils.createTestUser({
        email: 'login@example.com',
        username: 'loginuser',
      });
    });

    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'Test123!@#',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
    });

    it('should login with username', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'loginuser', // Using username
          password: 'Test123!@#',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject login with wrong password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'WrongPassword123!',
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should reject login with non-existent email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'Test123!@#',
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should reject login for inactive user', async () => {
      await prisma.user.update({
        where: { id: testUser.id },
        data: { isActive: false },
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'Test123!@#',
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should request 2FA token if enabled', async () => {
      await prisma.user.update({
        where: { id: testUser.id },
        data: { totpSecretEncrypted: 'encrypted-secret' },
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'Test123!@#',
        })
        .expect(200);

      expect(response.body.data.requiresTwoFactor).toBe(true);
    });

    it('should create session on successful login', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'Test123!@#',
        })
        .expect(200);

      const sessions = await prisma.session.findMany({
        where: { userId: testUser.id },
      });

      expect(sessions.length).toBeGreaterThan(0);
    });

    it('should update lastLogin timestamp', async () => {
      const beforeLogin = testUser.lastLogin;

      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'Test123!@#',
        })
        .expect(200);

      const updatedUser = await prisma.user.findUnique({
        where: { id: testUser.id },
      });

      expect(updatedUser?.lastLogin).toBeDefined();
      if (beforeLogin) {
        expect(updatedUser?.lastLogin?.getTime()).toBeGreaterThan(beforeLogin.getTime());
      }
    });

    it('should log failed login attempt', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'WrongPassword123!',
        })
        .expect(401);

      const failedLog = await prisma.auditLog.findFirst({
        where: {
          userId: testUser.id,
          action: 'LOGIN_FAILED',
          success: false,
        },
      });

      expect(failedLog).toBeDefined();
    });
  });

  describe('POST /api/auth/logout', () => {
    let testUser: any;
    let accessToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      testUser = await global.testUtils.createTestUser();

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'Test123!@#',
        });

      accessToken = loginResponse.body.data.accessToken;
      refreshToken = loginResponse.body.data.refreshToken;
    });

    it('should logout successfully', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should delete session on logout', async () => {
      const sessionsBefore = await prisma.session.findMany({
        where: { userId: testUser.id },
      });

      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);

      const sessionsAfter = await prisma.session.findMany({
        where: { userId: testUser.id },
      });

      expect(sessionsAfter.length).toBeLessThan(sessionsBefore.length);
    });

    it('should reject logout without authentication', async () => {
      await request(app)
        .post('/api/auth/logout')
        .send({ refreshToken })
        .expect(401);
    });

    it('should log logout action', async () => {
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);

      const logoutLog = await prisma.auditLog.findFirst({
        where: {
          userId: testUser.id,
          action: 'USER_LOGOUT',
        },
      });

      expect(logoutLog).toBeDefined();
    });
  });

  describe('POST /api/auth/refresh', () => {
    let testUser: any;
    let accessToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      testUser = await global.testUtils.createTestUser();

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'Test123!@#',
        });

      accessToken = loginResponse.body.data.accessToken;
      refreshToken = loginResponse.body.data.refreshToken;
    });

    it('should refresh access token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${refreshToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data.accessToken).not.toBe(accessToken);
    });

    it('should reject refresh without token', async () => {
      await request(app)
        .post('/api/auth/refresh')
        .expect(401);
    });

    it('should reject refresh for inactive user', async () => {
      await prisma.user.update({
        where: { id: testUser.id },
        data: { isActive: false },
      });

      await request(app)
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${refreshToken}`)
        .expect(401);
    });
  });

  describe('POST /api/auth/2fa/enable', () => {
    let testUser: any;
    let accessToken: string;

    beforeEach(async () => {
      testUser = await global.testUtils.createTestUser();

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'Test123!@#',
        });

      accessToken = loginResponse.body.data.accessToken;
    });

    it('should initiate 2FA setup', async () => {
      const response = await request(app)
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('secret');
      expect(response.body.data).toHaveProperty('qrCode');
      expect(response.body.data).toHaveProperty('otpAuthUrl');
    });

    it('should reject 2FA setup without authentication', async () => {
      await request(app)
        .post('/api/auth/2fa/enable')
        .expect(401);
    });

    it('should reject if 2FA already enabled', async () => {
      await prisma.user.update({
        where: { id: testUser.id },
        data: { totpSecretEncrypted: 'already-enabled' },
      });

      await request(app)
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });
  });

  describe('POST /api/auth/2fa/verify', () => {
    let testUser: any;
    let accessToken: string;
    let secret: string;

    beforeEach(async () => {
      testUser = await global.testUtils.createTestUser();

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'Test123!@#',
        });

      accessToken = loginResponse.body.data.accessToken;

      const setupResponse = await request(app)
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${accessToken}`);

      secret = setupResponse.body.data.secret;
    });

    it('should verify and activate 2FA with valid token', async () => {
      const speakeasy = require('speakeasy');
      const token = speakeasy.totp({
        secret,
        encoding: 'base32',
      });

      const response = await request(app)
        .post('/api/auth/2fa/verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ token, secret })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject invalid 2FA token', async () => {
      await request(app)
        .post('/api/auth/2fa/verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ token: '000000', secret })
        .expect(400);
    });

    it('should save 2FA secret on verification', async () => {
      const speakeasy = require('speakeasy');
      const token = speakeasy.totp({
        secret,
        encoding: 'base32',
      });

      await request(app)
        .post('/api/auth/2fa/verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ token, secret })
        .expect(200);

      const updatedUser = await prisma.user.findUnique({
        where: { id: testUser.id },
      });

      expect(updatedUser?.totpSecretEncrypted).toBeDefined();
    });
  });

  describe('POST /api/auth/2fa/disable', () => {
    let testUser: any;
    let accessToken: string;

    beforeEach(async () => {
      testUser = await global.testUtils.createTestUser({
        totpSecretEncrypted: 'JBSWY3DPEHPK3PXP', // Valid base32 secret
      });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'Test123!@#',
        });

      accessToken = loginResponse.body.data.accessToken;
    });

    it('should disable 2FA with valid credentials', async () => {
      const speakeasy = require('speakeasy');
      const token = speakeasy.totp({
        secret: 'JBSWY3DPEHPK3PXP',
        encoding: 'base32',
      });

      const response = await request(app)
        .post('/api/auth/2fa/disable')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          password: 'Test123!@#',
          token,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject 2FA disable with wrong password', async () => {
      const speakeasy = require('speakeasy');
      const token = speakeasy.totp({
        secret: 'JBSWY3DPEHPK3PXP',
        encoding: 'base32',
      });

      await request(app)
        .post('/api/auth/2fa/disable')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          password: 'WrongPassword123!',
          token,
        })
        .expect(401);
    });

    it('should reject 2FA disable with wrong token', async () => {
      await request(app)
        .post('/api/auth/2fa/disable')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          password: 'Test123!@#',
          token: '000000',
        })
        .expect(400);
    });

    it('should remove 2FA secret on disable', async () => {
      const speakeasy = require('speakeasy');
      const token = speakeasy.totp({
        secret: 'JBSWY3DPEHPK3PXP',
        encoding: 'base32',
      });

      await request(app)
        .post('/api/auth/2fa/disable')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          password: 'Test123!@#',
          token,
        })
        .expect(200);

      const updatedUser = await prisma.user.findUnique({
        where: { id: testUser.id },
      });

      expect(updatedUser?.totpSecretEncrypted).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown auth routes', async () => {
      await request(app)
        .post('/api/auth/unknown-route')
        .expect(404);
    });

    it('should handle malformed JSON', async () => {
      await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);
    });

    it('should handle missing required fields', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com' }) // Missing password
        .expect(400);
    });
  });
});
