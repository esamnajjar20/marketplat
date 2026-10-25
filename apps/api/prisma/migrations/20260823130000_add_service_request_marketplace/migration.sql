-- CHAT-LINK: lets a service request offer a real conversation thread
-- (same as an ad already can via conversations.adId), not just a
-- phone number. Unique because a ServiceRequest has exactly one
-- customer/provider pair — only ever one legitimate thread per request.
ALTER TABLE "conversations" ADD COLUMN "serviceRequestId" TEXT;
CREATE UNIQUE INDEX "conversations_serviceRequestId_key" ON "conversations"("serviceRequestId");
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_serviceRequestId_fkey"
  FOREIGN KEY ("serviceRequestId") REFERENCES "service_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SERVICE REQUEST MARKETPLACE: a customer posts a need once (not tied
-- to any one provider's listing) and any number of providers in that
-- category/city compete with a price quote. See schema.prisma's own
-- doc comment on ServiceRequestBroadcast for why this is a separate
-- model from ServiceRequest rather than a variant of it.
CREATE TYPE "ServiceBroadcastStatus" AS ENUM ('OPEN', 'ACCEPTED', 'CANCELLED');
CREATE TYPE "ServiceQuoteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN');

CREATE TABLE "service_request_broadcasts" (
    "id"              TEXT NOT NULL,
    "customerId"      TEXT NOT NULL,
    "categoryId"      TEXT NOT NULL,
    "title"           TEXT NOT NULL,
    "description"     VARCHAR(1000) NOT NULL,
    "city"            TEXT,
    "attachedImages"  TEXT[],
    "status"          "ServiceBroadcastStatus" NOT NULL DEFAULT 'OPEN',
    "acceptedQuoteId" TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_request_broadcasts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_quotes" (
    "id"               TEXT NOT NULL,
    "broadcastId"      TEXT NOT NULL,
    "providerId"       TEXT NOT NULL,
    "price"            DECIMAL(10,2) NOT NULL,
    "message"          VARCHAR(1000),
    "durationEstimate" TEXT,
    "status"           "ServiceQuoteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_quotes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_request_broadcasts_acceptedQuoteId_key" ON "service_request_broadcasts"("acceptedQuoteId");
CREATE INDEX "service_request_broadcasts_categoryId_status_createdAt_idx" ON "service_request_broadcasts"("categoryId", "status", "createdAt");
CREATE INDEX "service_request_broadcasts_customerId_idx" ON "service_request_broadcasts"("customerId");

-- One quote per provider per broadcast — a provider revises via PATCH,
-- not by inserting a second competing row.
CREATE UNIQUE INDEX "service_quotes_broadcastId_providerId_key" ON "service_quotes"("broadcastId", "providerId");
CREATE INDEX "service_quotes_providerId_status_idx" ON "service_quotes"("providerId", "status");

ALTER TABLE "service_request_broadcasts" ADD CONSTRAINT "service_request_broadcasts_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_request_broadcasts" ADD CONSTRAINT "service_request_broadcasts_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "service_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "service_quotes" ADD CONSTRAINT "service_quotes_broadcastId_fkey"
  FOREIGN KEY ("broadcastId") REFERENCES "service_request_broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_quotes" ADD CONSTRAINT "service_quotes_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "service_provider_details"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Added last: service_quotes must exist first since acceptedQuoteId
-- points into it (the two tables reference each other).
ALTER TABLE "service_request_broadcasts" ADD CONSTRAINT "service_request_broadcasts_acceptedQuoteId_fkey"
  FOREIGN KEY ("acceptedQuoteId") REFERENCES "service_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- New notification types for the marketplace loop — see
-- notifications.service.ts's notificationEvents.onNewServiceQuote /
-- onServiceQuoteAccepted, the two callers.
ALTER TYPE "NotificationType" ADD VALUE 'NEW_SERVICE_QUOTE';
ALTER TYPE "NotificationType" ADD VALUE 'SERVICE_QUOTE_ACCEPTED';
