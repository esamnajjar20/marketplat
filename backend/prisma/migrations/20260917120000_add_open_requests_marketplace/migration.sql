-- Open Requests marketplace (option B)
-- New tables only. Does NOT alter service_requests or service_request_broadcasts.

-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('SERVICE', 'PRODUCT', 'RENTAL');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('OPEN', 'ACCEPTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RequestOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "requests" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "RequestType" NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "city" TEXT,
    "attachedImages" TEXT[],
    "budgetMin" DECIMAL(12,2),
    "budgetMax" DECIMAL(12,2),
    "attributes" JSONB,
    "status" "RequestStatus" NOT NULL DEFAULT 'OPEN',
    "acceptedOfferId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_offers" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "offererUserId" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "message" VARCHAR(1000),
    "meta" JSONB,
    "status" "RequestOfferStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "request_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "requests_acceptedOfferId_key" ON "requests"("acceptedOfferId");

-- CreateIndex
CREATE INDEX "requests_type_status_createdAt_idx" ON "requests"("type", "status", "createdAt");

-- CreateIndex
CREATE INDEX "requests_categoryId_status_createdAt_idx" ON "requests"("categoryId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "requests_customerId_idx" ON "requests"("customerId");

-- CreateIndex
CREATE INDEX "requests_status_expiresAt_idx" ON "requests"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "request_offers_offererUserId_status_idx" ON "request_offers"("offererUserId", "status");

-- CreateIndex
CREATE INDEX "request_offers_requestId_status_idx" ON "request_offers"("requestId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "request_offers_requestId_offererUserId_key" ON "request_offers"("requestId", "offererUserId");

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_offers" ADD CONSTRAINT "request_offers_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_offers" ADD CONSTRAINT "request_offers_offererUserId_fkey" FOREIGN KEY ("offererUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Accepted offer pointer (same pattern as service_request_broadcasts.acceptedQuoteId)
ALTER TABLE "requests" ADD CONSTRAINT "requests_acceptedOfferId_fkey" FOREIGN KEY ("acceptedOfferId") REFERENCES "request_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
