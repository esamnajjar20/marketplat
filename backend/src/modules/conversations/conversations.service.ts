import { Conversation, Message } from '@prisma/client';
import { conversationsRepository, messagesRepository, ConversationWithRelations } from './conversations.repository';
import { adsRepository } from '../ads/ads.repository';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginatedResult } from '../../shared/types/pagination.types';

const assertParty = (conversation: Conversation, userId: string): void => {
  if (conversation.buyerId !== userId && conversation.sellerId !== userId) {
    throw new ForbiddenError('You are not a party to this conversation.', 'NOT_YOUR_CONVERSATION');
  }
};

export const conversationsService = {
  /**
   * Starts (or reopens) a thread about a specific ad. The only entry
   * point in the current UI (SellerCard's "مراسلة البائع") always
   * supplies an adId — this resolves the ad's owner as the seller side
   * and the caller as the buyer side, then reuses the existing thread
   * for that (ad, buyer, seller) triple if one already exists rather
   * than creating a duplicate — same idempotent-create shape as
   * sellers.service's own profile-creation guard.
   */
  startFromAd: async (buyerId: string, adId: string): Promise<Conversation> => {
    const ad = await adsRepository.findById(adId);
    if (!ad || ad.status === 'DELETED') {
      throw new NotFoundError('Ad not found', 'AD_NOT_FOUND');
    }

    const sellerId = ad.userId;
    if (sellerId === buyerId) {
      throw new BadRequestError('You cannot message yourself about your own ad.', 'CANNOT_MESSAGE_SELF');
    }

    const existing = await conversationsRepository.findExisting(adId, buyerId, sellerId);
    if (existing) return existing;

    return conversationsRepository.create(adId, buyerId, sellerId);
  },

  getConversationById: async (userId: string, id: string): Promise<ConversationWithRelations> => {
    const conversation = await conversationsRepository.findById(id);
    if (!conversation) throw new NotFoundError('Conversation not found', 'CONVERSATION_NOT_FOUND');
    assertParty(conversation, userId);
    return conversation;
  },

  getMyConversations: async (
    userId: string,
    query: { page?: number; limit?: number }
  ): Promise<PaginatedResult<ConversationWithRelations>> => {
    const { conversations, total } = await conversationsRepository.findManyForUser(userId, query);
    return {
      items: conversations,
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
    };
  },

  sendMessage: async (userId: string, conversationId: string, body: string): Promise<Message> => {
    const conversation = await conversationsRepository.findById(conversationId);
    if (!conversation) throw new NotFoundError('Conversation not found', 'CONVERSATION_NOT_FOUND');
    assertParty(conversation, userId);

    const [message] = await Promise.all([
      messagesRepository.create(conversationId, userId, body),
      conversationsRepository.touchUpdatedAt(conversationId),
    ]);
    return message;
  },

  /**
   * Fetches a page of messages and marks the caller's unread inbound
   * messages as read in the same call — matches how a real chat UI
   * actually behaves (opening/polling a thread you're a party to is
   * itself the read receipt), rather than requiring a separate
   * mark-as-read round trip the frontend would have to remember to fire.
   */
  getMessages: async (
    userId: string,
    conversationId: string,
    query: { page?: number; limit?: number }
  ): Promise<PaginatedResult<Message>> => {
    const conversation = await conversationsRepository.findById(conversationId);
    if (!conversation) throw new NotFoundError('Conversation not found', 'CONVERSATION_NOT_FOUND');
    assertParty(conversation, userId);

    const [{ messages, total }] = await Promise.all([
      messagesRepository.findManyByConversationId(conversationId, query),
      messagesRepository.markReadForRecipient(conversationId, userId),
    ]);

    return {
      items: messages,
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 30),
    };
  },
};
