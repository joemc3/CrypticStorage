import { Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodSchema } from 'zod';

/**
 * Validation target type
 */
type ValidationTarget = 'body' | 'query' | 'params';

/**
 * Validation options
 */
interface ValidationOptions {
  /**
   * Where to validate (body, query, params)
   */
  target?: ValidationTarget;

  /**
   * Whether to strip unknown fields (default: true)
   */
  stripUnknown?: boolean;

  /**
   * Whether to abort early on first error (default: false)
   */
  abortEarly?: boolean;
}

/**
 * Format Zod validation errors into user-friendly messages
 */
const formatZodError = (error: ZodError): { field: string; message: string }[] => {
  return error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
  }));
};

/**
 * Generic validation middleware factory
 * Validates request data against a Zod schema
 */
export const validate = (
  schema: ZodSchema,
  options: ValidationOptions = {}
) => {
  const {
    target = 'body',
    stripUnknown = true,
    abortEarly = false,
  } = options;

  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Get the data to validate based on target
      const dataToValidate = req[target];

      // Parse options
      const parseOptions = {
        errorMap: (issue: any, ctx: any) => {
          // Custom error messages for common issues
          switch (issue.code) {
            case 'invalid_type':
              return {
                message: `Expected ${issue.expected}, received ${issue.received}`,
              };
            case 'too_small':
              if (issue.type === 'string') {
                return {
                  message: `Must be at least ${issue.minimum} characters`,
                };
              }
              if (issue.type === 'array') {
                return {
                  message: `Must contain at least ${issue.minimum} items`,
                };
              }
              return { message: ctx.defaultError };
            case 'too_big':
              if (issue.type === 'string') {
                return {
                  message: `Must be at most ${issue.maximum} characters`,
                };
              }
              if (issue.type === 'array') {
                return {
                  message: `Must contain at most ${issue.maximum} items`,
                };
              }
              return { message: ctx.defaultError };
            case 'invalid_string':
              if (issue.validation === 'email') {
                return { message: 'Invalid email address' };
              }
              if (issue.validation === 'url') {
                return { message: 'Invalid URL' };
              }
              if (issue.validation === 'uuid') {
                return { message: 'Invalid UUID' };
              }
              return { message: ctx.defaultError };
            default:
              return { message: ctx.defaultError };
          }
        },
      };

      // Validate data
      const validated = stripUnknown
        ? await schema.parseAsync(dataToValidate, parseOptions)
        : await schema.strict().parseAsync(dataToValidate, parseOptions);

      // Replace request data with validated data
      req[target] = validated;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = formatZodError(error);

        res.status(400).json({
          success: false,
          error: 'Validation failed',
          message: 'The provided data is invalid',
          details: formattedErrors,
        });
        return;
      }

      // Unexpected error
      console.error('Validation middleware error:', error);
      res.status(500).json({
        success: false,
        error: 'Validation error',
        message: 'An error occurred during validation',
      });
    }
  };
};

/**
 * Validate request body
 */
export const validateBody = (schema: ZodSchema) => {
  return validate(schema, { target: 'body' });
};

/**
 * Validate query parameters
 */
export const validateQuery = (schema: ZodSchema) => {
  return validate(schema, { target: 'query' });
};

/**
 * Validate URL parameters
 */
export const validateParams = (schema: ZodSchema) => {
  return validate(schema, { target: 'params' });
};

/**
 * Common validation schemas
 */
export const commonSchemas = {
  /**
   * UUID parameter validation
   */
  uuidParam: z.object({
    id: z.string().uuid('Invalid UUID format'),
  }),

  /**
   * Pagination query validation
   */
  pagination: z.object({
    page: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 1))
      .pipe(z.number().min(1, 'Page must be at least 1')),
    limit: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 10))
      .pipe(
        z
          .number()
          .min(1, 'Limit must be at least 1')
          .max(100, 'Limit must not exceed 100')
      ),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  }),

  /**
   * Search query validation
   */
  search: z.object({
    q: z
      .string()
      .min(1, 'Search query is required')
      .max(100, 'Search query too long'),
    page: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 1)),
    limit: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 10)),
  }),

  /**
   * Email validation
   */
  email: z
    .string()
    .email('Invalid email address')
    .toLowerCase()
    .trim(),

  /**
   * Password validation (strong password requirements)
   */
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),

  /**
   * File ID validation
   */
  fileId: z.string().uuid('Invalid file ID'),

  /**
   * Folder ID validation (can be null for root)
   */
  folderId: z.string().uuid('Invalid folder ID').nullable().optional(),

  /**
   * File name validation
   */
  fileName: z
    .string()
    .min(1, 'File name is required')
    .max(255, 'File name too long')
    .regex(
      /^[^<>:"/\\|?*\x00-\x1F]+$/,
      'File name contains invalid characters'
    ),

  /**
   * Folder name validation
   */
  folderName: z
    .string()
    .min(1, 'Folder name is required')
    .max(255, 'Folder name too long')
    .regex(
      /^[^<>:"/\\|?*\x00-\x1F]+$/,
      'Folder name contains invalid characters'
    ),

  /**
   * File size validation (max 5GB)
   */
  fileSize: z
    .number()
    .min(1, 'File size must be greater than 0')
    .max(5 * 1024 * 1024 * 1024, 'File size exceeds 5GB limit'),

  /**
   * MIME type validation
   */
  mimeType: z.string().regex(/^[\w-]+\/[\w-+.]+$/, 'Invalid MIME type'),

  /**
   * Share settings validation
   */
  shareSettings: z.object({
    expiresAt: z
      .string()
      .datetime('Invalid date format')
      .optional()
      .nullable(),
    maxDownloads: z
      .number()
      .int('Max downloads must be an integer')
      .min(1, 'Max downloads must be at least 1')
      .max(1000, 'Max downloads cannot exceed 1000')
      .optional()
      .nullable(),
    password: z
      .string()
      .min(4, 'Share password must be at least 4 characters')
      .max(128, 'Share password too long')
      .optional()
      .nullable(),
  }),

  /**
   * Two-factor authentication code validation
   */
  totpCode: z
    .string()
    .length(6, 'TOTP code must be 6 digits')
    .regex(/^\d{6}$/, 'TOTP code must contain only digits'),

  /**
   * API key validation
   */
  apiKey: z
    .string()
    .min(32, 'Invalid API key')
    .max(64, 'Invalid API key')
    .regex(/^[A-Za-z0-9_-]+$/, 'Invalid API key format'),
};

/**
 * Sanitize string input (remove potentially dangerous characters)
 */
export const sanitizeString = (str: string): string => {
  return str
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/[\x00-\x1F\x7F]/g, ''); // Remove control characters
};

/**
 * Middleware to sanitize all string inputs in request
 */
export const sanitizeInputs = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      return sanitizeString(obj);
    }
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }
    if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) {
        sanitized[key] = sanitizeObject(obj[key]);
      }
      return sanitized;
    }
    return obj;
  };

  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }

  next();
};
