import { auditLogsRepository, AuditLogWithUser } from './audit-logs.repository';
import { GetAuditLogsQuery } from './audit-logs.validation';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginatedResult } from '../../shared/types/pagination.types';

export const auditLogsService = {
  getAuditLogs: async (query: GetAuditLogsQuery): Promise<PaginatedResult<AuditLogWithUser>> => {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const { logs, total } = await auditLogsRepository.findMany(query);
    return { items: logs, meta: buildPaginationMeta(total, page, limit) };
  },
};
