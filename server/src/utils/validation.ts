import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from './errors';

/**
 * Common validation schemas for the CrypticStorage application
 */

// ==================== Base Schemas ====================

/**
 * Email validation schema
 */
export const emailSchema = z
  .string()
  .email('Invalid email address')
  .min(5, 'Email must be at least 5 characters')
  .max(255, 'Email must not exceed 255 characters')
  .toLowerCase()
  .trim();

/**
 * Password validation schema
 * Requires: min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
  );

/**
 * Username validation schema
 */
export const usernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must not exceed 30 characters')
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    'Username can only contain letters, numbers, underscores, and hyphens'
  )
  .trim();

/**
 * UUID validation schema
 */
export const uuidSchema = z.string().uuid('Invalid UUID format');

/**
 * Pagination schema
 */
export const paginationSchema = z.object({
  page: z.coerce
    .number()
    .int()
    .min(1, 'Page must be at least 1')
    .default(1)
    .optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit must not exceed 100')
    .default(20)
    .optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc').optional(),
});

/**
 * Date range validation schema
 */
export const dateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return data.startDate <= data.endDate;
    }
    return true;
  },
  {
    message: 'Start date must be before or equal to end date',
    path: ['startDate'],
  }
);

// ==================== User Schemas ====================

/**
 * User registration schema
 */
export const userRegistrationSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  username: usernameSchema.optional(),
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(50, 'First name must not exceed 50 characters')
    .trim()
    .optional(),
  lastName: z
    .string()
    .min(1, 'Last name is required')
    .max(50, 'Last name must not exceed 50 characters')
    .trim()
    .optional(),
});

/**
 * User login schema
 */
export const userLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  totpToken: z.string().length(6, 'TOTP token must be 6 digits').optional(),
});

/**
 * User update schema
 */
export const userUpdateSchema = z.object({
  username: usernameSchema.optional(),
  firstName: z
    .string()
    .min(1, 'First name cannot be empty')
    .max(50, 'First name must not exceed 50 characters')
    .trim()
    .optional(),
  lastName: z
    .string()
    .min(1, 'Last name cannot be empty')
    .max(50, 'Last name must not exceed 50 characters')
    .trim()
    .optional(),
  currentPassword: z.string().min(1, 'Current password is required').optional(),
  newPassword: passwordSchema.optional(),
}).refine(
  (data) => {
    // If newPassword is provided, currentPassword must also be provided
    if (data.newPassword && !data.currentPassword) {
      return false;
    }
    return true;
  },
  {
    message: 'Current password is required when changing password',
    path: ['currentPassword'],
  }
);

/**
 * Password reset request schema
 */
export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});

/**
 * Password reset confirm schema
 */
export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: passwordSchema,
});

// ==================== File Schemas ====================

/**
 * File upload metadata schema
 */
export const fileUploadSchema = z.object({
  name: z
    .string()
    .min(1, 'File name is required')
    .max(255, 'File name must not exceed 255 characters'),
  size: z.number().int().positive('File size must be positive'),
  mimeType: z.string().min(1, 'MIME type is required'),
  encryptedSize: z.number().int().positive('Encrypted size must be positive').optional(),
  checksum: z.string().optional(),
  folderId: uuidSchema.optional(),
});

/**
 * File update schema
 */
export const fileUpdateSchema = z.object({
  name: z
    .string()
    .min(1, 'File name cannot be empty')
    .max(255, 'File name must not exceed 255 characters')
    .optional(),
  folderId: uuidSchema.nullable().optional(),
  isFavorite: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * File query schema
 */
export const fileQuerySchema = paginationSchema.extend({
  folderId: uuidSchema.optional(),
  search: z.string().max(100, 'Search query must not exceed 100 characters').optional(),
  mimeType: z.string().optional(),
  isFavorite: z.coerce.boolean().optional(),
  tags: z.string().transform((val) => val.split(',')).optional(),
});

// ==================== Folder Schemas ====================

/**
 * Folder create schema
 */
export const folderCreateSchema = z.object({
  name: z
    .string()
    .min(1, 'Folder name is required')
    .max(255, 'Folder name must not exceed 255 characters')
    .regex(
      /^[^/\\:*?"<>|]+$/,
      'Folder name cannot contain: / \\ : * ? " < > |'
    ),
  parentId: uuidSchema.nullable().optional(),
});

/**
 * Folder update schema
 */
export const folderUpdateSchema = z.object({
  name: z
    .string()
    .min(1, 'Folder name cannot be empty')
    .max(255, 'Folder name must not exceed 255 characters')
    .regex(
      /^[^/\\:*?"<>|]+$/,
      'Folder name cannot contain: / \\ : * ? " < > |'
    )
    .optional(),
  parentId: uuidSchema.nullable().optional(),
});

// ==================== Share Schemas ====================

/**
 * Share create schema
 */
export const shareCreateSchema = z.object({
  fileId: uuidSchema,
  expiresAt: z.coerce.date().refine(
    (date) => date > new Date(),
    {
      message: 'Expiration date must be in the future',
    }
  ).optional(),
  password: z.string().min(4, 'Share password must be at least 4 characters').optional(),
  maxDownloads: z.number().int().positive('Max downloads must be positive').optional(),
  allowedEmails: z.array(emailSchema).optional(),
});

/**
 * Share access schema
 */
export const shareAccessSchema = z.object({
  password: z.string().optional(),
});

// ==================== 2FA Schemas ====================

/**
 * 2FA enable schema
 */
export const twoFactorEnableSchema = z.object({
  token: z.string().length(6, 'TOTP token must be 6 digits'),
});

/**
 * 2FA verify schema
 */
export const twoFactorVerifySchema = z.object({
  token: z.string().length(6, 'TOTP token must be 6 digits'),
});

/**
 * 2FA disable schema
 */
export const twoFactorDisableSchema = z.object({
  token: z.string().length(6, 'TOTP token must be 6 digits'),
  password: z.string().min(1, 'Password is required'),
});

// ==================== Validation Middleware ====================

/**
 * Validation location type
 */
type ValidationLocation = 'body' | 'query' | 'params';

/**
 * Creates a validation middleware for Express
 */
export const validate = (
  schema: z.ZodSchema,
  location: ValidationLocation = 'body'
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req[location];
      const validated = await schema.parseAsync(data);

      // Replace the original data with validated data
      req[location] = validated;

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        next(
          new ValidationError('Validation failed', {
            errors: formattedErrors,
          })
        );
      } else {
        next(error);
      }
    }
  };
};

/**
 * Validates multiple locations (body, query, params)
 */
export const validateMultiple = (schemas: {
  body?: z.ZodSchema;
  query?: z.ZodSchema;
  params?: z.ZodSchema;
}) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors: Array<{ field: string; message: string }> = [];

      // Validate each location
      for (const [location, schema] of Object.entries(schemas)) {
        if (schema) {
          try {
            const data = req[location as ValidationLocation];
            const validated = await schema.parseAsync(data);
            req[location as ValidationLocation] = validated;
          } catch (error) {
            if (error instanceof z.ZodError) {
              const formattedErrors = error.errors.map((err) => ({
                field: `${location}.${err.path.join('.')}`,
                message: err.message,
              }));
              errors.push(...formattedErrors);
            }
          }
        }
      }

      if (errors.length > 0) {
        next(
          new ValidationError('Validation failed', {
            errors,
          })
        );
      } else {
        next();
      }
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Helper function to validate data without middleware
 */
export const validateData = async <T>(
  schema: z.ZodSchema<T>,
  data: unknown
): Promise<T> => {
  try {
    return await schema.parseAsync(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));

      throw new ValidationError('Validation failed', {
        errors: formattedErrors,
      });
    }
    throw error;
  }
};

/**
 * Helper to check if a value is a valid UUID
 */
export const isValidUuid = (value: string): boolean => {
  return uuidSchema.safeParse(value).success;
};

/**
 * Helper to check if a value is a valid email
 */
export const isValidEmail = (value: string): boolean => {
  return emailSchema.safeParse(value).success;
};

/**
 * Helper to sanitize file name
 */
export const sanitizeFileName = (fileName: string): string => {
  return fileName
    .replace(/[/\\:*?"<>|]/g, '_') // Replace invalid chars with underscore
    .replace(/\s+/g, '_') // Replace spaces with underscore
    .replace(/_{2,}/g, '_') // Replace multiple underscores with single
    .trim();
};

/**
 * Helper to validate file size
 */
export const validateFileSize = (size: number, maxSize?: number): boolean => {
  const max = maxSize || parseInt(process.env.MAX_FILE_SIZE || '5368709120'); // 5GB default
  return size > 0 && size <= max;
};

/**
 * Helper to validate MIME type
 */
export const validateMimeType = (mimeType: string, allowedTypes?: string[]): boolean => {
  if (!allowedTypes || allowedTypes.length === 0) {
    return true; // Allow all if no restrictions
  }

  return allowedTypes.some((allowed) => {
    if (allowed.endsWith('/*')) {
      // Handle wildcard types like 'image/*'
      const prefix = allowed.slice(0, -2);
      return mimeType.startsWith(prefix);
    }
    return mimeType === allowed;
  });
};
