import { storesController } from '../../src/modules/stores/stores.controller';
import { storesService } from '../../src/modules/stores/stores.service';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ConflictError } from '../../src/shared/errors/ConflictError';
import { UnauthorizedError } from '../../src/shared/errors/UnauthorizedError';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/stores/stores.service');

const authUser = { userId: 'user-1', role: 'USER' } as any;

const mockStore = {
  id: 'store-1',
  name: 'My Store',
  description: 'A store description with enough characters',
  city: 'غزة',
  phone: '0599111222',
} as any;

const validCreateBody = {
  name: 'My Store',
  description: 'A store description with enough characters',
  city: 'غزة',
  phone: '0599111222',
};

describe('storesController', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createStore', () => {
    it('returns 201 with the created store on success', async () => {
      const req = mockRequest({ body: validCreateBody, user: authUser } as any);
      const res = mockResponse();
      const next = mockNext();
      (storesService.createStore as jest.Mock).mockResolvedValue(mockStore);

      await storesController.createStore(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: mockStore })
      );
    });

    it('calls next(UnauthorizedError) when there is no authenticated user', async () => {
      const req = mockRequest({ body: validCreateBody });
      const res = mockResponse();
      const next = mockNext();

      await storesController.createStore(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
      expect(storesService.createStore).not.toHaveBeenCalled();
    });

    it('calls next(error) on validation failure (description too short)', async () => {
      const req = mockRequest({
        body: { ...validCreateBody, description: 'short' },
        user: authUser,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await storesController.createStore(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(storesService.createStore).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws ConflictError (store already exists)', async () => {
      const req = mockRequest({ body: validCreateBody, user: authUser } as any);
      const res = mockResponse();
      const next = mockNext();
      (storesService.createStore as jest.Mock).mockRejectedValue(
        new ConflictError('You already have a store.')
      );

      await storesController.createStore(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ConflictError));
    });
  });

  describe('getMyStore', () => {
    it('returns 200 with the store on success', async () => {
      const req = mockRequest({ user: authUser } as any);
      const res = mockResponse();
      const next = mockNext();
      (storesService.getMyStore as jest.Mock).mockResolvedValue(mockStore);

      await storesController.getMyStore(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: mockStore })
      );
    });

    it('calls next(UnauthorizedError) when there is no authenticated user', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();

      await storesController.getMyStore(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(NotFoundError) when the service throws', async () => {
      const req = mockRequest({ user: authUser } as any);
      const res = mockResponse();
      const next = mockNext();
      (storesService.getMyStore as jest.Mock).mockRejectedValue(new NotFoundError('Store not found'));

      await storesController.getMyStore(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('updateMyStore', () => {
    it('returns 200 with the updated store on success', async () => {
      const req = mockRequest({ body: { name: 'New Name' }, user: authUser } as any);
      const res = mockResponse();
      const next = mockNext();
      const updated = { ...mockStore, name: 'New Name' };
      (storesService.updateMyStore as jest.Mock).mockResolvedValue(updated);

      await storesController.updateMyStore(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: updated })
      );
    });

    it('calls next(error) on validation failure (name too short)', async () => {
      const req = mockRequest({ body: { name: 'a' }, user: authUser } as any);
      const res = mockResponse();
      const next = mockNext();

      await storesController.updateMyStore(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(storesService.updateMyStore).not.toHaveBeenCalled();
    });
  });

  describe('getPublicStore', () => {
    it('returns 200 with the store on success', async () => {
      const req = mockRequest({ params: { id: 'store-1' } });
      const res = mockResponse();
      const next = mockNext();
      (storesService.getPublicStore as jest.Mock).mockResolvedValue(mockStore);

      await storesController.getPublicStore(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: mockStore })
      );
    });

    it('calls next(error) when the id param is missing', async () => {
      const req = mockRequest({ params: { id: '' } });
      const res = mockResponse();
      const next = mockNext();

      await storesController.getPublicStore(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(storesService.getPublicStore).not.toHaveBeenCalled();
    });

    it('calls next(NotFoundError) when the service throws', async () => {
      const req = mockRequest({ params: { id: 'store-1' } });
      const res = mockResponse();
      const next = mockNext();
      (storesService.getPublicStore as jest.Mock).mockRejectedValue(
        new NotFoundError('Store not found')
      );

      await storesController.getPublicStore(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('getStores', () => {
    it('returns 200 with the store list and pagination meta on success', async () => {
      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();
      const stores = [mockStore];
      const meta = { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false };
      (storesService.getStores as jest.Mock).mockResolvedValue({ stores, meta });

      await storesController.getStores(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: stores, meta: { pagination: meta } })
      );
    });

    it('calls next(error) when the service throws', async () => {
      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();
      (storesService.getStores as jest.Mock).mockRejectedValue(new Error('DB error'));

      await storesController.getStores(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('updateStoreStatus', () => {
    it('returns 200 with the updated store on success', async () => {
      const req = mockRequest({ params: { id: 'store-1' }, body: { status: 'ACTIVE' } });
      const res = mockResponse();
      const next = mockNext();
      const updated = { ...mockStore, status: 'ACTIVE' };
      (storesService.updateStoreStatus as jest.Mock).mockResolvedValue(updated);

      await storesController.updateStoreStatus(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: updated })
      );
    });

    it('calls next(error) on validation failure (invalid status enum value)', async () => {
      const req = mockRequest({ params: { id: 'store-1' }, body: { status: 'NOT_A_STATUS' } });
      const res = mockResponse();
      const next = mockNext();

      await storesController.updateStoreStatus(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(storesService.updateStoreStatus).not.toHaveBeenCalled();
    });
  });

  describe('toggleFollow', () => {
    it('returns 200 with the follow result on success', async () => {
      const req = mockRequest({ params: { id: 'store-1' }, user: authUser } as any);
      const res = mockResponse();
      const next = mockNext();
      (storesService.toggleFollow as jest.Mock).mockResolvedValue({ action: 'followed' });

      await storesController.toggleFollow(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: { action: 'followed' } })
      );
    });

    it('calls next(UnauthorizedError) when there is no authenticated user', async () => {
      const req = mockRequest({ params: { id: 'store-1' } });
      const res = mockResponse();
      const next = mockNext();

      await storesController.toggleFollow(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
      expect(storesService.toggleFollow).not.toHaveBeenCalled();
    });
  });

  describe('getMyFollowedStores', () => {
    it('returns 200 with followed stores and pagination meta', async () => {
      const req = mockRequest({ query: {}, user: authUser } as any);
      const res = mockResponse();
      const next = mockNext();
      const items = [{ id: 'follow-1' }];
      const meta = { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false };
      (storesService.getMyFollowedStores as jest.Mock).mockResolvedValue({ items, meta });

      await storesController.getMyFollowedStores(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: items, meta: { pagination: meta } })
      );
    });

    it('calls next(UnauthorizedError) when there is no authenticated user', async () => {
      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();

      await storesController.getMyFollowedStores(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });

  describe('createReview', () => {
    const validReviewBody = { score: 5, comment: 'Great store' };

    it('returns 201 on success', async () => {
      const req = mockRequest({
        params: { id: 'store-1' },
        body: validReviewBody,
        user: authUser,
      } as any);
      const res = mockResponse();
      const next = mockNext();
      (storesService.createReview as jest.Mock).mockResolvedValue(undefined);

      await storesController.createReview(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('calls next(UnauthorizedError) when there is no authenticated user', async () => {
      const req = mockRequest({ params: { id: 'store-1' }, body: validReviewBody });
      const res = mockResponse();
      const next = mockNext();

      await storesController.createReview(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
      expect(storesService.createReview).not.toHaveBeenCalled();
    });

    it('calls next(error) on validation failure (score out of range)', async () => {
      const req = mockRequest({
        params: { id: 'store-1' },
        body: { score: 6 },
        user: authUser,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await storesController.createReview(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(storesService.createReview).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws ConflictError (already reviewed)', async () => {
      const req = mockRequest({
        params: { id: 'store-1' },
        body: validReviewBody,
        user: authUser,
      } as any);
      const res = mockResponse();
      const next = mockNext();
      (storesService.createReview as jest.Mock).mockRejectedValue(
        new ConflictError('You have already reviewed this store.')
      );

      await storesController.createReview(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ConflictError));
    });
  });

  describe('getStoreReviews', () => {
    it('returns 200 with reviews and pagination meta', async () => {
      const req = mockRequest({ params: { id: 'store-1' }, query: {} });
      const res = mockResponse();
      const next = mockNext();
      const items = [{ id: 'rev-1' }];
      const meta = { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false };
      (storesService.getStoreReviews as jest.Mock).mockResolvedValue({ items, meta });

      await storesController.getStoreReviews(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: items, meta: { pagination: meta } })
      );
    });

    it('calls next(error) when the service throws', async () => {
      const req = mockRequest({ params: { id: 'store-1' }, query: {} });
      const res = mockResponse();
      const next = mockNext();
      (storesService.getStoreReviews as jest.Mock).mockRejectedValue(new NotFoundError('Store not found'));

      await storesController.getStoreReviews(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });
});
