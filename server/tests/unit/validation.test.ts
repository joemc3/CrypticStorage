/**
 * Unit Tests for Validation Schemas and Functions
 * Tests Zod schemas and validation helper functions
 */

import {
  emailSchema,
  passwordSchema,
  usernameSchema,
  uuidSchema,
  paginationSchema,
  dateRangeSchema,
  userRegistrationSchema,
  userLoginSchema,
  userUpdateSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  fileUploadSchema,
  fileUpdateSchema,
  fileQuerySchema,
  folderCreateSchema,
  folderUpdateSchema,
  shareCreateSchema,
  shareAccessSchema,
  twoFactorEnableSchema,
  twoFactorVerifySchema,
  twoFactorDisableSchema,
  validateData,
  isValidUuid,
  isValidEmail,
  sanitizeFileName,
  validateFileSize,
  validateMimeType,
} from '../../src/utils/validation';

describe('Validation Schemas', () => {
  describe('Email Schema', () => {
    it('should validate correct email', () => {
      const result = emailSchema.safeParse('test@example.com');
      expect(result.success).toBe(true);
    });

    it('should reject invalid email format', () => {
      const result = emailSchema.safeParse('invalid-email');
      expect(result.success).toBe(false);
    });

    it('should reject email without domain', () => {
      const result = emailSchema.safeParse('test@');
      expect(result.success).toBe(false);
    });

    it('should reject email without @', () => {
      const result = emailSchema.safeParse('testexample.com');
      expect(result.success).toBe(false);
    });

    it('should convert email to lowercase', () => {
      const result = emailSchema.parse('Test@EXAMPLE.COM');
      expect(result).toBe('test@example.com');
    });

    it('should trim whitespace', () => {
      const result = emailSchema.parse('  test@example.com  ');
      expect(result).toBe('test@example.com');
    });

    it('should reject too short email', () => {
      const result = emailSchema.safeParse('a@b');
      expect(result.success).toBe(false);
    });

    it('should reject too long email', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      const result = emailSchema.safeParse(longEmail);
      expect(result.success).toBe(false);
    });
  });

  describe('Password Schema', () => {
    it('should validate strong password', () => {
      const result = passwordSchema.safeParse('Test123!@#');
      expect(result.success).toBe(true);
    });

    it('should reject password without uppercase', () => {
      const result = passwordSchema.safeParse('test123!@#');
      expect(result.success).toBe(false);
    });

    it('should reject password without lowercase', () => {
      const result = passwordSchema.safeParse('TEST123!@#');
      expect(result.success).toBe(false);
    });

    it('should reject password without number', () => {
      const result = passwordSchema.safeParse('TestTest!@#');
      expect(result.success).toBe(false);
    });

    it('should reject password without special character', () => {
      const result = passwordSchema.safeParse('Test1234567');
      expect(result.success).toBe(false);
    });

    it('should reject too short password', () => {
      const result = passwordSchema.safeParse('Test1!');
      expect(result.success).toBe(false);
    });

    it('should reject too long password', () => {
      const longPassword = 'A'.repeat(130) + '1!';
      const result = passwordSchema.safeParse(longPassword);
      expect(result.success).toBe(false);
    });

    it('should accept various special characters', () => {
      const passwords = [
        'Test123!', 'Test123@', 'Test123#', 'Test123$',
        'Test123%', 'Test123*', 'Test123?', 'Test123&'
      ];

      passwords.forEach(password => {
        const result = passwordSchema.safeParse(password);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Username Schema', () => {
    it('should validate correct username', () => {
      const result = usernameSchema.safeParse('testuser123');
      expect(result.success).toBe(true);
    });

    it('should accept username with hyphens', () => {
      const result = usernameSchema.safeParse('test-user');
      expect(result.success).toBe(true);
    });

    it('should accept username with underscores', () => {
      const result = usernameSchema.safeParse('test_user');
      expect(result.success).toBe(true);
    });

    it('should reject username with spaces', () => {
      const result = usernameSchema.safeParse('test user');
      expect(result.success).toBe(false);
    });

    it('should reject username with special characters', () => {
      const result = usernameSchema.safeParse('test@user');
      expect(result.success).toBe(false);
    });

    it('should reject too short username', () => {
      const result = usernameSchema.safeParse('ab');
      expect(result.success).toBe(false);
    });

    it('should reject too long username', () => {
      const result = usernameSchema.safeParse('a'.repeat(31));
      expect(result.success).toBe(false);
    });

    it('should trim whitespace', () => {
      const result = usernameSchema.parse('  testuser  ');
      expect(result).toBe('testuser');
    });
  });

  describe('UUID Schema', () => {
    it('should validate correct UUID v4', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const result = uuidSchema.safeParse(uuid);
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID format', () => {
      const result = uuidSchema.safeParse('not-a-uuid');
      expect(result.success).toBe(false);
    });

    it('should reject UUID without hyphens', () => {
      const result = uuidSchema.safeParse('123e4567e89b12d3a456426614174000');
      expect(result.success).toBe(false);
    });
  });

  describe('Pagination Schema', () => {
    it('should validate pagination with defaults', () => {
      const result = paginationSchema.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.sortOrder).toBe('desc');
    });

    it('should validate custom pagination', () => {
      const result = paginationSchema.parse({
        page: 2,
        limit: 50,
        sortBy: 'createdAt',
        sortOrder: 'asc',
      });
      expect(result.page).toBe(2);
      expect(result.limit).toBe(50);
      expect(result.sortBy).toBe('createdAt');
      expect(result.sortOrder).toBe('asc');
    });

    it('should reject page less than 1', () => {
      const result = paginationSchema.safeParse({ page: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject limit greater than 100', () => {
      const result = paginationSchema.safeParse({ limit: 101 });
      expect(result.success).toBe(false);
    });

    it('should coerce string to number', () => {
      const result = paginationSchema.parse({ page: '2', limit: '30' });
      expect(result.page).toBe(2);
      expect(result.limit).toBe(30);
    });
  });

  describe('Date Range Schema', () => {
    it('should validate valid date range', () => {
      const result = dateRangeSchema.parse({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });
      expect(result.startDate).toBeInstanceOf(Date);
      expect(result.endDate).toBeInstanceOf(Date);
    });

    it('should reject invalid date range (end before start)', () => {
      const result = dateRangeSchema.safeParse({
        startDate: new Date('2024-12-31'),
        endDate: new Date('2024-01-01'),
      });
      expect(result.success).toBe(false);
    });

    it('should allow equal start and end dates', () => {
      const date = new Date('2024-01-01');
      const result = dateRangeSchema.parse({
        startDate: date,
        endDate: date,
      });
      expect(result.startDate).toEqual(date);
    });

    it('should allow optional dates', () => {
      const result = dateRangeSchema.parse({});
      expect(result.startDate).toBeUndefined();
      expect(result.endDate).toBeUndefined();
    });
  });

  describe('User Registration Schema', () => {
    it('should validate complete registration data', () => {
      const result = userRegistrationSchema.parse({
        email: 'test@example.com',
        password: 'Test123!@#',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
      });
      expect(result.email).toBe('test@example.com');
      expect(result.username).toBe('testuser');
    });

    it('should validate minimal registration data', () => {
      const result = userRegistrationSchema.parse({
        email: 'test@example.com',
        password: 'Test123!@#',
      });
      expect(result.email).toBe('test@example.com');
    });

    it('should reject invalid email', () => {
      const result = userRegistrationSchema.safeParse({
        email: 'invalid',
        password: 'Test123!@#',
      });
      expect(result.success).toBe(false);
    });

    it('should reject weak password', () => {
      const result = userRegistrationSchema.safeParse({
        email: 'test@example.com',
        password: 'weak',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('User Login Schema', () => {
    it('should validate login credentials', () => {
      const result = userLoginSchema.parse({
        email: 'test@example.com',
        password: 'password123',
      });
      expect(result.email).toBe('test@example.com');
    });

    it('should validate login with TOTP', () => {
      const result = userLoginSchema.parse({
        email: 'test@example.com',
        password: 'password123',
        totpToken: '123456',
      });
      expect(result.totpToken).toBe('123456');
    });

    it('should reject invalid TOTP length', () => {
      const result = userLoginSchema.safeParse({
        email: 'test@example.com',
        password: 'password123',
        totpToken: '12345', // Too short
      });
      expect(result.success).toBe(false);
    });
  });

  describe('File Upload Schema', () => {
    it('should validate file upload data', () => {
      const result = fileUploadSchema.parse({
        name: 'test.pdf',
        size: 1024,
        mimeType: 'application/pdf',
      });
      expect(result.name).toBe('test.pdf');
    });

    it('should reject negative file size', () => {
      const result = fileUploadSchema.safeParse({
        name: 'test.pdf',
        size: -100,
        mimeType: 'application/pdf',
      });
      expect(result.success).toBe(false);
    });

    it('should reject zero file size', () => {
      const result = fileUploadSchema.safeParse({
        name: 'test.pdf',
        size: 0,
        mimeType: 'application/pdf',
      });
      expect(result.success).toBe(false);
    });

    it('should reject too long filename', () => {
      const result = fileUploadSchema.safeParse({
        name: 'a'.repeat(300) + '.pdf',
        size: 1024,
        mimeType: 'application/pdf',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Share Create Schema', () => {
    it('should validate share creation without password', () => {
      const fileId = '123e4567-e89b-12d3-a456-426614174000';
      const result = shareCreateSchema.parse({ fileId });
      expect(result.fileId).toBe(fileId);
    });

    it('should validate share with password', () => {
      const fileId = '123e4567-e89b-12d3-a456-426614174000';
      const result = shareCreateSchema.parse({
        fileId,
        password: 'sharepass',
      });
      expect(result.password).toBe('sharepass');
    });

    it('should validate share with expiration', () => {
      const fileId = '123e4567-e89b-12d3-a456-426614174000';
      const futureDate = new Date(Date.now() + 86400000); // Tomorrow
      const result = shareCreateSchema.parse({
        fileId,
        expiresAt: futureDate,
      });
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('should reject past expiration date', () => {
      const fileId = '123e4567-e89b-12d3-a456-426614174000';
      const pastDate = new Date(Date.now() - 86400000); // Yesterday
      const result = shareCreateSchema.safeParse({
        fileId,
        expiresAt: pastDate,
      });
      expect(result.success).toBe(false);
    });

    it('should reject password too short', () => {
      const fileId = '123e4567-e89b-12d3-a456-426614174000';
      const result = shareCreateSchema.safeParse({
        fileId,
        password: 'abc', // Too short (< 4 chars)
      });
      expect(result.success).toBe(false);
    });
  });

  describe('2FA Schemas', () => {
    it('should validate 2FA enable with 6-digit token', () => {
      const result = twoFactorEnableSchema.parse({ token: '123456' });
      expect(result.token).toBe('123456');
    });

    it('should reject non-6-digit token', () => {
      const result = twoFactorEnableSchema.safeParse({ token: '12345' });
      expect(result.success).toBe(false);
    });

    it('should validate 2FA disable with password and token', () => {
      const result = twoFactorDisableSchema.parse({
        token: '123456',
        password: 'mypassword',
      });
      expect(result.token).toBe('123456');
      expect(result.password).toBe('mypassword');
    });
  });
});

describe('Validation Helper Functions', () => {
  describe('validateData', () => {
    it('should validate data successfully', async () => {
      const data = await validateData(emailSchema, 'test@example.com');
      expect(data).toBe('test@example.com');
    });

    it('should throw ValidationError on invalid data', async () => {
      await expect(validateData(emailSchema, 'invalid')).rejects.toThrow();
    });
  });

  describe('isValidUuid', () => {
    it('should return true for valid UUID', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      expect(isValidUuid(uuid)).toBe(true);
    });

    it('should return false for invalid UUID', () => {
      expect(isValidUuid('not-a-uuid')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidUuid('')).toBe(false);
    });
  });

  describe('isValidEmail', () => {
    it('should return true for valid email', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
    });

    it('should return false for invalid email', () => {
      expect(isValidEmail('invalid')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidEmail('')).toBe(false);
    });
  });

  describe('sanitizeFileName', () => {
    it('should remove invalid characters', () => {
      const filename = 'test:file*.pdf';
      const sanitized = sanitizeFileName(filename);
      expect(sanitized).toBe('test_file_.pdf');
    });

    it('should replace spaces with underscores', () => {
      const filename = 'my document.pdf';
      const sanitized = sanitizeFileName(filename);
      expect(sanitized).toBe('my_document.pdf');
    });

    it('should replace multiple underscores with single', () => {
      const filename = 'test___file.pdf';
      const sanitized = sanitizeFileName(filename);
      expect(sanitized).toBe('test_file.pdf');
    });

    it('should trim whitespace', () => {
      const filename = '  test.pdf  ';
      const sanitized = sanitizeFileName(filename);
      expect(sanitized).not.toMatch(/^\s|\s$/);
    });

    it('should handle all invalid characters', () => {
      const filename = 'test/\\:*?"<>|file.pdf';
      const sanitized = sanitizeFileName(filename);
      expect(sanitized).not.toMatch(/[/\\:*?"<>|]/);
    });
  });

  describe('validateFileSize', () => {
    it('should validate file within default limit', () => {
      const result = validateFileSize(1024 * 1024); // 1MB
      expect(result).toBe(true);
    });

    it('should reject file exceeding custom limit', () => {
      const maxSize = 1024 * 1024; // 1MB
      const result = validateFileSize(2 * 1024 * 1024, maxSize); // 2MB
      expect(result).toBe(false);
    });

    it('should reject zero size file', () => {
      const result = validateFileSize(0);
      expect(result).toBe(false);
    });

    it('should reject negative size', () => {
      const result = validateFileSize(-100);
      expect(result).toBe(false);
    });

    it('should accept file at exact limit', () => {
      const maxSize = 1024 * 1024; // 1MB
      const result = validateFileSize(maxSize, maxSize);
      expect(result).toBe(true);
    });
  });

  describe('validateMimeType', () => {
    it('should allow all types when no restrictions', () => {
      const result = validateMimeType('application/pdf');
      expect(result).toBe(true);
    });

    it('should allow exact MIME type match', () => {
      const allowed = ['application/pdf', 'image/png'];
      const result = validateMimeType('application/pdf', allowed);
      expect(result).toBe(true);
    });

    it('should reject non-allowed MIME type', () => {
      const allowed = ['application/pdf'];
      const result = validateMimeType('image/png', allowed);
      expect(result).toBe(false);
    });

    it('should support wildcard types', () => {
      const allowed = ['image/*'];
      expect(validateMimeType('image/png', allowed)).toBe(true);
      expect(validateMimeType('image/jpeg', allowed)).toBe(true);
      expect(validateMimeType('application/pdf', allowed)).toBe(false);
    });

    it('should handle multiple wildcards', () => {
      const allowed = ['image/*', 'video/*'];
      expect(validateMimeType('image/png', allowed)).toBe(true);
      expect(validateMimeType('video/mp4', allowed)).toBe(true);
      expect(validateMimeType('application/pdf', allowed)).toBe(false);
    });

    it('should handle mix of exact and wildcard types', () => {
      const allowed = ['application/pdf', 'image/*'];
      expect(validateMimeType('application/pdf', allowed)).toBe(true);
      expect(validateMimeType('image/png', allowed)).toBe(true);
      expect(validateMimeType('video/mp4', allowed)).toBe(false);
    });
  });
});
