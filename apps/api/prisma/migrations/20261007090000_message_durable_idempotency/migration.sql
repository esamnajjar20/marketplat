-- Durable message idempotency: Redis remains a fast concurrency guard,
-- while PostgreSQL becomes the final duplicate-prevention boundary.
ALTER TABLE "messages" ADD COLUMN "clientOperationId" VARCHAR(128);

CREATE UNIQUE INDEX "messages_senderId_clientOperationId_key"
ON "messages"("senderId", "clientOperationId");

-- Deterministic ordering for cursor pagination.
CREATE INDEX "messages_conversationId_createdAt_id_idx"
ON "messages"("conversationId", "createdAt", "id");
