import { prisma } from '../../config/prisma';
import { getPaginationParams } from '../../shared/utils/pagination';
import { Prisma } from '@prisma/client';
import { GetAuditLogsQuery } from './audit-logs.validation';

export type AuditLogWithUser = Prisma.AuditLogGetPayload<{
  include: {
    user: { select: { id: true; name: true; email: true } };
  };
}>;

const auditLogWithUser = {
  user: { select: { id: true, name: true, email: true } },
} as const;

export const auditLogsRepository = {
  findMany: async (
    query: GetAuditLogsQuery
  ): Promise<{ logs: AuditLogWithUser[]; total: number }> => {
    const {
      page = 1,
      limit = 20,
      event,
      userId,
      from,
      to,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;
    const { skip, take } = getPaginationParams(page, limit);

    const where: Prisma.AuditLogWhereInput = {
      ...(event && { event }),
      ...(userId && { userId }),
      ...((from || to) && {
        createdAt: {
          ...(from && { gte: from }),
          ...(to && { lte: to }),
        },
      }),
    };

    // D-05-style read-only pair — Promise.all, no transaction needed.
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: auditLogWithUser,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { logs, total };
  },
};
