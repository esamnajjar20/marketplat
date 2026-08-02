import { Request, Response, NextFunction } from 'express';
import { auditLogsService } from './audit-logs.service';
import { getAuditLogsSchema } from './audit-logs.validation';
import { successResponse } from '../../shared/types/api-response.types';

export const auditLogsController = {
  /** GET /admin/audit-logs — admin-only, mounted with authenticate+requireAdmin in the router. */
  getAuditLogs: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = getAuditLogsSchema.parse({ query: req.query });
      const result = await auditLogsService.getAuditLogs(query);
      res
        .status(200)
        .json(successResponse('Audit logs fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },
};
