-- Fraud-detection (item 12 — "نظام مكافحة الاحتيال").

-- CreateEnum
CREATE TYPE "FraudSignalType" AS ENUM (
    'RAPID_POSTING',
    'SUSPICIOUS_PRICE',
    'SUSPICIOUS_CONTACT_PATTERN',
    'SUSPICIOUS_KEYWORDS',
    'DUPLICATE_LISTING',
    'NEW_ACCOUNT_HIGH_ACTIVITY',
    'MANUAL_ADMIN_FLAG'
);

-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE 'ADMIN_FRAUD_SIGNAL_REVIEWED';
ALTER TYPE "AuditEventType" ADD VALUE 'ADMIN_FRAUD_MANUAL_FLAG';

-- AlterTable
ALTER TABLE "ads" ADD COLUMN "riskScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ads" ADD COLUMN "flaggedForReview" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "fraud_signals" (
    "id" TEXT NOT NULL,
    "type" "FraudSignalType" NOT NULL,
    "weight" INTEGER NOT NULL,
    "metadata" JSONB,
    "userId" TEXT,
    "adId" TEXT,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraud_signals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ads_flaggedForReview_createdAt_idx" ON "ads"("flaggedForReview", "createdAt");

-- CreateIndex
CREATE INDEX "fraud_signals_userId_createdAt_idx" ON "fraud_signals"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "fraud_signals_adId_createdAt_idx" ON "fraud_signals"("adId", "createdAt");

-- CreateIndex
CREATE INDEX "fraud_signals_type_createdAt_idx" ON "fraud_signals"("type", "createdAt");

-- CreateIndex
CREATE INDEX "fraud_signals_reviewed_createdAt_idx" ON "fraud_signals"("reviewed", "createdAt");

-- AddForeignKey
ALTER TABLE "fraud_signals" ADD CONSTRAINT "fraud_signals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_signals" ADD CONSTRAINT "fraud_signals_adId_fkey" FOREIGN KEY ("adId") REFERENCES "ads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
