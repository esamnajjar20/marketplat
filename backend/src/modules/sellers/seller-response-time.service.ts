/**
 * TRACK-RESPONSE-TIME (Phase 2)
 *
 * Updates SellerProfile.responseTimeMinutes + responseRate when a seller
 * sends their *first* reply in a conversation.
 *
 * Algorithm (intentionally simple, no new tables):
 * 1. Only runs when the sender is the conversation's sellerId.
 * 2. Only on the seller's first non-deleted message in that thread.
 * 3. Sample = minutes between the buyer's first message and this reply.
 * 4. Cap sample at MAX_SAMPLE_MINUTES (7 days) to ignore abandoned threads.
 * 5. EMA: newAvg = round(α * sample + (1-α) * oldAvg), α = 0.3
 * 6. responseRate: repliedThreads / (repliedThreads + waitingThreads)
 *    approximated as: bump replied count via a soft counter stored only
 *    as the rate itself — we recompute rate as
 *      rate = min(100, (oldRate * weight + 100) / (weight + 1))
 *    on each successful first-reply (weight = 19 → ~20-sample window).
 *
 * Fire-and-forget from conversations.service.sendMessage — never fails
 * the message send path.
 */
import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';

const MAX_SAMPLE_MINUTES = 7 * 24 * 60; // 7 days
const EMA_ALPHA = 0.3;
const RATE_WINDOW = 19; // effective sample window for responseRate smoothing

export const sellerResponseTimeService = {
  /**
   * Call after a message is successfully created.
   * No-op unless sender is the seller and this is their first message
   * in the conversation.
   */
  recordSellerFirstReply: async (
    conversationId: string,
    senderId: string,
    sellerId: string,
    messageCreatedAt: Date
  ): Promise<void> => {
    if (senderId !== sellerId) return;

    try {
      // Already replied before in this thread?
      const priorSellerMessages = await prisma.message.count({
        where: {
          conversationId,
          senderId: sellerId,
          deletedAt: null,
          createdAt: { lt: messageCreatedAt },
        },
      });
      if (priorSellerMessages > 0) return;

      const firstBuyerMessage = await prisma.message.findFirst({
        where: {
          conversationId,
          senderId: { not: sellerId },
          deletedAt: null,
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });
      if (!firstBuyerMessage) return;

      const deltaMs = messageCreatedAt.getTime() - firstBuyerMessage.createdAt.getTime();
      if (deltaMs < 0) return;

      let sampleMinutes = Math.round(deltaMs / 60_000);
      if (sampleMinutes < 1) sampleMinutes = 1;
      if (sampleMinutes > MAX_SAMPLE_MINUTES) sampleMinutes = MAX_SAMPLE_MINUTES;

      const profile = await prisma.sellerProfile.findUnique({
        where: { userId: sellerId },
        select: { id: true, responseTimeMinutes: true, responseRate: true },
      });
      if (!profile) return;

      const prev = profile.responseTimeMinutes;
      const nextMinutes =
        prev == null || prev <= 0
          ? sampleMinutes
          : Math.round(EMA_ALPHA * sampleMinutes + (1 - EMA_ALPHA) * prev);

      // responseRate: smooth toward 100 on each first-reply observed
      const prevRate = profile.responseRate != null ? Number(profile.responseRate) : 0;
      const nextRate =
        Math.round(
          Math.min(100, (prevRate * RATE_WINDOW + 100) / (RATE_WINDOW + 1)) * 100
        ) / 100;

      await prisma.sellerProfile.update({
        where: { id: profile.id },
        data: {
          responseTimeMinutes: nextMinutes,
          responseRate: nextRate,
        },
      });
    } catch (err) {
      logger.error('sellerResponseTimeService.recordSellerFirstReply failed', {
        err,
        conversationId,
        sellerId,
      });
    }
  },
};
