import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

/**
 * Custom Application Error
 */
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public code?: string;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: string,
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Common application errors
 */
export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request') {
    super(message, 400, 'BAD_REQUEST');
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource already exists') {
    super(message, 409, 'CONFLICT');
  }
}

export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed') {
    super(message, 422, 'VALIDATION_ERROR');
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error') {
    super(message, 500, 'INTERNAL_SERVER_ERROR', false);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message: string = 'Payload too large') {
    super(message, 413, 'PAYLOAD_TOO_LARGE');
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, 'TOO_MANY_REQUESTS');
  }
}

/**
 * Error response interface
 */
interface ErrorResponse {
  success: false;
  error: string;
  message: string;
  code?: string;
  details?: any;
  stack?: string;
}

/**
 * Log error to console or logging service
 */
const logError = (error: Error, req: Request): void => {
  const errorInfo = {
    message: error.message,
    stack: error.stack,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userId: (req as any).user?.userId,
    timestamp: new Date().toISOString(),
  };

  // In production, you'd send this to a logging service (e.g., Winston, Sentry)
  console.error('Error occurred:', JSON.stringify(errorInfo, null, 2));
};

/**
 * Handle Prisma errors
 */
const handlePrismaError = (error: any): AppError => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        // Unique constraint violation
        const field = error.meta?.target as string[] | undefined;
        const fieldName = field?.[0] || 'field';
        return new ConflictError(`${fieldName} already exists`);

      case 'P2025':
        // Record not found
        return new NotFoundError('Record');

      case 'P2003':
        // Foreign key constraint violation
        return new BadRequestError('Related record not found');

      case 'P2014':
        // Invalid ID
        return new BadRequestError('Invalid ID provided');

      case 'P2021':
        // Table does not exist
        return new InternalServerError('Database configuration error');

      case 'P2022':
        // Column does not exist
        return new InternalServerError('Database schema error');

      default:
        return new InternalServerError('Database operation failed');
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return new BadRequestError('Invalid data provided');
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return new ServiceUnavailableError('Database connection failed');
  }

  return new InternalServerError('Database error');
};

/**
 * Handle Zod validation errors
 */
const handleZodError = (error: ZodError): AppError => {
  const errors = error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
  }));

  const appError = new ValidationError('Validation failed');
  (appError as any).details = errors;
  return appError;
};

/**
 * Handle Multer errors
 */
const handleMulterError = (error: any): AppError => {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return new PayloadTooLargeError('File size exceeds the maximum allowed limit');
  }

  if (error.code === 'LIMIT_FILE_COUNT') {
    return new BadRequestError('Too many files uploaded');
  }

  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return new BadRequestError('Unexpected file field');
  }

  if (error.code === 'LIMIT_FIELD_KEY') {
    return new BadRequestError('Field name too long');
  }

  if (error.code === 'LIMIT_FIELD_VALUE') {
    return new BadRequestError('Field value too long');
  }

  if (error.code === 'LIMIT_FIELD_COUNT') {
    return new BadRequestError('Too many fields');
  }

  if (error.code === 'LIMIT_PART_COUNT') {
    return new BadRequestError('Too many parts');
  }

  return new BadRequestError('File upload error');
};

/**
 * Convert any error to AppError
 */
const normalizeError = (error: any): AppError => {
  // Already an AppError
  if (error instanceof AppError) {
    return error;
  }

  // Prisma errors
  if (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientValidationError ||
    error instanceof Prisma.PrismaClientInitializationError
  ) {
    return handlePrismaError(error);
  }

  // Zod validation errors
  if (error instanceof ZodError) {
    return handleZodError(error);
  }

  // Multer errors
  if (error.name === 'MulterError') {
    return handleMulterError(error);
  }

  // JWT errors (handled in auth middleware, but just in case)
  if (error.name === 'JsonWebTokenError') {
    return new UnauthorizedError('Invalid token');
  }

  if (error.name === 'TokenExpiredError') {
    return new UnauthorizedError('Token expired');
  }

  // Syntax errors in JSON
  if (error instanceof SyntaxError && error.message.includes('JSON')) {
    return new BadRequestError('Invalid JSON in request body');
  }

  // Default to internal server error
  return new InternalServerError(
    process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : error.message
  );
};

/**
 * Global error handling middleware
 * Must be registered after all routes
 */
export const errorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Normalize error to AppError
  const appError = normalizeError(error);

  // Log error (except for operational errors like 404, 400, etc.)
  if (!appError.isOperational || appError.statusCode >= 500) {
    logError(error, req);
  }

  // Build error response
  const errorResponse: ErrorResponse = {
    success: false,
    error: appError.message,
    message: appError.message,
    code: appError.code,
  };

  // Add details if available (e.g., validation errors)
  if ((appError as any).details) {
    errorResponse.details = (appError as any).details;
  }

  // Add stack trace in development
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.stack = appError.stack;
  }

  // Send error response
  res.status(appError.statusCode).json(errorResponse);
};

/**
 * 404 Not Found handler
 * Should be registered after all routes but before error handler
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const error = new NotFoundError(`Route ${req.method} ${req.path} not found`);
  next(error);
};

/**
 * Async handler wrapper
 * Wraps async route handlers to catch errors and pass to error middleware
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Handle unhandled promise rejections
 */
export const handleUnhandledRejection = (): void => {
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // In production, you might want to exit the process
    // process.exit(1);
  });
};

/**
 * Handle uncaught exceptions
 */
export const handleUncaughtException = (): void => {
  process.on('uncaughtException', (error: Error) => {
    console.error('Uncaught Exception:', error);
    // Exit the process as the application is in an undefined state
    process.exit(1);
  });
};

/**
 * Graceful shutdown handler
 */
export const gracefulShutdown = (server: any): void => {
  const shutdown = (signal: string) => {
    console.log(`\n${signal} signal received: closing HTTP server`);
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};
