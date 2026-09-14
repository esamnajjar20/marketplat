import { conversationsService } from '../../src/modules/conversations/conversations.service';
import { conversationsRepository, messagesRepository } from '../../src/modules/conversations/conversations.repository';
import { adsRepository } from '../../src/modules/ads/ads.repository';
import { usersRepository } from '../../src/modules/users/users.repository';
import { serviceRequestsRepository } from '../../src/modules/service-requests/service-requests.repository';
import { notificationEvents } from '../../src/modules/notifications';
import { blockedUsersService } from '../../src/modules/blocked-users';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';

jest.mock('../../src/modules/conversations/conversations.repository');
jest.mock('../../src/modules/ads/ads.repository');
jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/modules/service-requests/service-requests.repository');
jest.mock('../../src/modules/notifications', () => ({
  notificationEvents: { onNewMessage: jest.fn() },
  notificationsService: { markConversationNotificationsRead: jest.fn().mockResolvedValue({ count: 0 }) },
}));
jest.mock('../../src/modules/blocked-users', () => ({
  blockedUsersService: { isBlockedEitherDirection: jest.fn() },
}));
jest.mock('../../src/shared/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../../src/modules/activity', () => ({
  activityService: { record: jest.fn() },
  activityTemplates: {
    messageSent: jest.fn().mockReturnValue({ type: 'MESSAGE_SENT' }),
  },
}));

const buyerId = 'buyer-1';
const sellerId = 'seller-1';
const adId = 'ad-1';

const mockAd = { id: adId, userId: sellerId, status: 'ACTIVE' } as any;

const mockConversation = {
  id: 'conv-1',
  adId,
  buyerId,
  sellerId,
  ad: { id: adId, title: 'Ad title', images: [], status: 'ACTIVE' },
  buyer: { id: buyerId, name: 'Buyer Name', avatarUrl: null },
  seller: { id: sellerId, name: 'Seller Name', avatarUrl: null },
} as any;


jest.mock('../../src/shared/utils/notificationStream', () => ({
  publishNotificationEvent: jest.fn().mockResolvedValue(undefined),
  publishNotificationEventToMany: jest.fn().mockResolvedValue(undefined),
}));

describe('conversationsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (notificationEvents.onNewMessage as jest.Mock).mockResolvedValue(undefined);
    (blockedUsersService.isBlockedEitherDirection as jest.Mock).mockResolvedValue(false);
  });

  describe('startFromAd', () => {
    it('throws NotFoundError when the ad does not exist', async () => {
      (adsRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(conversationsService.startFromAd(buyerId, adId)).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when the ad is DELETED', async () => {
      (adsRepository.findById as jest.Mock).mockResolvedValue({ ...mockAd, status: 'DELETED' });

      await expect(conversationsService.startFromAd(buyerId, adId)).rejects.toThrow(NotFoundError);
    });

    it('throws BadRequestError when the caller is the ad owner', async () => {
      (adsRepository.findById as jest.Mock).mockResolvedValue(mockAd);

      await expect(conversationsService.startFromAd(sellerId, adId)).rejects.toThrow(
        BadRequestError
      );
      expect(conversationsRepository.findOrCreate).not.toHaveBeenCalled();
    });

    it('delegates to findOrCreate for the (buyer, seller) pair with adId as context', async () => {
      (adsRepository.findById as jest.Mock).mockResolvedValue(mockAd);
      (conversationsRepository.findOrCreate as jest.Mock).mockResolvedValue(mockConversation);

      const result = await conversationsService.startFromAd(buyerId, adId);

      expect(conversationsRepository.findOrCreate).toHaveBeenCalledWith(buyerId, sellerId, {
        adId,
      });
      expect(result).toEqual(mockConversation);
    });

    // FEAT-CONV-DEDUP: the same seller's second (or third) ad must
    // resolve to the exact same conversation as the first — this is
    // the specific behavior findOrCreate's pair-based (not ad-based)
    // lookup exists to guarantee. Modeled here as the repository
    // returning the same row for two different adIds against the same
    // buyer/seller pair, since findOrCreate itself is unit-tested in
    // conversations.repository.test.ts.
    it('reuses the same conversation across multiple different ads from the same seller', async () => {
      const otherAdId = 'ad-2';
      (adsRepository.findById as jest.Mock)
        .mockResolvedValueOnce(mockAd)
        .mockResolvedValueOnce({ ...mockAd, id: otherAdId });
      (conversationsRepository.findOrCreate as jest.Mock).mockResolvedValue(mockConversation);

      const first = await conversationsService.startFromAd(buyerId, adId);
      const second = await conversationsService.startFromAd(buyerId, otherAdId);

      expect(first.id).toBe(mockConversation.id);
      expect(second.id).toBe(mockConversation.id);
      expect(conversationsRepository.findOrCreate).toHaveBeenNthCalledWith(1, buyerId, sellerId, {
        adId,
      });
      expect(conversationsRepository.findOrCreate).toHaveBeenNthCalledWith(2, buyerId, sellerId, {
        adId: otherAdId,
      });
    });

    it('throws ForbiddenError when either party has blocked the other', async () => {
      (adsRepository.findById as jest.Mock).mockResolvedValue(mockAd);
      (blockedUsersService.isBlockedEitherDirection as jest.Mock).mockResolvedValue(true);

      await expect(conversationsService.startFromAd(buyerId, adId)).rejects.toThrow(
        ForbiddenError
      );
      expect(blockedUsersService.isBlockedEitherDirection).toHaveBeenCalledWith(buyerId, sellerId);
      expect(conversationsRepository.findOrCreate).not.toHaveBeenCalled();
    });
  });

  describe('startFromUser', () => {
    const mockTarget = { id: sellerId, name: 'Seller Name', isActive: true } as any;
    const mockConversationNoAd = { ...mockConversation, adId: null, ad: null };

    it('throws NotFoundError when the target user does not exist', async () => {
      (usersRepository.findPublicById as jest.Mock).mockResolvedValue(null);

      await expect(conversationsService.startFromUser(buyerId, sellerId)).rejects.toThrow(
        NotFoundError
      );
    });

    it('throws NotFoundError when the target user is inactive', async () => {
      (usersRepository.findPublicById as jest.Mock).mockResolvedValue({
        ...mockTarget,
        isActive: false,
      });

      await expect(conversationsService.startFromUser(buyerId, sellerId)).rejects.toThrow(
        NotFoundError
      );
    });

    it('throws BadRequestError when the caller targets themselves', async () => {
      (usersRepository.findPublicById as jest.Mock).mockResolvedValue({
        ...mockTarget,
        id: buyerId,
      });

      await expect(conversationsService.startFromUser(buyerId, buyerId)).rejects.toThrow(
        BadRequestError
      );
      expect(conversationsRepository.findOrCreate).not.toHaveBeenCalled();
    });

    it('throws ForbiddenError when either party has blocked the other', async () => {
      (usersRepository.findPublicById as jest.Mock).mockResolvedValue(mockTarget);
      (blockedUsersService.isBlockedEitherDirection as jest.Mock).mockResolvedValue(true);

      await expect(conversationsService.startFromUser(buyerId, sellerId)).rejects.toThrow(
        ForbiddenError
      );
      expect(conversationsRepository.findOrCreate).not.toHaveBeenCalled();
    });

    it('delegates to findOrCreate for the (buyer, seller) pair with no context', async () => {
      (usersRepository.findPublicById as jest.Mock).mockResolvedValue(mockTarget);
      (conversationsRepository.findOrCreate as jest.Mock).mockResolvedValue(mockConversationNoAd);

      const result = await conversationsService.startFromUser(buyerId, sellerId);

      expect(conversationsRepository.findOrCreate).toHaveBeenCalledWith(buyerId, sellerId);
      expect(result).toEqual(mockConversationNoAd);
    });
  });

  describe('startFromServiceRequest', () => {
    const requestId = 'req-1';
    const mockRequest = {
      id: requestId,
      customerId: buyerId,
      listing: { provider: { sellerProfile: { userId: sellerId } } },
    } as any;

    it('throws NotFoundError when the service request does not exist', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        conversationsService.startFromServiceRequest(buyerId, requestId)
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ForbiddenError when the caller is neither the customer nor the provider', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(mockRequest);

      await expect(
        conversationsService.startFromServiceRequest('stranger-1', requestId)
      ).rejects.toThrow(ForbiddenError);
      expect(conversationsRepository.findOrCreate).not.toHaveBeenCalled();
    });

    it('throws ForbiddenError when either party has blocked the other', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(mockRequest);
      (blockedUsersService.isBlockedEitherDirection as jest.Mock).mockResolvedValue(true);

      await expect(
        conversationsService.startFromServiceRequest(buyerId, requestId)
      ).rejects.toThrow(ForbiddenError);
      expect(conversationsRepository.findOrCreate).not.toHaveBeenCalled();
    });

    it('delegates to findOrCreate for the (customer, provider) pair with serviceRequestId as context', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(mockRequest);
      (conversationsRepository.findOrCreate as jest.Mock).mockResolvedValue(mockConversation);

      const result = await conversationsService.startFromServiceRequest(buyerId, requestId);

      expect(conversationsRepository.findOrCreate).toHaveBeenCalledWith(buyerId, sellerId, {
        serviceRequestId: requestId,
      });
      expect(result).toEqual(mockConversation);
    });

    // Scenario 5 from the design: if this customer/provider pair already
    // has a thread (started via an ad, a direct profile message, or a
    // different request), starting from a new service request between
    // the same two people must resolve to that same conversation, not a
    // second one. findOrCreate's pair-based lookup is what guarantees
    // this — this test locks in that startFromServiceRequest actually
    // goes through it rather than any request-specific shortcut.
    it('reuses an existing conversation for the pair when one already exists', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(mockRequest);
      (conversationsRepository.findOrCreate as jest.Mock).mockResolvedValue(mockConversation);

      const result = await conversationsService.startFromServiceRequest(buyerId, requestId);

      expect(result.id).toBe(mockConversation.id);
    });

    it('either party (customer or provider) resolves to the same call shape', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(mockRequest);
      (conversationsRepository.findOrCreate as jest.Mock).mockResolvedValue(mockConversation);

      await conversationsService.startFromServiceRequest(sellerId, requestId);

      expect(conversationsRepository.findOrCreate).toHaveBeenCalledWith(buyerId, sellerId, {
        serviceRequestId: requestId,
      });
    });
  });

  describe('getConversationById', () => {
    it('throws NotFoundError when the conversation does not exist', async () => {
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(conversationsService.getConversationById(buyerId, 'conv-1')).rejects.toThrow(
        NotFoundError
      );
    });

    it('throws ForbiddenError when the caller is neither buyer nor seller', async () => {
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(mockConversation);

      await expect(
        conversationsService.getConversationById('stranger-1', 'conv-1')
      ).rejects.toThrow(ForbiddenError);
    });

    it('returns the conversation when the caller is the buyer', async () => {
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(mockConversation);

      const result = await conversationsService.getConversationById(buyerId, 'conv-1');

      expect(result).toEqual(mockConversation);
    });

    it('returns the conversation when the caller is the seller', async () => {
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(mockConversation);

      const result = await conversationsService.getConversationById(sellerId, 'conv-1');

      expect(result).toEqual(mockConversation);
    });
  });

  describe('getMyConversations', () => {
    // FIX UX-15: separate from the shared mockConversation above —
    // only findManyForUser's result shape (ConversationListItem) has
    // unreadCount; other mockConversation consumers in this file use
    // the plain ConversationWithRelations shape and shouldn't need to
    // know about it.
    const mockConversationListItem = { ...mockConversation, unreadCount: 2 };

    it('returns paginated conversations (including unreadCount) with defaulted page/limit meta', async () => {
      (conversationsRepository.findManyForUser as jest.Mock).mockResolvedValue({
        conversations: [mockConversationListItem],
        total: 1,
      });

      const result = await conversationsService.getMyConversations(buyerId, {});

      expect(result.items).toEqual([mockConversationListItem]);
      expect(result.items[0].unreadCount).toBe(2);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
      expect(result.meta.total).toBe(1);
    });

    it('passes explicit page/limit through to the repository and meta', async () => {
      (conversationsRepository.findManyForUser as jest.Mock).mockResolvedValue({
        conversations: [],
        total: 0,
      });

      const result = await conversationsService.getMyConversations(buyerId, { page: 2, limit: 5 });

      expect(conversationsRepository.findManyForUser).toHaveBeenCalledWith(buyerId, {
        page: 2,
        limit: 5,
      });
      expect(result.meta.page).toBe(2);
      expect(result.meta.limit).toBe(5);
    });
  });

  describe('sendMessage', () => {
    const mockMessage = {
      id: 'msg-1',
      conversationId: 'conv-1',
      senderId: buyerId,
      body: 'Hi',
      readAt: null,
      deletedAt: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    } as any;

    it('throws NotFoundError when the conversation does not exist', async () => {
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(conversationsService.sendMessage(buyerId, 'conv-1', { body: 'Hi' })).rejects.toThrow(
        NotFoundError
      );
    });

    it('throws ForbiddenError when the caller is not a party to the conversation', async () => {
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(mockConversation);

      await expect(
        conversationsService.sendMessage('stranger-1', 'conv-1', { body: 'Hi' })
      ).rejects.toThrow(ForbiddenError);
      expect(messagesRepository.create).not.toHaveBeenCalled();
    });

    it('rejects known scam phrasing with BadRequestError', async () => {
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(mockConversation);

      await expect(
        conversationsService.sendMessage(buyerId, 'conv-1', { body: 'Please use Western Union only' })
      ).rejects.toThrow(BadRequestError);
      expect(messagesRepository.create).not.toHaveBeenCalled();
    });

    it('creates the message and bumps the conversation updatedAt', async () => {
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(mockConversation);
      (messagesRepository.create as jest.Mock).mockResolvedValue(mockMessage);
      (conversationsRepository.touchUpdatedAt as jest.Mock).mockResolvedValue(mockConversation);

      const result = await conversationsService.sendMessage(buyerId, 'conv-1', { body: 'Hi' });

      expect(messagesRepository.create).toHaveBeenCalledWith('conv-1', buyerId, 'Hi');
      expect(conversationsRepository.touchUpdatedAt).toHaveBeenCalledWith('conv-1');
      expect(result).toEqual(mockMessage);

      const { publishNotificationEvent } = require('../../src/shared/utils/notificationStream');
      expect(publishNotificationEvent).toHaveBeenCalledWith(
        sellerId,
        expect.objectContaining({ type: 'message:new', conversationId: 'conv-1' }),
      );
      expect(publishNotificationEvent).toHaveBeenCalledWith(
        buyerId,
        expect.objectContaining({ type: 'message:new', conversationId: 'conv-1' }),
      );
    });

    it('notifies the seller (not the sender) when the buyer sends a message', async () => {
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(mockConversation);
      (messagesRepository.create as jest.Mock).mockResolvedValue(mockMessage);
      (conversationsRepository.touchUpdatedAt as jest.Mock).mockResolvedValue(mockConversation);

      await conversationsService.sendMessage(buyerId, 'conv-1', { body: 'Hi' });

      expect(notificationEvents.onNewMessage).toHaveBeenCalledWith(
        sellerId,
        'conv-1',
        mockConversation.buyer.name
      );
    });

    it('notifies the buyer (not the sender) when the seller sends a message', async () => {
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(mockConversation);
      (messagesRepository.create as jest.Mock).mockResolvedValue(mockMessage);
      (conversationsRepository.touchUpdatedAt as jest.Mock).mockResolvedValue(mockConversation);

      await conversationsService.sendMessage(sellerId, 'conv-1', { body: 'Hi' });

      expect(notificationEvents.onNewMessage).toHaveBeenCalledWith(
        buyerId,
        'conv-1',
        mockConversation.seller.name
      );
    });

    it('still returns the created message when the notification write fails', async () => {
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(mockConversation);
      (messagesRepository.create as jest.Mock).mockResolvedValue(mockMessage);
      (conversationsRepository.touchUpdatedAt as jest.Mock).mockResolvedValue(mockConversation);
      (notificationEvents.onNewMessage as jest.Mock).mockRejectedValue(new Error('db down'));

      const result = await conversationsService.sendMessage(buyerId, 'conv-1', { body: 'Hi' });

      expect(result).toEqual(mockMessage);
    });

    it('throws ForbiddenError when either party has blocked the other, even in an existing thread', async () => {
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(mockConversation);
      (blockedUsersService.isBlockedEitherDirection as jest.Mock).mockResolvedValue(true);

      await expect(conversationsService.sendMessage(buyerId, 'conv-1', { body: 'Hi' })).rejects.toThrow(
        ForbiddenError
      );
      expect(blockedUsersService.isBlockedEitherDirection).toHaveBeenCalledWith(buyerId, sellerId);
      expect(messagesRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('getMessages', () => {
    const mockMessages = [{ id: 'msg-1' }, { id: 'msg-2' }];

    it('throws NotFoundError when the conversation does not exist', async () => {
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(conversationsService.getMessages(buyerId, 'conv-1', {})).rejects.toThrow(
        NotFoundError
      );
    });

    it('throws ForbiddenError when the caller is not a party to the conversation', async () => {
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(mockConversation);

      await expect(
        conversationsService.getMessages('stranger-1', 'conv-1', {})
      ).rejects.toThrow(ForbiddenError);
      expect(messagesRepository.findManyByConversationId).not.toHaveBeenCalled();
    });

    it('returns paginated messages with defaulted page/limit=30 meta', async () => {
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(mockConversation);
      (messagesRepository.findManyByConversationId as jest.Mock).mockResolvedValue({
        messages: mockMessages,
        total: 2,
      });
      (messagesRepository.markReadForRecipient as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await conversationsService.getMessages(buyerId, 'conv-1', {});

      expect(result.items).toEqual(mockMessages);
      expect(result.meta.limit).toBe(30);
      expect(result.meta.total).toBe(2);
    });

    it('marks the caller’s unread inbound messages as read as a side effect', async () => {
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(mockConversation);
      (messagesRepository.findManyByConversationId as jest.Mock).mockResolvedValue({
        messages: [],
        total: 0,
      });
      (messagesRepository.markReadForRecipient as jest.Mock).mockResolvedValue({ count: 0 });

      await conversationsService.getMessages(buyerId, 'conv-1', {});

      expect(messagesRepository.markReadForRecipient).toHaveBeenCalledWith('conv-1', buyerId);
    });

    it('strips body from soft-deleted messages but leaves the other fields intact', async () => {
      const liveMessage = { id: 'msg-1', body: 'still here', deletedAt: null };
      const deletedMessage = { id: 'msg-2', body: 'secret text', deletedAt: new Date('2026-08-01') };
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(mockConversation);
      (messagesRepository.findManyByConversationId as jest.Mock).mockResolvedValue({
        messages: [liveMessage, deletedMessage],
        total: 2,
      });
      (messagesRepository.markReadForRecipient as jest.Mock).mockResolvedValue({ count: 0 });

      const result = await conversationsService.getMessages(buyerId, 'conv-1', {});

      expect(result.items[0]).toEqual(liveMessage);
      expect(result.items[1]).toEqual({ ...deletedMessage, body: '' });
    });
  });

  describe('deleteMessage', () => {
    const mockMessage = {
      id: 'msg-1',
      conversationId: 'conv-1',
      senderId: buyerId,
      body: 'Hi',
      deletedAt: null,
    } as any;

    it('throws NotFoundError when the conversation does not exist', async () => {
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        conversationsService.deleteMessage(buyerId, 'conv-1', 'msg-1')
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ForbiddenError when the caller is not a party to the conversation', async () => {
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(mockConversation);

      await expect(
        conversationsService.deleteMessage('stranger-1', 'conv-1', 'msg-1')
      ).rejects.toThrow(ForbiddenError);
      expect(messagesRepository.findById).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the message does not exist', async () => {
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(mockConversation);
      (messagesRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        conversationsService.deleteMessage(buyerId, 'conv-1', 'msg-1')
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when the message belongs to a different conversation', async () => {
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(mockConversation);
      (messagesRepository.findById as jest.Mock).mockResolvedValue({
        ...mockMessage,
        conversationId: 'other-conv',
      });

      await expect(
        conversationsService.deleteMessage(buyerId, 'conv-1', 'msg-1')
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ForbiddenError when the caller is a party but not the sender', async () => {
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(mockConversation);
      (messagesRepository.findById as jest.Mock).mockResolvedValue(mockMessage); // sender is buyerId

      await expect(
        conversationsService.deleteMessage(sellerId, 'conv-1', 'msg-1')
      ).rejects.toThrow(ForbiddenError);
      expect(messagesRepository.softDelete).not.toHaveBeenCalled();
    });

    it('soft-deletes the message and returns it with body redacted', async () => {
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(mockConversation);
      (messagesRepository.findById as jest.Mock).mockResolvedValue(mockMessage);
      (messagesRepository.softDelete as jest.Mock).mockResolvedValue({
        ...mockMessage,
        deletedAt: new Date('2026-08-13'),
      });

      const result = await conversationsService.deleteMessage(buyerId, 'conv-1', 'msg-1');

      expect(messagesRepository.softDelete).toHaveBeenCalledWith('msg-1');
      expect(result.body).toBe('');
      expect(result.deletedAt).toBeTruthy();
    });

    it('is idempotent — calling delete on an already-deleted message does not call softDelete again', async () => {
      const alreadyDeleted = { ...mockMessage, deletedAt: new Date('2026-08-01'), body: 'old text' };
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(mockConversation);
      (messagesRepository.findById as jest.Mock).mockResolvedValue(alreadyDeleted);

      const result = await conversationsService.deleteMessage(buyerId, 'conv-1', 'msg-1');

      expect(messagesRepository.softDelete).not.toHaveBeenCalled();
      expect(result.body).toBe('');
    });
  });
});
