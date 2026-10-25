import { Router } from 'express';
import { auditLogsController } from './audit-logs.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireAdmin } from '../../middlewares/admin.middleware';

export const auditLogsRouter = Router();

// Admin-only — same guard pattern as adminRouter (authenticate + requireAdmin).
auditLogsRouter.get('/', authenticate, requireAdmin, auditLogsController.getAuditLogs);
