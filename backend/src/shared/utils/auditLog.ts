import { prisma } from '../../config/prisma';
import { logger } from './logger';
import { AuditEventType } from '@prisma/client';

export { AuditEventType as AuditEvent };

// FIX SEC-3.3: `details` was a fully free-form Prisma.InputJsonValue with
// no documented shape — any call site could store anything, including
// deeply nested structures that don't match how every existing call
// site actually uses it. In practice every one of the ~20 call sites
// across modules/ passes a flat, single-level object of primitives
// (e.g. `{ storeId, status }`, `{ targetUserId, newRole }`). This type
// documents and enforces that convention for new call sites without
// changing the DB column (still free-form JSON) or touching existing
// callers, which already conform.
export type AuditLogDetails = Record<string, string | number | boolean | null | undefined>;

interface AuditLogEntry {
  event: AuditEventType;
  userId?: string;
  sessionId?: string;
  ip?: string;
  userAgent?: string;
  details?: AuditLogDetails;
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
