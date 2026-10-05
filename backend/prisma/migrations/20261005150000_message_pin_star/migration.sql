CREATE TABLE IF NOT EXISTS "message_pins" (
  "messageId" TEXT NOT NULL,
  "pinnedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_pins_pkey" PRIMARY KEY ("messageId"),
  CONSTRAINT "message_pins_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "message_pins_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "message_pins_pinnedById_createdAt_idx" ON "message_pins"("pinnedById", "createdAt");

CREATE TABLE IF NOT EXISTS "message_stars" (
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_stars_pkey" PRIMARY KEY ("messageId", "userId"),
  CONSTRAINT "message_stars_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "message_stars_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "message_stars_userId_createdAt_idx" ON "message_stars"("userId", "createdAt");
