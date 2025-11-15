import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each log level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'cyan',
};

// Tell winston about our custom colors
winston.addColors(colors);

// Define log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Define console format with colors
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(
    (info) => {
      const { timestamp, level, message, ...meta } = info;
      let msg = `${timestamp} [${level}]: ${message}`;

      // Add metadata if present
      if (Object.keys(meta).length > 0) {
        // Filter out empty objects and stack traces for cleaner console output
        const filteredMeta = Object.keys(meta)
          .filter(key => key !== 'stack' && meta[key] !== undefined)
          .reduce((obj, key) => {
            obj[key] = meta[key];
            return obj;
          }, {} as Record<string, any>);

        if (Object.keys(filteredMeta).length > 0) {
          msg += `\n${JSON.stringify(filteredMeta, null, 2)}`;
        }
      }

      // Add stack trace if present
      if (info.stack) {
        msg += `\n${info.stack}`;
      }

      return msg;
    }
  )
);

// Determine log level based on environment
const level = (): string => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'info';
};

// Define transports
const transports: winston.transport[] = [
  // Console transport
  new winston.transports.Console({
    format: consoleFormat,
  }),

  // Error log file transport
  new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    format,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),

  // Combined log file transport
  new winston.transports.File({
    filename: path.join(logsDir, 'combined.log'),
    format,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
];

// Add debug log file in development
if (process.env.NODE_ENV === 'development') {
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'debug.log'),
      level: 'debug',
      format,
      maxsize: 5242880, // 5MB
      maxFiles: 3,
    })
  );
}

// Create the logger instance
const logger = winston.createLogger({
  level: level(),
  levels,
  format,
  transports,
  exitOnError: false,
  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Create a stream object for Morgan HTTP logging middleware
export const stream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

// Helper functions for structured logging
export const logWithContext = (
  level: 'error' | 'warn' | 'info' | 'http' | 'debug',
  message: string,
  context?: Record<string, any>
) => {
  logger.log(level, message, context);
};

export const logError = (error: Error, context?: Record<string, any>) => {
  logger.error(error.message, {
    ...context,
    stack: error.stack,
    name: error.name,
  });
};

export const logApiRequest = (
  method: string,
  path: string,
  statusCode: number,
  responseTime: number,
  userId?: string
) => {
  logger.http('API Request', {
    method,
    path,
    statusCode,
    responseTime: `${responseTime}ms`,
    userId,
  });
};

export const logDatabaseQuery = (
  query: string,
  duration: number,
  success: boolean
) => {
  logger.debug('Database Query', {
    query,
    duration: `${duration}ms`,
    success,
  });
};

export const logSecurityEvent = (
  event: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  details?: Record<string, any>
) => {
  const level = severity === 'critical' || severity === 'high' ? 'error' : 'warn';
  logger.log(level, `Security Event: ${event}`, {
    severity,
    ...details,
  });
};

export const logFileOperation = (
  operation: 'upload' | 'download' | 'delete' | 'share',
  fileId: string,
  userId: string,
  success: boolean,
  details?: Record<string, any>
) => {
  logger.info('File Operation', {
    operation,
    fileId,
    userId,
    success,
    ...details,
  });
};

// Export the logger instance as default
export default logger;
