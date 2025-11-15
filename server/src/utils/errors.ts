/**
 * Custom error classes for the CrypticStorage application
 * Each error class includes an HTTP status code and optional metadata
 */

/**
 * Base application error class
 * All custom errors should extend this class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly metadata?: Record<string, any>;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    metadata?: Record<string, any>
  ) {
    super(message);

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.metadata = metadata;

    // Set the prototype explicitly to maintain instanceof checks
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /**
   * Convert error to JSON for API responses
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      ...(this.metadata && { metadata: this.metadata }),
      ...(process.env.NODE_ENV === 'development' && { stack: this.stack }),
    };
  }
}

/**
 * Validation Error - 400
 * Used when request data fails validation
 */
export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed', metadata?: Record<string, any>) {
    super(message, 400, true, metadata);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Authentication Error - 401
 * Used when authentication is required but not provided or invalid
 */
export class AuthError extends AppError {
  constructor(message: string = 'Authentication required', metadata?: Record<string, any>) {
    super(message, 401, true, metadata);
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}

/**
 * Authorization Error - 403
 * Used when user is authenticated but lacks permission for the action
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Access forbidden', metadata?: Record<string, any>) {
    super(message, 403, true, metadata);
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

/**
 * Not Found Error - 404
 * Used when a requested resource doesn't exist
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', metadata?: Record<string, any>) {
    super(message, 404, true, metadata);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Conflict Error - 409
 * Used when request conflicts with current state (e.g., duplicate resource)
 */
export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict', metadata?: Record<string, any>) {
    super(message, 409, true, metadata);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

/**
 * Rate Limit Error - 429
 * Used when user exceeds rate limits
 */
export class RateLimitError extends AppError {
  constructor(
    message: string = 'Too many requests',
    retryAfter?: number,
    metadata?: Record<string, any>
  ) {
    super(
      message,
      429,
      true,
      retryAfter ? { ...metadata, retryAfter } : metadata
    );
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Internal Server Error - 500
 * Used for unexpected server errors
 */
export class InternalServerError extends AppError {
  constructor(
    message: string = 'Internal server error',
    metadata?: Record<string, any>
  ) {
    super(message, 500, true, metadata);
    Object.setPrototypeOf(this, InternalServerError.prototype);
  }
}

/**
 * Database Error - 500
 * Used for database-related errors
 */
export class DatabaseError extends AppError {
  constructor(message: string = 'Database error', metadata?: Record<string, any>) {
    super(message, 500, true, metadata);
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

/**
 * External Service Error - 502
 * Used when an external service (like MinIO, Redis) fails
 */
export class ExternalServiceError extends AppError {
  constructor(
    message: string = 'External service error',
    service?: string,
    metadata?: Record<string, any>
  ) {
    super(
      message,
      502,
      true,
      service ? { ...metadata, service } : metadata
    );
    Object.setPrototypeOf(this, ExternalServiceError.prototype);
  }
}

/**
 * Service Unavailable Error - 503
 * Used when service is temporarily unavailable
 */
export class ServiceUnavailableError extends AppError {
  constructor(
    message: string = 'Service temporarily unavailable',
    retryAfter?: number,
    metadata?: Record<string, any>
  ) {
    super(
      message,
      503,
      true,
      retryAfter ? { ...metadata, retryAfter } : metadata
    );
    Object.setPrototypeOf(this, ServiceUnavailableError.prototype);
  }
}

/**
 * Bad Request Error - 400
 * Used for general bad request errors
 */
export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request', metadata?: Record<string, any>) {
    super(message, 400, true, metadata);
    Object.setPrototypeOf(this, BadRequestError.prototype);
  }
}

/**
 * File Upload Error - 400
 * Used for file upload specific errors
 */
export class FileUploadError extends AppError {
  constructor(message: string = 'File upload failed', metadata?: Record<string, any>) {
    super(message, 400, true, metadata);
    Object.setPrototypeOf(this, FileUploadError.prototype);
  }
}

/**
 * Storage Error - 500
 * Used for storage (MinIO/S3) related errors
 */
export class StorageError extends AppError {
  constructor(message: string = 'Storage error', metadata?: Record<string, any>) {
    super(message, 500, true, metadata);
    Object.setPrototypeOf(this, StorageError.prototype);
  }
}

/**
 * Token Error - 401
 * Used for JWT token related errors
 */
export class TokenError extends AppError {
  constructor(message: string = 'Invalid or expired token', metadata?: Record<string, any>) {
    super(message, 401, true, metadata);
    Object.setPrototypeOf(this, TokenError.prototype);
  }
}

/**
 * Encryption Error - 500
 * Used for encryption/decryption related errors
 */
export class EncryptionError extends AppError {
  constructor(message: string = 'Encryption error', metadata?: Record<string, any>) {
    super(message, 500, true, metadata);
    Object.setPrototypeOf(this, EncryptionError.prototype);
  }
}

/**
 * Payment Required Error - 402
 * Used when payment or subscription is required
 */
export class PaymentRequiredError extends AppError {
  constructor(
    message: string = 'Payment required',
    metadata?: Record<string, any>
  ) {
    super(message, 402, true, metadata);
    Object.setPrototypeOf(this, PaymentRequiredError.prototype);
  }
}

/**
 * Unprocessable Entity Error - 422
 * Used when request is well-formed but semantically incorrect
 */
export class UnprocessableEntityError extends AppError {
  constructor(
    message: string = 'Unprocessable entity',
    metadata?: Record<string, any>
  ) {
    super(message, 422, true, metadata);
    Object.setPrototypeOf(this, UnprocessableEntityError.prototype);
  }
}

/**
 * Method Not Allowed Error - 405
 * Used when HTTP method is not allowed for the endpoint
 */
export class MethodNotAllowedError extends AppError {
  constructor(
    message: string = 'Method not allowed',
    allowedMethods?: string[],
    metadata?: Record<string, any>
  ) {
    super(
      message,
      405,
      true,
      allowedMethods ? { ...metadata, allowedMethods } : metadata
    );
    Object.setPrototypeOf(this, MethodNotAllowedError.prototype);
  }
}

/**
 * Timeout Error - 408
 * Used when request times out
 */
export class TimeoutError extends AppError {
  constructor(message: string = 'Request timeout', metadata?: Record<string, any>) {
    super(message, 408, true, metadata);
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Helper function to check if an error is operational
 */
export const isOperationalError = (error: Error): boolean => {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
};

/**
 * Helper function to create error from unknown type
 */
export const normalizeError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(error.message, 500, false);
  }

  if (typeof error === 'string') {
    return new AppError(error, 500, false);
  }

  return new AppError('An unexpected error occurred', 500, false);
};

/**
 * Error response formatter for API responses
 */
export const formatErrorResponse = (error: AppError) => {
  const response: {
    success: false;
    error: {
      name: string;
      message: string;
      statusCode: number;
      metadata?: Record<string, any>;
      stack?: string;
    };
  } = {
    success: false,
    error: {
      name: error.name,
      message: error.message,
      statusCode: error.statusCode,
    },
  };

  if (error.metadata) {
    response.error.metadata = error.metadata;
  }

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development' && error.stack) {
    response.error.stack = error.stack;
  }

  return response;
};
