-- Add a customer dispute terminal state and its audit fields.
ALTER TYPE "ServiceRequestStatus" ADD VALUE IF NOT EXISTS 'DISPUTED';
ALTER TABLE "service_requests"
  ADD COLUMN IF NOT EXISTS "disputeReason" VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS "disputedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "disputedBy" TEXT;
ALTER TABLE "service_requests"
  ADD COLUMN IF NOT EXISTS "disputeResolutionNote" VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS "disputeResolvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "disputeResolvedBy" TEXT;
