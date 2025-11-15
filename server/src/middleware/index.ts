/**
 * Middleware exports
 * Central export point for all middleware
 */

// Authentication middleware
export {
  authenticateToken,
  optionalAuth,
  validateRefreshToken,
  generateAccessToken,
  generateRefreshToken,
  type AuthRequest,
} from './auth.middleware';

// Rate limiting middleware
export {
  standardLimiter,
  authLimiter,
  fileLimiter,
  uploadLimiter,
  sensitiveOperationLimiter,
  apiKeyLimiter,
  closeRateLimitRedis,
} from './rateLimit.middleware';

// Validation middleware
export {
  validate,
  validateBody,
  validateQuery,
  validateParams,
  commonSchemas,
  sanitizeInputs,
  sanitizeString,
} from './validation.middleware';

// Error handling middleware
export {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  handleUnhandledRejection,
  handleUncaughtException,
  gracefulShutdown,
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  BadRequestError,
  ConflictError,
  ValidationError,
  InternalServerError,
  ServiceUnavailableError,
  PayloadTooLargeError,
  TooManyRequestsError,
} from './error.middleware';

// Upload middleware
export {
  uploadMemory,
  uploadDisk,
  uploadSingleFile,
  uploadMultipleFiles,
  uploadFields,
  uploadSingleFileToDisk,
  uploadMultipleFilesToDisk,
  validateFileSize,
  requireFile,
  validateFileName,
  getFileExtension,
  getFileNameWithoutExtension,
  sanitizeFileName,
  formatBytes,
  getMimeTypeFromExtension,
  isImageFile,
  isVideoFile,
  isAudioFile,
  isDocumentFile,
} from './upload.middleware';
