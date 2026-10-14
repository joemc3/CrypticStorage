import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { logger } from './logger';
import { clientIp, userAgent } from './http';

export interface AuditEvent {
  userId?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  success?: boolean;
  metadata?: Record<string, unknown>;
}

/** Fire-and-forget audit record. Never throws into the request path. */
export function audit(req: Request | undefined, event: AuditEvent): void {
  const data: Prisma.AuditLogUncheckedCreateInput = {
    userId: event.userId ?? null,
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    success: event.success ?? true,
    metadata: event.metadata as Prisma.InputJsonValue | undefined,
    ipAddress: req ? clientIp(req) : undefined,
    userAgent: req ? userAgent(req) : undefined,
  };
  prisma.auditLog.create({ data }).catch((err: unknown) => {
    logger.warn({ err, action: event.action }, 'audit log write failed');
  });
}
