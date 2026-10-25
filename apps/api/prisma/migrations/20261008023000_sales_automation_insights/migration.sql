CREATE TYPE "SalesAutomationEventType" AS ENUM ('LOW_STOCK', 'OVERDUE_DEBT', 'UPCOMING_INSTALLMENT', 'INACTIVE_CUSTOMER', 'DAILY_SUMMARY');

CREATE TABLE "sales_automation_events" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "SalesAutomationEventType" NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sendCount" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sales_automation_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sales_automation_events_userId_type_fingerprint_key" ON "sales_automation_events"("userId", "type", "fingerprint");
CREATE INDEX "sales_automation_events_userId_lastSentAt_idx" ON "sales_automation_events"("userId", "lastSentAt");
ALTER TABLE "sales_automation_events" ADD CONSTRAINT "sales_automation_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SALES_LOW_STOCK';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SALES_OVERDUE_DEBT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SALES_UPCOMING_INSTALLMENT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SALES_INACTIVE_CUSTOMER';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SALES_DAILY_SUMMARY';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SALES_SMART_INSIGHT';
