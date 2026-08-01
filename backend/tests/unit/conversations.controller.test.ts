import { conversationsController } from '../../src/modules/conversations/conversations.controller';
import { conversationsService } from '../../src/modules/conversations/conversations.service';
import { requireUser } from '../../src/shared/utils/requireUser';
import { UnauthorizedError } from '../../src/shared/errors/UnauthorizedError';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/conversations/conversations.service');
jest.mock('../../src/shared/utils/requireUser');

const mockConversation = { id: 'conv-1', adId: 'ad-1', buyerId: 'buyer-1', sellerId: 'seller-1' } as any;
const mockMessage = { id: 'msg-1', conversationId: 'conv-1', senderId: 'buyer-1', body: 'Hi' } as any;

describe('conversationsController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireUser as jest.Mock).mockReturnValue({ userId: 'buyer-1' });
  });

  describe('startConversation', () => {
    it('returns 201 with the conversation on success', async () => {
      const req = mockRequest({ body: { adId: 'ad-1' } });
      const res = mockResponse();
      const next = mockNext();
      (conversationsService.startFromAd as jest.Mock).mockResolvedValue(mockConversation);

      await conversationsController.startConversation(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: mockConversation })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('calls next(error) when the caller is unauthenticated', async () => {
      const req = mockRequest({ body: { adId: 'ad-1' } });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError('Authentication required');
      });

      await conversationsController.startConversation(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
      expect(res.status).not.toHaveBeenCalled();
    });

    it('calls next(error) when adId is missing from the body', async () => {
      const req = mockRequest({ body: {} });
      const res = mockResponse();
      const next = mockNext();

      await conversationsController.startConversation(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(conversationsService.startFromAd).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws', async () => {
      const req = mockRequest({ body: { adId: 'ad-1' } });
      const res = mockResponse();
      const next = mockNext();
      (conversationsService.startFromAd as jest.Mock).mockRejectedValue(
        new NotFoundError('Ad not found')
      );

      await conversationsController.startConversation(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('getMyConversations', () => {
    it('returns 200 with items and pagination meta on success', async () => {
      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();
      (conversationsService.getMyConversations as jest.Mock).mockResolvedValue({
        items: [mockConversation],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false },
      });

      await conversationsController.getMyConversations(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: [mockConversation],
          meta: expect.objectContaining({ pagination: expect.objectContaining({ total: 1 }) }),
        })
      );
    });

    it('calls next(error) when the caller is unauthenticated', async () => {
      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await conversationsController.getMyConversations(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(error) when query params fail validation', async () => {
      const req = mockRequest({ query: { page: '0' } });
      const res = mockResponse();
      const next = mockNext();

      await conversationsController.getMyConversations(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(conversationsService.getMyConversations).not.toHaveBeenCalled();
    });
  });

  describe('getConversationById', () => {
    it('returns 200 with the conversation on success', async () => {
      const req = mockRequest({ params: { id: 'conv-1' } });
      const res = mockResponse();
      const next = mockNext();
      (conversationsService.getConversationById as jest.Mock).mockResolvedValue(mockConversation);

      await conversationsController.getConversationById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: mockConversation })
      );
    });

    it('calls next(error) when the service throws ForbiddenError', async () => {
      const req = mockRequest({ params: { id: 'conv-1' } });
      const res = mockResponse();
      const next = mockNext();
      (conversationsService.getConversationById as jest.Mock).mockRejectedValue(
        new ForbiddenError('You are not a party to this conversation.')
      );

      await conversationsController.getConversationById(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('calls next(error) when the id param is missing', async () => {
      const req = mockRequest({ params: {} });
      const res = mockResponse();
      const next = mockNext();

      await conversationsController.getConversationById(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(conversationsService.getConversationById).not.toHaveBeenCalled();
    });
  });

  describe('getMessages', () => {
    it('returns 200 with items and pagination meta on success', async () => {
      const req = mockRequest({ params: { id: 'conv-1' }, query: {} });
      const res = mockResponse();
      const next = mockNext();
      (conversationsService.getMessages as jest.Mock).mockResolvedValue({
        items: [mockMessage],
        meta: { total: 1, page: 1, limit: 30, totalPages: 1, hasNextPage: false, hasPrevPage: false },
      });

      await conversationsController.getMessages(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: [mockMessage] })
      );
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest({ params: { id: 'conv-1' }, query: {} });
      const res = mockResponse();
      const next = mockNext();
      (conversationsService.getMessages as jest.Mock).mockRejectedValue(
        new NotFoundError('Conversation not found')
      );

      await conversationsController.getMessages(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('sendMessage', () => {
    it('returns 201 with the sent message on success', async () => {
      const req = mockRequest({ params: { id: 'conv-1' }, body: { body: 'Hi' } });
      const res = mockResponse();
      const next = mockNext();
      (conversationsService.sendMessage as jest.Mock).mockResolvedValue(mockMessage);

      await conversationsController.sendMessage(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(conversationsService.sendMessage).toHaveBeenCalledWith('buyer-1', 'conv-1', 'Hi');
    });

    it('calls next(error) when the message body is empty', async () => {
      const req = mockRequest({ params: { id: 'conv-1' }, body: { body: '' } });
      const res = mockResponse();
      const next = mockNext();

      await conversationsController.sendMessage(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(conversationsService.sendMessage).not.toHaveBeenCalled();
    });

    it('calls next(error) when the message body exceeds 2000 characters', async () => {
      const req = mockRequest({ params: { id: 'conv-1' }, body: { body: 'x'.repeat(2001) } });
      const res = mockResponse();
      const next = mockNext();

      await conversationsController.sendMessage(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(conversationsService.sendMessage).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws', async () => {
      const req = mockRequest({ params: { id: 'conv-1' }, body: { body: 'Hi' } });
      const res = mockResponse();
      const next = mockNext();
      (conversationsService.sendMessage as jest.Mock).mockRejectedValue(
        new ForbiddenError('You are not a party to this conversation.')
      );

      await conversationsController.sendMessage(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });
  });
});
