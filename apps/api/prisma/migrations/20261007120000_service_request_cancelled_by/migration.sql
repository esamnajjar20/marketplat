-- Record who cancelled a service request ('CUSTOMER' | 'PROVIDER') so a
-- customer's own cancellation no longer counts against the provider's
-- fulfillmentRate. Nullable: legacy rows keep their previous behaviour.
ALTER TABLE "service_requests" ADD COLUMN IF NOT EXISTS "cancelledBy" TEXT;
