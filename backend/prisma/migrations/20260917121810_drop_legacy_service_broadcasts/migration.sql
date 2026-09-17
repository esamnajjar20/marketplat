/*
  Warnings:

  - You are about to drop the `service_quotes` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `service_request_broadcasts` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEventType" ADD VALUE 'ADMIN_STORE_STATUS_CHANGED';
ALTER TYPE "AuditEventType" ADD VALUE 'ADMIN_SERVICE_BROADCAST_CANCELLED';

-- DropForeignKey
ALTER TABLE "service_quotes" DROP CONSTRAINT "service_quotes_broadcastId_fkey";

-- DropForeignKey
ALTER TABLE "service_quotes" DROP CONSTRAINT "service_quotes_providerId_fkey";

-- DropForeignKey
ALTER TABLE "service_request_broadcasts" DROP CONSTRAINT "service_request_broadcasts_acceptedQuoteId_fkey";

-- DropForeignKey
ALTER TABLE "service_request_broadcasts" DROP CONSTRAINT "service_request_broadcasts_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "service_request_broadcasts" DROP CONSTRAINT "service_request_broadcasts_customerId_fkey";

-- DropIndex
DROP INDEX "conversations_buyerId_pinnedAt_updatedAt_idx";

-- DropIndex
DROP INDEX "conversations_sellerId_pinnedAt_updatedAt_idx";

-- DropIndex
DROP INDEX "favorites_listId_idx";

-- DropIndex
DROP INDEX "favorites_userId_adId_key";

-- DropIndex
DROP INDEX "service_provider_details_serviceAreaCities_idx";

-- DropTable
DROP TABLE "service_quotes";

-- DropTable
DROP TABLE "service_request_broadcasts";

-- DropEnum
DROP TYPE "ServiceQuoteStatus";

-- CreateTable
CREATE TABLE "fcm_device_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" VARCHAR(500) NOT NULL,
    "platform" VARCHAR(20) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fcm_device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "failed_background_tasks" (
    "id" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failed_background_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fcm_device_tokens_token_key" ON "fcm_device_tokens"("token");

-- CreateIndex
CREATE INDEX "fcm_device_tokens_userId_idx" ON "fcm_device_tokens"("userId");

-- CreateIndex
CREATE INDEX "failed_background_tasks_taskType_resolved_createdAt_idx" ON "failed_background_tasks"("taskType", "resolved", "createdAt");

-- AddForeignKey
ALTER TABLE "fcm_device_tokens" ADD CONSTRAINT "fcm_device_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
