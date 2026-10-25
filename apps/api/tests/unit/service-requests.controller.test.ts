import { serviceRequestsController } from '../../src/modules/service-requests/service-requests.controller';
import { serviceRequestsService } from '../../src/modules/service-requests/service-requests.service';
import { requireUser } from '../../src/shared/utils/requireUser';
import { UnauthorizedError } from '../../src/shared/errors/UnauthorizedError';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { ConflictError } from '../../src/shared/errors/ConflictError';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/service-requests/service-requests.service');
jest.mock('../../src/shared/utils/requireUser');

const mockServiceRequest = { id: 'request-1', status: 'PENDING' } as any;

const validCreateBody = {
  listingId: 'listing-1',
  details: 'Please fix my sink pipe as soon as possible',
};

describe('serviceRequestsController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireUser as jest.Mock).mockReturnValue({ userId: 'user-1' });
  });

  describe('createRequest', () => {
    it('returns 201 with the created request on success', async () => {
      const req = mockRequest({ body: validCreateBody });
      const res = mockResponse();
      const next = mockNext();
      (serviceRequestsService.createRequest as jest.Mock).mockResolvedValue(mockServiceRequest);

      await serviceRequestsController.createRequest(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: mockServiceRequest })
      );
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest({ body: validCreateBody });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await serviceRequestsController.createRequest(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(error) on validation failure without invoking the service', async () => {
      const req = mockRequest({ body: { listingId: 'listing-1', details: 'short' } });
      const res = mockResponse();
      const next = mockNext();

      await serviceRequestsController.createRequest(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(serviceRequestsService.createRequest).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws BadRequestError', async () => {
      const req = mockRequest({ body: validCreateBody });
      const res = mockResponse();
      const next = mockNext();
      (serviceRequestsService.createRequest as jest.Mock).mockRejectedValue(
        new ForbiddenError('You cannot request your own service listing.')
      );

      await serviceRequestsController.createRequest(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });
  });

  describe('getRequestById', () => {
    it('returns 200 with the request on success', async () => {
      const req = mockRequest({ params: { id: 'request-1' } });
      const res = mockResponse();
      const next = mockNext();
      (serviceRequestsService.getRequestById as jest.Mock).mockResolvedValue(mockServiceRequest);

      await serviceRequestsController.getRequestById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: mockServiceRequest })
      );
    });

    it('calls next(error) when the id param is missing', async () => {
      const req = mockRequest({ params: { id: '' } });
      const res = mockResponse();
      const next = mockNext();

      await serviceRequestsController.getRequestById(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(serviceRequestsService.getRequestById).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest({ params: { id: 'missing' } });
      const res = mockResponse();
      const next = mockNext();
      (serviceRequestsService.getRequestById as jest.Mock).mockRejectedValue(
        new NotFoundError('Service request not found')
      );

      await serviceRequestsController.getRequestById(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });

    it('calls next(error) when the service throws ForbiddenError (IDOR)', async () => {
      const req = mockRequest({ params: { id: 'request-1' } });
      const res = mockResponse();
      const next = mockNext();
      (serviceRequestsService.getRequestById as jest.Mock).mockRejectedValue(
        new ForbiddenError('You do not have permission to view this request.')
      );

      await serviceRequestsController.getRequestById(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });
  });

  describe('getMyRequestsAsCustomer', () => {
    it('returns 200 with items and pagination meta on success', async () => {
      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();
      const items = [mockServiceRequest];
      const meta = { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false };
      (serviceRequestsService.getMyRequestsAsCustomer as jest.Mock).mockResolvedValue({ items, meta });

      await serviceRequestsController.getMyRequestsAsCustomer(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: items, meta: { pagination: meta } })
      );
    });

    it('calls next(error) when the status query param is invalid', async () => {
      const req = mockRequest({ query: { status: 'BOGUS' } });
      const res = mockResponse();
      const next = mockNext();

      await serviceRequestsController.getMyRequestsAsCustomer(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(serviceRequestsService.getMyRequestsAsCustomer).not.toHaveBeenCalled();
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await serviceRequestsController.getMyRequestsAsCustomer(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });

  describe('getMyRequestsAsProvider', () => {
    it('returns 200 with items and pagination meta on success', async () => {
      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();
      const items = [mockServiceRequest];
      const meta = { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false };
      (serviceRequestsService.getMyRequestsAsProvider as jest.Mock).mockResolvedValue({ items, meta });

      await serviceRequestsController.getMyRequestsAsProvider(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: items, meta: { pagination: meta } })
      );
    });

    it('calls next(error) when the service throws NotFoundError (no seller profile)', async () => {
      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();
      (serviceRequestsService.getMyRequestsAsProvider as jest.Mock).mockRejectedValue(
        new NotFoundError('Seller profile not found')
      );

      await serviceRequestsController.getMyRequestsAsProvider(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('respondToRequest', () => {
    it('returns 200 with the updated request on success', async () => {
      const req = mockRequest({ params: { id: 'request-1' }, body: { action: 'ACCEPTED' } });
      const res = mockResponse();
      const next = mockNext();
      const updated = { ...mockServiceRequest, status: 'ACCEPTED' };
      (serviceRequestsService.respondToRequest as jest.Mock).mockResolvedValue(updated);

      await serviceRequestsController.respondToRequest(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: updated }));
      expect(serviceRequestsService.respondToRequest).toHaveBeenCalledWith(
        'user-1',
        'request-1',
        'ACCEPTED',
        { quotedPrice: undefined, agreedPrice: undefined }
      );
    });

    it('forwards quotedPrice/agreedPrice from the body to the service', async () => {
      const req = mockRequest({
        params: { id: 'request-1' },
        body: { action: 'ACCEPTED', quotedPrice: 120.5 },
      });
      const res = mockResponse();
      const next = mockNext();
      (serviceRequestsService.respondToRequest as jest.Mock).mockResolvedValue(mockServiceRequest);

      await serviceRequestsController.respondToRequest(req, res, next);

      expect(serviceRequestsService.respondToRequest).toHaveBeenCalledWith(
        'user-1',
        'request-1',
        'ACCEPTED',
        { quotedPrice: 120.5, agreedPrice: undefined }
      );
    });

    it('calls next(error) on an invalid action enum value', async () => {
      const req = mockRequest({ params: { id: 'request-1' }, body: { action: 'BOGUS' } });
      const res = mockResponse();
      const next = mockNext();

      await serviceRequestsController.respondToRequest(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(serviceRequestsService.respondToRequest).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws ConflictError', async () => {
      const req = mockRequest({ params: { id: 'request-1' }, body: { action: 'ACCEPTED' } });
      const res = mockResponse();
      const next = mockNext();
      (serviceRequestsService.respondToRequest as jest.Mock).mockRejectedValue(
        new ConflictError('Cannot transition from COMPLETED to ACCEPTED')
      );

      await serviceRequestsController.respondToRequest(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ConflictError));
    });

    it('calls next(error) when the service throws ForbiddenError (wrong actor)', async () => {
      const req = mockRequest({ params: { id: 'request-1' }, body: { action: 'CANCELLED' } });
      const res = mockResponse();
      const next = mockNext();
      (serviceRequestsService.respondToRequest as jest.Mock).mockRejectedValue(
        new ForbiddenError('Only the customer can perform this action.')
      );

      await serviceRequestsController.respondToRequest(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });
  });
});
