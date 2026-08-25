import { conversationsService } from '../../src/modules/conversations/conversations.service';
import { conversationsRepository, messagesRepository } from '../../src/modules/conversations/conversations.repository';
import { adsRepository } from '../../src/modules/ads/ads.repository';
import { usersRepository } from '../../src/modules/users/users.repository';
import { notificationEvents } from '../../src/modules/notifications';
import { blockedUsersService } from '../../src/modules/blocked-users';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';

jest.mock('../../src/modules/conversations/conversations.repository');
jest.mock('../../src/modules/ads/ads.repository');
jest.mock('../../src/modules/users/users.repository');
jest.mock('../../src/modules/notifications', () => ({
  notificationEvents: { onNewMessage: jest.fn() },
}));
jest.mock('../../src/modules/blocked-users', () => ({
  blockedUsersService: { isBlockedEitherDirection: jest.fn() },
}));
jest.mock('../../src/shared/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
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
      expect(conversationsRepository.findExisting).not.toHaveBeenCalled();
    });

    it('reuses an existing conversation for the same (ad, buyer, seller) triple', async () => {
      (adsRepository.findById as jest.Mock).mockResolvedValue(mockAd);
      (conversationsRepository.findExisting as jest.Mock).mockResolvedValue(mockConversation);

      const result = await conversationsService.startFromAd(buyerId, adId);

      expect(result).toEqual(mockConversation);
      expect(conversationsRepository.create).not.toHaveBeenCalled();
    });

    it('creates a new conversation when none exists yet', async () => {
      (adsRepository.findById as jest.Mock).mockResolvedValue(mockAd);
      (conversationsRepository.findExisting as jest.Mock).mockResolvedValue(null);
      (conversationsRepository.create as jest.Mock).mockResolvedValue(mockConversation);

      const result = await conversationsService.startFromAd(buyerId, adId);

      expect(conversationsRepository.create).toHaveBeenCalledWith(buyerId, sellerId, { adId });
      expect(result).toEqual(mockConversation);
    });

    it('throws ForbiddenError when either party has blocked the other', async () => {
      (adsRepository.findById as jest.Mock).mockResolvedValue(mockAd);
      (blockedUsersService.isBlockedEitherDirection as jest.Mock).mockResolvedValue(true);

      await expect(conversationsService.startFromAd(buyerId, adId)).rejects.toThrow(
        ForbiddenError
      );
      expect(blockedUsersService.isBlockedEitherDirection).toHaveBeenCalledWith(buyerId, sellerId);
      expect(conversationsRepository.findExisting).not.toHaveBeenCalled();
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
      expect(conversationsRepository.findExistingWithoutAd).not.toHaveBeenCalled();
    });

    it('throws ForbiddenError when either party has blocked the other', async () => {
      (usersRepository.findPublicById as jest.Mock).mockResolvedValue(mockTarget);
      (blockedUsersService.isBlockedEitherDirection as jest.Mock).mockResolvedValue(true);

      await expect(conversationsService.startFromUser(buyerId, sellerId)).rejects.toThrow(
        ForbiddenError
      );
      expect(conversationsRepository.findExistingWithoutAd).not.toHaveBeenCalled();
    });

    it('reuses an existing no-ad conversation for the same (buyer, seller) pair', async () => {
      (usersRepository.findPublicById as jest.Mock).mockResolvedValue(mockTarget);
      (conversationsRepository.findExistingWithoutAd as jest.Mock).mockResolvedValue(
        mockConversationNoAd
      );

      const result = await conversationsService.startFromUser(buyerId, sellerId);

      expect(result).toEqual(mockConversationNoAd);
      expect(conversationsRepository.create).not.toHaveBeenCalled();
    });

    it('creates a new no-ad conversation when none exists yet', async () => {
      (usersRepository.findPublicById as jest.Mock).mockResolvedValue(mockTarget);
      (conversationsRepository.findExistingWithoutAd as jest.Mock).mockResolvedValue(null);
      (conversationsRepository.create as jest.Mock).mockResolvedValue(mockConversationNoAd);

      const result = await conversationsService.startFromUser(buyerId, sellerId);

      expect(conversationsRepository.create).toHaveBeenCalledWith(buyerId, sellerId);
      expect(result).toEqual(mockConversationNoAd);
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
    const mockMessage = { id: 'msg-1', conversationId: 'conv-1', senderId: buyerId, body: 'Hi' } as any;

    it('throws NotFoundError when the conversation does not exist', async () => {
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(conversationsService.sendMessage(buyerId, 'conv-1', 'Hi')).rejects.toThrow(
        NotFoundError
      );
    });

    it('throws ForbiddenError when the caller is not a party to the conversation', async () => {
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(mockConversation);

      await expect(
        conversationsService.sendMessage('stranger-1', 'conv-1', 'Hi')
      ).rejects.toThrow(ForbiddenError);
      expect(messagesRepository.create).not.toHaveBeenCalled();
    });

    it('creates the message and bumps the conversation updatedAt', async () => {
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(mockConversation);
      (messagesRepository.create as jest.Mock).mockResolvedValue(mockMessage);
      (conversationsRepository.touchUpdatedAt as jest.Mock).mockResolvedValue(mockConversation);

      const result = await conversationsService.sendMessage(buyerId, 'conv-1', 'Hi');

      expect(messagesRepository.create).toHaveBeenCalledWith('conv-1', buyerId, 'Hi');
      expect(conversationsRepository.touchUpdatedAt).toHaveBeenCalledWith('conv-1');
      expect(result).toEqual(mockMessage);
    });

    it('notifies the seller (not the sender) when the buyer sends a message', async () => {
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(mockConversation);
      (messagesRepository.create as jest.Mock).mockResolvedValue(mockMessage);
      (conversationsRepository.touchUpdatedAt as jest.Mock).mockResolvedValue(mockConversation);

      await conversationsService.sendMessage(buyerId, 'conv-1', 'Hi');

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

      await conversationsService.sendMessage(sellerId, 'conv-1', 'Hi');

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

      const result = await conversationsService.sendMessage(buyerId, 'conv-1', 'Hi');

      expect(result).toEqual(mockMessage);
    });

    it('throws ForbiddenError when either party has blocked the other, even in an existing thread', async () => {
      (conversationsRepository.findById as jest.Mock).mockResolvedValue(mockConversation);
      (blockedUsersService.isBlockedEitherDirection as jest.Mock).mockResolvedValue(true);

      await expect(conversationsService.sendMessage(buyerId, 'conv-1', 'Hi')).rejects.toThrow(
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
