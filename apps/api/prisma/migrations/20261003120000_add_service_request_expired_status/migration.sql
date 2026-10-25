-- AlterEnum
-- FIX SR-EXPIRY (audit H4): a PENDING request nobody answers within the TTL
-- is closed by the expiry cron as EXPIRED (distinct from a user-driven
-- CANCELLED). Values are appended so existing rows are unaffected.
ALTER TYPE "ServiceRequestStatus" ADD VALUE 'EXPIRED';
