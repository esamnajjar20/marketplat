ALTER TABLE "store_details" ADD COLUMN IF NOT EXISTS "paymentMethods" JSONB;
ALTER TABLE "seller_profiles" ADD COLUMN IF NOT EXISTS "paymentMethods" JSONB;
ALTER TABLE "service_provider_details" ADD COLUMN IF NOT EXISTS "paymentMethods" JSONB;
