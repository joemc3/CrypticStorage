/**
 * Unit Tests for Cryptographic Utilities
 * Tests password hashing, token generation, and verification
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
} from '../../src/services/auth.service';

describe('Cryptographic Utilities', () => {
  const testPassword = 'Test123!@#';
  const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-testing-only';

  describe('Password Hashing', () => {
    it('should hash a password successfully', async () => {
      const hash = await hashPassword(testPassword);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(testPassword);
      expect(hash.length).toBeGreaterThan(0);
      expect(hash).toMatch(/^\$2[aby]\$/); // bcrypt hash format
    });

    it('should generate different hashes for the same password', async () => {
      const hash1 = await hashPassword(testPassword);
      const hash2 = await hashPassword(testPassword);

      expect(hash1).not.toBe(hash2); // Different salts
    });

    it('should hash passwords of various lengths', async () => {
      const shortPassword = 'Short1!';
      const longPassword = 'A'.repeat(50) + '1!';

      const shortHash = await hashPassword(shortPassword);
      const longHash = await hashPassword(longPassword);

      expect(shortHash).toBeDefined();
      expect(longHash).toBeDefined();
    });
  });

  describe('Password Verification', () => {
    let passwordHash: string;

    beforeAll(async () => {
      passwordHash = await hashPassword(testPassword);
    });

    it('should verify correct password', async () => {
      const isValid = await verifyPassword(testPassword, passwordHash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const isValid = await verifyPassword('WrongPassword123!', passwordHash);
      expect(isValid).toBe(false);
    });

    it('should reject password with different case', async () => {
      const isValid = await verifyPassword('test123!@#', passwordHash);
      expect(isValid).toBe(false);
    });

    it('should reject empty password', async () => {
      const isValid = await verifyPassword('', passwordHash);
      expect(isValid).toBe(false);
    });

    it('should handle special characters correctly', async () => {
      const specialPassword = 'P@$$w0rd!#&*()';
      const hash = await hashPassword(specialPassword);
      const isValid = await verifyPassword(specialPassword, hash);
      expect(isValid).toBe(true);
    });
  });

  describe('JWT Token Generation', () => {
    const userId = 'test-user-id';
    const sessionId = 'test-session-id';

    it('should generate a valid JWT token', () => {
      const token = generateToken(userId, sessionId);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should include userId and sessionId in token payload', () => {
      const token = generateToken(userId, sessionId);
      const decoded = jwt.verify(token, JWT_SECRET) as any;

      expect(decoded.userId).toBe(userId);
      expect(decoded.sessionId).toBe(sessionId);
      expect(decoded.type).toBe('access');
    });

    it('should include correct issuer', () => {
      const token = generateToken(userId, sessionId);
      const decoded = jwt.verify(token, JWT_SECRET) as any;

      expect(decoded.iss).toBe('crypticstorage');
    });

    it('should have expiration time', () => {
      const token = generateToken(userId, sessionId);
      const decoded = jwt.verify(token, JWT_SECRET) as any;

      expect(decoded.exp).toBeDefined();
      expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('should generate different tokens for different users', () => {
      const token1 = generateToken('user1', sessionId);
      const token2 = generateToken('user2', sessionId);

      expect(token1).not.toBe(token2);
    });
  });

  describe('JWT Token Verification', () => {
    const userId = 'test-user-id';
    const sessionId = 'test-session-id';

    it('should verify valid token', () => {
      const token = generateToken(userId, sessionId);
      const decoded = verifyToken(token);

      expect(decoded.userId).toBe(userId);
      expect(decoded.sessionId).toBe(sessionId);
    });

    it('should reject invalid token', () => {
      expect(() => verifyToken('invalid.token.here')).toThrow();
    });

    it('should reject token with wrong secret', () => {
      const token = jwt.sign({ userId, sessionId }, 'wrong-secret');
      expect(() => verifyToken(token)).toThrow();
    });

    it('should reject expired token', () => {
      const token = jwt.sign(
        { userId, sessionId, type: 'access' },
        JWT_SECRET,
        { expiresIn: '0s', issuer: 'crypticstorage' }
      );

      // Wait a bit to ensure expiration
      setTimeout(() => {
        expect(() => verifyToken(token)).toThrow();
      }, 100);
    });

    it('should reject token with missing userId', () => {
      const token = jwt.sign(
        { sessionId, type: 'access' },
        JWT_SECRET,
        { issuer: 'crypticstorage' }
      );

      expect(() => verifyToken(token)).toThrow();
    });

    it('should reject token with missing sessionId', () => {
      const token = jwt.sign(
        { userId, type: 'access' },
        JWT_SECRET,
        { issuer: 'crypticstorage' }
      );

      expect(() => verifyToken(token)).toThrow();
    });

    it('should reject token with wrong issuer', () => {
      const token = jwt.sign(
        { userId, sessionId, type: 'access' },
        JWT_SECRET,
        { issuer: 'wrong-issuer' }
      );

      expect(() => verifyToken(token)).toThrow();
    });
  });

  describe('TOTP Token Generation and Verification', () => {
    it('should generate valid TOTP secret', () => {
      const secret = speakeasy.generateSecret({
        name: 'CrypticStorage (test@example.com)',
        issuer: 'CrypticStorage',
        length: 32,
      });

      expect(secret).toBeDefined();
      expect(secret.base32).toBeDefined();
      expect(secret.otpauth_url).toBeDefined();
    });

    it('should verify valid TOTP token', () => {
      const secret = speakeasy.generateSecret({ length: 32 });
      const token = speakeasy.totp({
        secret: secret.base32,
        encoding: 'base32',
      });

      const isValid = speakeasy.totp.verify({
        secret: secret.base32,
        encoding: 'base32',
        token,
        window: 2,
      });

      expect(isValid).toBe(true);
    });

    it('should reject invalid TOTP token', () => {
      const secret = speakeasy.generateSecret({ length: 32 });
      const invalidToken = '000000';

      const isValid = speakeasy.totp.verify({
        secret: secret.base32,
        encoding: 'base32',
        token: invalidToken,
        window: 0,
      });

      expect(isValid).toBe(false);
    });

    it('should generate 6-digit TOTP token', () => {
      const secret = speakeasy.generateSecret({ length: 32 });
      const token = speakeasy.totp({
        secret: secret.base32,
        encoding: 'base32',
      });

      expect(token).toMatch(/^\d{6}$/);
    });

    it('should accept tokens within time window', () => {
      const secret = speakeasy.generateSecret({ length: 32 });
      const token = speakeasy.totp({
        secret: secret.base32,
        encoding: 'base32',
        step: 30,
      });

      // Should accept with window = 2 (±60 seconds)
      const isValid = speakeasy.totp.verify({
        secret: secret.base32,
        encoding: 'base32',
        token,
        window: 2,
        step: 30,
      });

      expect(isValid).toBe(true);
    });
  });

  describe('Bcrypt Direct Usage', () => {
    it('should hash and compare synchronously', () => {
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(testPassword, salt);
      const isValid = bcrypt.compareSync(testPassword, hash);

      expect(isValid).toBe(true);
    });

    it('should hash and compare asynchronously', async () => {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(testPassword, salt);
      const isValid = await bcrypt.compare(testPassword, hash);

      expect(isValid).toBe(true);
    });

    it('should use different salt rounds', async () => {
      const hash10 = await bcrypt.hash(testPassword, 10);
      const hash12 = await bcrypt.hash(testPassword, 12);

      // Both should verify successfully
      expect(await bcrypt.compare(testPassword, hash10)).toBe(true);
      expect(await bcrypt.compare(testPassword, hash12)).toBe(true);
    });
  });
});
