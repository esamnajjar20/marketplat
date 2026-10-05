-- Stage 3: ad lifecycle + report-driven moderation.
ALTER TYPE "AdStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TABLE "ads" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "ads" ADD COLUMN "expirationNotifiedAt" TIMESTAMP(3);

-- Existing ACTIVE ads get a deterministic 60-day lifecycle from creation.
UPDATE "ads"
SET "expiresAt" = "createdAt" + INTERVAL '60 days'
WHERE "expiresAt" IS NULL AND "status" = 'ACTIVE';

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'AD_EXPIRING_SOON';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'AD_EXPIRED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MODERATION_REPORT_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MODERATION_DECISION';

CREATE INDEX "ads_status_expiresAt_idx" ON "ads"("status", "expiresAt");
CREATE INDEX "ads_expirationNotifiedAt_idx" ON "ads"("expirationNotifiedAt");
