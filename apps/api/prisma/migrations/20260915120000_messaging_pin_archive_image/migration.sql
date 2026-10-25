-- Pin / archive conversations
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "pinnedAt" TIMESTAMP(3);
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "conversations_buyerId_pinnedAt_updatedAt_idx"
  ON "conversations"("buyerId", "pinnedAt", "updatedAt");
CREATE INDEX IF NOT EXISTS "conversations_sellerId_pinnedAt_updatedAt_idx"
  ON "conversations"("sellerId", "pinnedAt", "updatedAt");

-- Optional image attachment on messages
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
