CREATE TYPE "StoreFieldType" AS ENUM ('TEXT', 'NUMBER', 'BOOLEAN', 'SELECT');

CREATE TABLE "store_type_fields" (
  "id" TEXT NOT NULL,
  "storeTypeId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "labelAr" TEXT NOT NULL,
  "type" "StoreFieldType" NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "options" JSONB,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "store_type_fields_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "store_type_fields_storeTypeId_key_key" ON "store_type_fields"("storeTypeId", "key");
CREATE INDEX "store_type_fields_storeTypeId_isActive_sortOrder_idx" ON "store_type_fields"("storeTypeId", "isActive", "sortOrder");
ALTER TABLE "store_type_fields" ADD CONSTRAINT "store_type_fields_storeTypeId_fkey" FOREIGN KEY ("storeTypeId") REFERENCES "store_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "store_details" ADD COLUMN "attributes" JSONB;
