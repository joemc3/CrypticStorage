import { prisma } from '../config/database';
import logger from '../utils/logger';
import { DatabaseError } from '../utils/errors';

/**
 * Audit Service
 * Handles audit logging for all security-relevant events and user activity
 */

/**
 * Interface Definitions
 */
export interface AuditLogData {
  userId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  success?: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

export interface AuditLogQuery {
  userId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  success?: boolean;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Audit Action Types
 */
export enum AuditAction {
  // Authentication actions
  USER_REGISTER = 'user.register',
  USER_LOGIN = 'user.login',
  USER_LOGOUT = 'user.logout',
  USER_LOGIN_FAILED = 'user.login_failed',
  PASSWORD_CHANGE = 'user.password_change',
  TOTP_ENABLE = 'user.totp_enable',
  TOTP_DISABLE = 'user.totp_disable',
  SESSION_CREATE = 'session.create',
  SESSION_DELETE = 'session.delete',
  SESSION_VALIDATE_FAILED = 'session.validate_failed',

  // File actions
  FILE_UPLOAD = 'file.upload',
  FILE_DOWNLOAD = 'file.download',
  FILE_DELETE = 'file.delete',
  FILE_UPDATE = 'file.update',
  FILE_MOVE = 'file.move',
  FILE_RENAME = 'file.rename',
  FILE_VERSION_CREATE = 'file.version_create',
  FILE_VERSION_RESTORE = 'file.version_restore',

  // Folder actions
  FOLDER_CREATE = 'folder.create',
  FOLDER_DELETE = 'folder.delete',
  FOLDER_UPDATE = 'folder.update',
  FOLDER_MOVE = 'folder.move',
  FOLDER_RENAME = 'folder.rename',

  // Share actions
  SHARE_CREATE = 'share.create',
  SHARE_DELETE = 'share.delete',
  SHARE_ACCESS = 'share.access',
  SHARE_DOWNLOAD = 'share.download',
  SHARE_ACCESS_DENIED = 'share.access_denied',

  // User share actions
  USER_SHARE_CREATE = 'user_share.create',
  USER_SHARE_DELETE = 'user_share.delete',
  USER_SHARE_ACCESS = 'user_share.access',

  // Account actions
  ACCOUNT_UPDATE = 'account.update',
  ACCOUNT_DELETE = 'account.delete',
  EMAIL_VERIFY = 'account.email_verify',

  // Security events
  SECURITY_RATE_LIMIT = 'security.rate_limit',
  SECURITY_INVALID_TOKEN = 'security.invalid_token',
  SECURITY_UNAUTHORIZED_ACCESS = 'security.unauthorized_access',
  SECURITY_SUSPICIOUS_ACTIVITY = 'security.suspicious_activity',
}

/**
 * Resource Types
 */
export enum ResourceType {
  USER = 'user',
  FILE = 'file',
  FOLDER = 'folder',
  SHARE = 'share',
  USER_SHARE = 'user_share',
  SESSION = 'session',
}

/**
 * Create an audit log entry
 */
export const createAuditLog = async (data: AuditLogData): Promise<void> => {
  try {
    logger.debug('Creating audit log', {
      action: data.action,
      userId: data.userId,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
    });

    await prisma.auditLog.create({
      data: {
        userId: data.userId,
        action: data.action,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        success: data.success ?? true,
        errorMessage: data.errorMessage,
      },
    });

    logger.debug('Audit log created successfully', { action: data.action });
  } catch (error) {
    // Don't throw errors for audit log failures
    // Just log them so they don't break the main flow
    logger.error('Failed to create audit log', {
      action: data.action,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Log user authentication event
 */
export const logAuthEvent = async (
  action: AuditAction,
  userId: string | undefined,
  success: boolean,
  ipAddress?: string,
  userAgent?: string,
  errorMessage?: string
): Promise<void> => {
  await createAuditLog({
    userId,
    action,
    resourceType: ResourceType.USER,
    resourceId: userId,
    ipAddress,
    userAgent,
    success,
    errorMessage,
  });
};

/**
 * Log file operation
 */
export const logFileOperation = async (
  action: AuditAction,
  userId: string,
  fileId: string,
  success: boolean = true,
  ipAddress?: string,
  userAgent?: string,
  errorMessage?: string
): Promise<void> => {
  await createAuditLog({
    userId,
    action,
    resourceType: ResourceType.FILE,
    resourceId: fileId,
    ipAddress,
    userAgent,
    success,
    errorMessage,
  });
};

/**
 * Log folder operation
 */
export const logFolderOperation = async (
  action: AuditAction,
  userId: string,
  folderId: string,
  success: boolean = true,
  ipAddress?: string,
  userAgent?: string,
  errorMessage?: string
): Promise<void> => {
  await createAuditLog({
    userId,
    action,
    resourceType: ResourceType.FOLDER,
    resourceId: folderId,
    ipAddress,
    userAgent,
    success,
    errorMessage,
  });
};

/**
 * Log share operation
 */
export const logShareOperation = async (
  action: AuditAction,
  userId: string | undefined,
  shareId: string,
  success: boolean = true,
  ipAddress?: string,
  userAgent?: string,
  errorMessage?: string
): Promise<void> => {
  await createAuditLog({
    userId,
    action,
    resourceType: ResourceType.SHARE,
    resourceId: shareId,
    ipAddress,
    userAgent,
    success,
    errorMessage,
  });
};

/**
 * Log security event
 */
export const logSecurityEvent = async (
  action: AuditAction,
  userId: string | undefined,
  ipAddress?: string,
  userAgent?: string,
  errorMessage?: string
): Promise<void> => {
  await createAuditLog({
    userId,
    action,
    ipAddress,
    userAgent,
    success: false,
    errorMessage,
  });

  // Also log to Winston for immediate alerting
  logger.warn('Security Event', {
    action,
    userId,
    ipAddress,
    userAgent,
    errorMessage,
  });
};

/**
 * Get audit logs with filtering
 */
export const getAuditLogs = async (query: AuditLogQuery) => {
  try {
    logger.debug('Fetching audit logs', query);

    // Build where clause
    const where: any = {};

    if (query.userId) {
      where.userId = query.userId;
    }

    if (query.action) {
      where.action = query.action;
    }

    if (query.resourceType) {
      where.resourceType = query.resourceType;
    }

    if (query.resourceId) {
      where.resourceId = query.resourceId;
    }

    if (query.success !== undefined) {
      where.success = query.success;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = query.startDate;
      }
      if (query.endDate) {
        where.createdAt.lte = query.endDate;
      }
    }

    // Get total count
    const total = await prisma.auditLog.count({ where });

    // Get logs
    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take: query.limit || 100,
      skip: query.offset || 0,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
          },
        },
      },
    });

    logger.debug('Audit logs fetched', { count: logs.length, total });

    return {
      logs,
      total,
      limit: query.limit || 100,
      offset: query.offset || 0,
    };
  } catch (error) {
    logger.error('Failed to fetch audit logs', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new DatabaseError('Failed to fetch audit logs');
  }
};

/**
 * Get audit logs for a specific user
 */
export const getUserAuditLogs = async (
  userId: string,
  limit: number = 100,
  offset: number = 0
) => {
  return getAuditLogs({ userId, limit, offset });
};

/**
 * Get audit logs for a specific resource
 */
export const getResourceAuditLogs = async (
  resourceType: string,
  resourceId: string,
  limit: number = 100,
  offset: number = 0
) => {
  return getAuditLogs({ resourceType, resourceId, limit, offset });
};

/**
 * Get recent failed login attempts
 */
export const getRecentFailedLogins = async (
  emailOrUsername?: string,
  ipAddress?: string,
  minutes: number = 15
): Promise<number> => {
  try {
    const startDate = new Date(Date.now() - minutes * 60 * 1000);

    const where: any = {
      action: AuditAction.USER_LOGIN_FAILED,
      success: false,
      createdAt: {
        gte: startDate,
      },
    };

    if (ipAddress) {
      where.ipAddress = ipAddress;
    }

    const count = await prisma.auditLog.count({ where });

    logger.debug('Failed login attempts counted', {
      emailOrUsername,
      ipAddress,
      count,
      minutes,
    });

    return count;
  } catch (error) {
    logger.error('Failed to get recent failed logins', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return 0;
  }
};

/**
 * Get user activity summary
 */
export const getUserActivitySummary = async (
  userId: string,
  days: number = 30
) => {
  try {
    logger.debug('Getting user activity summary', { userId, days });

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get activity counts by action type
    const activityCounts = await prisma.auditLog.groupBy({
      by: ['action'],
      where: {
        userId,
        createdAt: {
          gte: startDate,
        },
      },
      _count: {
        action: true,
      },
    });

    // Get total activity count
    const totalActivity = await prisma.auditLog.count({
      where: {
        userId,
        createdAt: {
          gte: startDate,
        },
      },
    });

    // Get last login
    const lastLogin = await prisma.auditLog.findFirst({
      where: {
        userId,
        action: AuditAction.USER_LOGIN,
        success: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        createdAt: true,
        ipAddress: true,
        userAgent: true,
      },
    });

    // Group activities by category
    const summary = {
      totalActivity,
      lastLogin,
      activityByType: activityCounts.reduce((acc, item) => {
        acc[item.action] = item._count.action;
        return acc;
      }, {} as Record<string, number>),
      period: {
        days,
        startDate,
        endDate: new Date(),
      },
    };

    logger.debug('User activity summary generated', { userId, totalActivity });

    return summary;
  } catch (error) {
    logger.error('Failed to get user activity summary', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new DatabaseError('Failed to get user activity summary');
  }
};

/**
 * Get security events
 */
export const getSecurityEvents = async (
  limit: number = 100,
  offset: number = 0,
  startDate?: Date,
  endDate?: Date
) => {
  try {
    logger.debug('Fetching security events', { limit, offset });

    const where: any = {
      action: {
        startsWith: 'security.',
      },
      success: false,
    };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = startDate;
      }
      if (endDate) {
        where.createdAt.lte = endDate;
      }
    }

    const total = await prisma.auditLog.count({ where });

    const events = await prisma.auditLog.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
          },
        },
      },
    });

    logger.debug('Security events fetched', { count: events.length, total });

    return {
      events,
      total,
      limit,
      offset,
    };
  } catch (error) {
    logger.error('Failed to fetch security events', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new DatabaseError('Failed to fetch security events');
  }
};

/**
 * Clean up old audit logs
 * Should be run periodically to prevent unbounded growth
 */
export const cleanupOldAuditLogs = async (retentionDays: number = 90): Promise<number> => {
  try {
    logger.info('Cleaning up old audit logs', { retentionDays });

    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const result = await prisma.auditLog.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    logger.info('Old audit logs cleaned up', { deletedCount: result.count });

    return result.count;
  } catch (error) {
    logger.error('Failed to cleanup old audit logs', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new DatabaseError('Failed to cleanup old audit logs');
  }
};

// Export all functions
export default {
  createAuditLog,
  logAuthEvent,
  logFileOperation,
  logFolderOperation,
  logShareOperation,
  logSecurityEvent,
  getAuditLogs,
  getUserAuditLogs,
  getResourceAuditLogs,
  getRecentFailedLogins,
  getUserActivitySummary,
  getSecurityEvents,
  cleanupOldAuditLogs,
  AuditAction,
  ResourceType,
};
