-- User-owned named favorite lists (سيارات / هواتف / ...).
-- Favorites remain polymorphic; listId is optional so legacy rows stay valid.

CREATE TABLE "favorite_lists" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "favorite_lists_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "favorite_lists_userId_name_key" ON "favorite_lists"("userId", "name");
CREATE INDEX "favorite_lists_userId_sortOrder_idx" ON "favorite_lists"("userId", "sortOrder");

ALTER TABLE "favorite_lists"
  ADD CONSTRAINT "favorite_lists_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "favorites" ADD COLUMN "listId" TEXT;

ALTER TABLE "favorites"
  ADD CONSTRAINT "favorites_listId_fkey"
  FOREIGN KEY ("listId") REFERENCES "favorite_lists"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "favorites_listId_idx" ON "favorites"("listId");
