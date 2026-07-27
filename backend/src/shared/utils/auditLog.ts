import { prisma } from '../../config/prisma';
import { logger } from './logger';
import { AuditEventType, Prisma } from '@prisma/client';

export { AuditEventType as AuditEvent };

interface AuditLogEntry {
  event: AuditEventType;
  userId?: string;
  sessionId?: string;
  ip?: string;
  userAgent?: string;
  details?: Prisma.InputJsonValue;
}

export const auditLog = async (entry: AuditLogEntry): Promise<void> => {
  // دائماً نلوج أولاً
  logger.info(`[AUDIT] ${entry.event}`, {
    audit: true,
    ...entry,
    timestamp: new Date().toISOString(),
  });

  // نكتب للـ DB بشكل async — لا ننتظر ولا نوقف الطلب إذا فشل
  prisma.auditLog
    .create({
      data: {
        event: entry.event,
        userId: entry.userId,
        sessionId: entry.sessionId,
        ip: entry.ip,
        userAgent: entry.userAgent,
        details: entry.details ?? undefined,
      },
    })
    .catch(err => {
      logger.error('Failed to write audit log to DB', { err, entry });
    });
};
