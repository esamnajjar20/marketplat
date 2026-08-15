-- FIX UX-15: composite index to support the per-conversation
-- unreadCount added to conversationsRepository.findManyForUser —
-- that query filters on (conversationId, senderId, readAt) together
-- for every conversation in the caller's list, which the existing
-- (conversationId, createdAt) index doesn't cover.

-- CreateIndex
CREATE INDEX "messages_conversationId_senderId_readAt_idx" ON "messages"("conversationId", "senderId", "readAt");
