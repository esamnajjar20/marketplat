-- COLLECTIONS (P1): lets a store owner group products into named,
-- ordered shelves. A product may belong to more than one collection,
-- hence the join table rather than a collectionId column on Product
-- (see schema.prisma's doc comment on StoreCollection for the full
-- reasoning).

CREATE TABLE "store_collections" (
    "id"          TEXT NOT NULL,
    "storeId"     TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "slug"        TEXT NOT NULL,
    "description" VARCHAR(500),
    "imageUrl"    TEXT,
    "sortOrder"   INTEGER NOT NULL DEFAULT 0,
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_collections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "store_collection_products" (
    "collectionId" TEXT NOT NULL,
    "productId"    TEXT NOT NULL,
    "sortOrder"    INTEGER NOT NULL DEFAULT 0,
    "addedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_collection_products_pkey" PRIMARY KEY ("collectionId","productId")
);

CREATE UNIQUE INDEX "store_collections_storeId_slug_key" ON "store_collections"("storeId", "slug");
CREATE INDEX "store_collections_storeId_isActive_sortOrder_idx" ON "store_collections"("storeId", "isActive", "sortOrder");

CREATE INDEX "store_collection_products_productId_idx" ON "store_collection_products"("productId");
CREATE INDEX "store_collection_products_collectionId_sortOrder_idx" ON "store_collection_products"("collectionId", "sortOrder");

ALTER TABLE "store_collections" ADD CONSTRAINT "store_collections_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "store_details"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "store_collection_products" ADD CONSTRAINT "store_collection_products_collectionId_fkey"
  FOREIGN KEY ("collectionId") REFERENCES "store_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "store_collection_products" ADD CONSTRAINT "store_collection_products_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
