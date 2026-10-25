CREATE TABLE "conversation_user_settings" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "pinnedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "mutedUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "conversation_user_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conversation_user_settings_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "conversation_user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "conversation_user_settings_conversationId_userId_key" ON "conversation_user_settings"("conversationId", "userId");
CREATE INDEX "conversation_user_settings_userId_archivedAt_updatedAt_idx" ON "conversation_user_settings"("userId", "archivedAt", "updatedAt");
CREATE INDEX "conversation_user_settings_userId_deletedAt_idx" ON "conversation_user_settings"("userId", "deletedAt");
CREATE INDEX "conversation_user_settings_conversationId_userId_mutedUntil_idx" ON "conversation_user_settings"("conversationId", "userId", "mutedUntil");

-- Preserve the previous shared pin/archive state for both participants as the initial per-user state.
INSERT INTO "conversation_user_settings" ("id", "conversationId", "userId", "pinnedAt", "archivedAt", "createdAt", "updatedAt")
SELECT md5(c.id || ':buyer'), c.id, c."buyerId", c."pinnedAt", c."archivedAt", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "conversations" c
ON CONFLICT ("conversationId", "userId") DO NOTHING;

INSERT INTO "conversation_user_settings" ("id", "conversationId", "userId", "pinnedAt", "archivedAt", "createdAt", "updatedAt")
SELECT md5(c.id || ':seller'), c.id, c."sellerId", c."pinnedAt", c."archivedAt", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "conversations" c
ON CONFLICT ("conversationId", "userId") DO NOTHING;
