export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string = 'ERROR',
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: Record<string, unknown>) {
    super(400, message, 'BAD_REQUEST', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, message, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, message, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(404, message, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(409, message, 'CONFLICT');
  }
}

export class GoneError extends AppError {
  constructor(message = 'Gone') {
    super(410, message, 'GONE');
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = 'Payload too large') {
    super(413, message, 'PAYLOAD_TOO_LARGE');
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: Record<string, unknown>) {
    super(422, message, 'VALIDATION_ERROR', details);
  }
}

export class QuotaExceededError extends AppError {
  constructor(message = 'Storage quota exceeded') {
    super(507, message, 'QUOTA_EXCEEDED');
  }
}
