-- Store Expansion polish: allow the same logical key to exist once per
-- StoreType + scope (for example `name` can exist for STORE and PRODUCT).
DROP INDEX IF EXISTS "store_type_fields_storeTypeId_key_key";
CREATE UNIQUE INDEX "store_type_fields_storeTypeId_scope_key_key"
  ON "store_type_fields"("storeTypeId", "scope", "key");

CREATE INDEX IF NOT EXISTS "store_type_fields_storeTypeId_scope_isActive_sortOrder_idx"
  ON "store_type_fields"("storeTypeId", "scope", "isActive", "sortOrder");
