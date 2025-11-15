/**
 * Unit Tests for Authentication Service
 * Tests user registration, login, session management, and 2FA
 */

import { prisma } from '../../src/config/database';
import * as authService from '../../src/services/auth.service';
import { ConflictError, AuthError, NotFoundError } from '../../src/utils/errors';

describe('Authentication Service', () => {
  beforeEach(async () => {
    await global.testUtils.cleanupTestData();
  });

  afterAll(async () => {
    await global.testUtils.cleanupTestData();
  });

  describe('User Registration', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'newuser@example.com',
        username: 'newuser',
        password: 'Test123!@#',
        masterKeyEncrypted: 'encrypted-master-key',
        publicKey: 'public-key',
        privateKeyEncrypted: 'encrypted-private-key',
        salt: 'salt',
      };

      const result = await authService.register(userData);

      expect(result).toHaveProperty('userId');
      expect(result).toHaveProperty('sessionId');
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('expiresAt');

      // Verify user was created in database
      const user = await prisma.user.findUnique({
        where: { email: userData.email },
      });
      expect(user).toBeDefined();
      expect(user?.username).toBe(userData.username);
    });

    it('should hash password during registration', async () => {
      const userData = {
        email: 'hashtest@example.com',
        username: 'hashtest',
        password: 'Test123!@#',
        masterKeyEncrypted: 'encrypted-master-key',
        publicKey: 'public-key',
        privateKeyEncrypted: 'encrypted-private-key',
        salt: 'salt',
      };

      await authService.register(userData);

      const user = await prisma.user.findUnique({
        where: { email: userData.email },
      });

      expect(user?.passwordHash).toBeDefined();
      expect(user?.passwordHash).not.toBe(userData.password);
      expect(user?.passwordHash).toMatch(/^\$2[aby]\$/); // bcrypt format
    });

    it('should reject registration with existing email', async () => {
      const userData = {
        email: 'duplicate@example.com',
        username: 'user1',
        password: 'Test123!@#',
        masterKeyEncrypted: 'encrypted-master-key',
        publicKey: 'public-key',
        privateKeyEncrypted: 'encrypted-private-key',
        salt: 'salt',
      };

      await authService.register(userData);

      // Try to register again with same email
      const duplicateData = { ...userData, username: 'user2' };
      await expect(authService.register(duplicateData)).rejects.toThrow(ConflictError);
    });

    it('should reject registration with existing username', async () => {
      const userData = {
        email: 'user1@example.com',
        username: 'sameusername',
        password: 'Test123!@#',
        masterKeyEncrypted: 'encrypted-master-key',
        publicKey: 'public-key',
        privateKeyEncrypted: 'encrypted-private-key',
        salt: 'salt',
      };

      await authService.register(userData);

      // Try to register again with same username
      const duplicateData = { ...userData, email: 'user2@example.com' };
      await expect(authService.register(duplicateData)).rejects.toThrow(ConflictError);
    });

    it('should reject registration with short password', async () => {
      const userData = {
        email: 'shortpw@example.com',
        username: 'shortpw',
        password: 'Short1!', // Only 7 characters
        masterKeyEncrypted: 'encrypted-master-key',
        publicKey: 'public-key',
        privateKeyEncrypted: 'encrypted-private-key',
        salt: 'salt',
      };

      await expect(authService.register(userData)).rejects.toThrow();
    });

    it('should create initial session on registration', async () => {
      const userData = {
        email: 'session@example.com',
        username: 'sessionuser',
        password: 'Test123!@#',
        masterKeyEncrypted: 'encrypted-master-key',
        publicKey: 'public-key',
        privateKeyEncrypted: 'encrypted-private-key',
        salt: 'salt',
      };

      const result = await authService.register(userData);

      const session = await prisma.session.findUnique({
        where: { id: result.sessionId },
      });

      expect(session).toBeDefined();
      expect(session?.userId).toBe(result.userId);
    });
  });

  describe('User Login', () => {
    let testUser: any;

    beforeEach(async () => {
      testUser = await global.testUtils.createTestUser({
        email: 'login@example.com',
        username: 'loginuser',
      });
    });

    it('should login with valid email and password', async () => {
      const result = await authService.login({
        emailOrUsername: testUser.email,
        password: 'Test123!@#',
      });

      expect(result).toHaveProperty('userId');
      expect(result).toHaveProperty('sessionId');
      expect(result).toHaveProperty('token');
      expect(result.userId).toBe(testUser.id);
    });

    it('should login with username', async () => {
      const result = await authService.login({
        emailOrUsername: testUser.username,
        password: 'Test123!@#',
      });

      expect(result.userId).toBe(testUser.id);
    });

    it('should reject login with wrong password', async () => {
      await expect(
        authService.login({
          emailOrUsername: testUser.email,
          password: 'WrongPassword123!',
        })
      ).rejects.toThrow(AuthError);
    });

    it('should reject login with non-existent email', async () => {
      await expect(
        authService.login({
          emailOrUsername: 'nonexistent@example.com',
          password: 'Test123!@#',
        })
      ).rejects.toThrow(AuthError);
    });

    it('should reject login for inactive user', async () => {
      await prisma.user.update({
        where: { id: testUser.id },
        data: { isActive: false },
      });

      await expect(
        authService.login({
          emailOrUsername: testUser.email,
          password: 'Test123!@#',
        })
      ).rejects.toThrow(AuthError);
    });

    it('should update lastLogin on successful login', async () => {
      const beforeLogin = testUser.lastLogin;

      await authService.login({
        emailOrUsername: testUser.email,
        password: 'Test123!@#',
      });

      const updatedUser = await prisma.user.findUnique({
        where: { id: testUser.id },
      });

      expect(updatedUser?.lastLogin).toBeDefined();
      if (beforeLogin) {
        expect(updatedUser?.lastLogin?.getTime()).toBeGreaterThan(beforeLogin.getTime());
      }
    });

    it('should create session on login', async () => {
      const result = await authService.login({
        emailOrUsername: testUser.email,
        password: 'Test123!@#',
      });

      const session = await prisma.session.findUnique({
        where: { id: result.sessionId },
      });

      expect(session).toBeDefined();
      expect(session?.userId).toBe(testUser.id);
    });

    it('should store IP and user agent in session', async () => {
      const loginData = {
        emailOrUsername: testUser.email,
        password: 'Test123!@#',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0...',
      };

      const result = await authService.login(loginData);

      const session = await prisma.session.findUnique({
        where: { id: result.sessionId },
      });

      expect(session?.ipAddress).toBe(loginData.ipAddress);
      expect(session?.userAgent).toBe(loginData.userAgent);
    });
  });

  describe('Session Management', () => {
    let testUser: any;

    beforeEach(async () => {
      testUser = await global.testUtils.createTestUser();
    });

    it('should create session successfully', async () => {
      const session = await authService.createSession(testUser.id);

      expect(session).toHaveProperty('userId');
      expect(session).toHaveProperty('sessionId');
      expect(session).toHaveProperty('token');
      expect(session).toHaveProperty('expiresAt');
      expect(session.userId).toBe(testUser.id);
    });

    it('should validate valid session', async () => {
      const session = await authService.createSession(testUser.id);
      const validated = await authService.validateSession(session.token);

      expect(validated.userId).toBe(testUser.id);
      expect(validated.sessionId).toBe(session.sessionId);
    });

    it('should reject invalid token', async () => {
      await expect(
        authService.validateSession('invalid.token.here')
      ).rejects.toThrow();
    });

    it('should reject expired session', async () => {
      // Create session that's already expired
      const session = await authService.createSession(testUser.id);

      // Update session to be expired
      await prisma.session.update({
        where: { id: session.sessionId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await expect(
        authService.validateSession(session.token)
      ).rejects.toThrow(AuthError);
    });

    it('should delete session on logout', async () => {
      const session = await authService.createSession(testUser.id);

      await authService.logout(session.sessionId);

      const deletedSession = await prisma.session.findUnique({
        where: { id: session.sessionId },
      });

      expect(deletedSession).toBeNull();
    });

    it('should delete all user sessions', async () => {
      // Create multiple sessions
      const session1 = await authService.createSession(testUser.id);
      const session2 = await authService.createSession(testUser.id);
      const session3 = await authService.createSession(testUser.id);

      await authService.deleteAllUserSessions(testUser.id);

      const remainingSessions = await prisma.session.findMany({
        where: { userId: testUser.id },
      });

      expect(remainingSessions).toHaveLength(0);
    });

    it('should get user sessions', async () => {
      await authService.createSession(testUser.id);
      await authService.createSession(testUser.id);

      const sessions = await authService.getUserSessions(testUser.id);

      expect(sessions).toHaveLength(2);
      expect(sessions[0]).toHaveProperty('id');
      expect(sessions[0]).toHaveProperty('createdAt');
    });
  });

  describe('Two-Factor Authentication', () => {
    let testUser: any;

    beforeEach(async () => {
      testUser = await global.testUtils.createTestUser();
    });

    it('should setup TOTP successfully', async () => {
      const result = await authService.setupTOTP(testUser.id);

      expect(result).toHaveProperty('secret');
      expect(result).toHaveProperty('qrCode');
      expect(result).toHaveProperty('backupCodes');
      expect(result.backupCodes).toHaveLength(8);
      expect(result.qrCode).toMatch(/^data:image/);
    });

    it('should reject TOTP setup for non-existent user', async () => {
      const fakeUserId = '123e4567-e89b-12d3-a456-426614174000';
      await expect(authService.setupTOTP(fakeUserId)).rejects.toThrow(NotFoundError);
    });

    it('should disable TOTP with valid password', async () => {
      // First enable TOTP
      await prisma.user.update({
        where: { id: testUser.id },
        data: { totpSecretEncrypted: 'encrypted-secret' },
      });

      await authService.disableTOTP(testUser.id, 'Test123!@#');

      const updatedUser = await prisma.user.findUnique({
        where: { id: testUser.id },
      });

      expect(updatedUser?.totpSecretEncrypted).toBeNull();
    });

    it('should reject TOTP disable with wrong password', async () => {
      await prisma.user.update({
        where: { id: testUser.id },
        data: { totpSecretEncrypted: 'encrypted-secret' },
      });

      await expect(
        authService.disableTOTP(testUser.id, 'WrongPassword123!')
      ).rejects.toThrow(AuthError);
    });
  });

  describe('Password Management', () => {
    let testUser: any;

    beforeEach(async () => {
      testUser = await global.testUtils.createTestUser();
    });

    it('should change password successfully', async () => {
      const newPassword = 'NewTest123!@#';

      await authService.changePassword(
        testUser.id,
        'Test123!@#',
        newPassword
      );

      // Try logging in with new password
      const result = await authService.login({
        emailOrUsername: testUser.email,
        password: newPassword,
      });

      expect(result.userId).toBe(testUser.id);
    });

    it('should reject password change with wrong current password', async () => {
      await expect(
        authService.changePassword(
          testUser.id,
          'WrongPassword123!',
          'NewTest123!@#'
        )
      ).rejects.toThrow(AuthError);
    });

    it('should reject weak new password', async () => {
      await expect(
        authService.changePassword(
          testUser.id,
          'Test123!@#',
          'weak'
        )
      ).rejects.toThrow();
    });

    it('should delete all sessions after password change', async () => {
      // Create multiple sessions
      await authService.createSession(testUser.id);
      await authService.createSession(testUser.id);

      await authService.changePassword(
        testUser.id,
        'Test123!@#',
        'NewTest123!@#'
      );

      const sessions = await prisma.session.findMany({
        where: { userId: testUser.id },
      });

      expect(sessions).toHaveLength(0);
    });
  });

  describe('Password Hashing and Verification', () => {
    it('should hash password', async () => {
      const password = 'Test123!@#';
      const hash = await authService.hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash).toMatch(/^\$2[aby]\$/);
    });

    it('should verify correct password', async () => {
      const password = 'Test123!@#';
      const hash = await authService.hashPassword(password);
      const isValid = await authService.verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'Test123!@#';
      const hash = await authService.hashPassword(password);
      const isValid = await authService.verifyPassword('WrongPassword', hash);

      expect(isValid).toBe(false);
    });
  });

  describe('JWT Token Operations', () => {
    it('should generate valid token', () => {
      const userId = 'test-user-id';
      const sessionId = 'test-session-id';

      const token = authService.generateToken(userId, sessionId);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should verify and decode token', () => {
      const userId = 'test-user-id';
      const sessionId = 'test-session-id';

      const token = authService.generateToken(userId, sessionId);
      const decoded = authService.verifyToken(token);

      expect(decoded.userId).toBe(userId);
      expect(decoded.sessionId).toBe(sessionId);
    });

    it('should reject tampered token', () => {
      const userId = 'test-user-id';
      const sessionId = 'test-session-id';

      const token = authService.generateToken(userId, sessionId);
      const tamperedToken = token.slice(0, -5) + 'XXXXX';

      expect(() => authService.verifyToken(tamperedToken)).toThrow();
    });
  });

  describe('Get User By ID', () => {
    let testUser: any;

    beforeEach(async () => {
      testUser = await global.testUtils.createTestUser();
    });

    it('should get user by ID', async () => {
      const user = await authService.getUserById(testUser.id);

      expect(user).toBeDefined();
      expect(user.id).toBe(testUser.id);
      expect(user.email).toBe(testUser.email);
      expect(user).toHaveProperty('hasTOTP');
    });

    it('should not expose TOTP secret', async () => {
      await prisma.user.update({
        where: { id: testUser.id },
        data: { totpSecretEncrypted: 'secret' },
      });

      const user = await authService.getUserById(testUser.id);

      expect(user.hasTOTP).toBe(true);
      expect(user.totpSecretEncrypted).toBeUndefined();
    });

    it('should reject non-existent user', async () => {
      const fakeUserId = '123e4567-e89b-12d3-a456-426614174000';
      await expect(authService.getUserById(fakeUserId)).rejects.toThrow(NotFoundError);
    });
  });
});
