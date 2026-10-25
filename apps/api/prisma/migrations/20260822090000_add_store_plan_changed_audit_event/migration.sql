-- FIX BUG-02: adds ADMIN_STORE_PLAN_CHANGED to AuditEventType so the new
-- PATCH /admin/stores/:id/plan endpoint (stores.service.ts's
-- updateStorePlan) can write an audit trail, mirroring
-- ADMIN_STORE_STATUS_CHANGED for the existing status-transition endpoint.
ALTER TYPE "AuditEventType" ADD VALUE 'ADMIN_STORE_PLAN_CHANGED';
