import { serviceListingsController } from '../../src/modules/service-listings/service-listings.controller';
import { serviceListingsService } from '../../src/modules/service-listings/service-listings.service';
import { requireUser } from '../../src/shared/utils/requireUser';
import { UnauthorizedError } from '../../src/shared/errors/UnauthorizedError';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/service-listings/service-listings.service');
jest.mock('../../src/shared/utils/requireUser');

const mockListing = { id: 'listing-1', title: 'Home cleaning', status: 'ACTIVE' } as any;

describe('serviceListingsController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireUser as jest.Mock).mockReturnValue({ userId: 'user-1' });
  });

  describe('createServiceListing', () => {
    const validBody = {
      categoryId: 'cat-1',
      title: 'Home cleaning',
      description: 'Deep cleaning service for homes',
    };

    it('returns 201 with the created listing, passing req.files through', async () => {
      const files = [{ buffer: Buffer.from('x') }];
      const req = mockRequest({ body: validBody, files } as any);
      const res = mockResponse();
      const next = mockNext();
      (serviceListingsService.createServiceListing as jest.Mock).mockResolvedValue(mockListing);

      await serviceListingsController.createServiceListing(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(serviceListingsService.createServiceListing).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ title: 'Home cleaning' }),
        files
      );
    });

    it('defaults files to an empty array when req.files is undefined', async () => {
      const req = mockRequest({ body: validBody });
      const res = mockResponse();
      const next = mockNext();
      (serviceListingsService.createServiceListing as jest.Mock).mockResolvedValue(mockListing);

      await serviceListingsController.createServiceListing(req, res, next);

      expect(serviceListingsService.createServiceListing).toHaveBeenCalledWith(
        'user-1',
        expect.anything(),
        []
      );
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest({ body: validBody });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await serviceListingsController.createServiceListing(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(error) when the description is too short', async () => {
      const req = mockRequest({ body: { ...validBody, description: 'short' } });
      const res = mockResponse();
      const next = mockNext();

      await serviceListingsController.createServiceListing(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(serviceListingsService.createServiceListing).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws ForbiddenError', async () => {
      const req = mockRequest({ body: validBody });
      const res = mockResponse();
      const next = mockNext();
      (serviceListingsService.createServiceListing as jest.Mock).mockRejectedValue(
        new ForbiddenError('Your profile is marked unavailable')
      );

      await serviceListingsController.createServiceListing(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });
  });

  describe('getMyServiceListings', () => {
    it('returns 200 with items and pagination meta', async () => {
      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();
      (serviceListingsService.getMyServiceListings as jest.Mock).mockResolvedValue({
        items: [mockListing],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false },
      });

      await serviceListingsController.getMyServiceListings(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ meta: expect.objectContaining({ pagination: expect.anything() }) })
      );
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await serviceListingsController.getMyServiceListings(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(error) for an invalid sortBy value', async () => {
      const req = mockRequest({ query: { sortBy: 'bogus' } });
      const res = mockResponse();
      const next = mockNext();

      await serviceListingsController.getMyServiceListings(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(serviceListingsService.getMyServiceListings).not.toHaveBeenCalled();
    });
  });

  describe('getServiceListings', () => {
    it('returns 200 with items and pagination meta (no auth required)', async () => {
      const req = mockRequest({ query: { categoryId: 'cat-1' } });
      const res = mockResponse();
      const next = mockNext();
      (serviceListingsService.getServiceListings as jest.Mock).mockResolvedValue({
        items: [mockListing],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false },
      });

      await serviceListingsController.getServiceListings(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(requireUser).not.toHaveBeenCalled();
    });

    it('calls next(error) for an out-of-range page', async () => {
      const req = mockRequest({ query: { page: '0' } });
      const res = mockResponse();
      const next = mockNext();

      await serviceListingsController.getServiceListings(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('getServiceListingById', () => {
    it('returns 200 with the listing on success', async () => {
      const req = mockRequest({ params: { id: 'listing-1' } });
      const res = mockResponse();
      const next = mockNext();
      (serviceListingsService.getServiceListingById as jest.Mock).mockResolvedValue(mockListing);

      await serviceListingsController.getServiceListingById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest({ params: { id: 'missing' } });
      const res = mockResponse();
      const next = mockNext();
      (serviceListingsService.getServiceListingById as jest.Mock).mockRejectedValue(
        new NotFoundError('Service listing not found')
      );

      await serviceListingsController.getServiceListingById(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('updateServiceListing', () => {
    it('returns 200 with the updated listing on success', async () => {
      const req = mockRequest({ params: { id: 'listing-1' }, body: { title: 'New title' } });
      const res = mockResponse();
      const next = mockNext();
      (serviceListingsService.updateServiceListing as jest.Mock).mockResolvedValue({
        ...mockListing,
        title: 'New title',
      });

      await serviceListingsController.updateServiceListing(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(serviceListingsService.updateServiceListing).toHaveBeenCalledWith(
        'user-1',
        'listing-1',
        { title: 'New title' }
      );
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest({ params: { id: 'listing-1' }, body: {} });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await serviceListingsController.updateServiceListing(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(error) when the service throws ForbiddenError (IDOR)', async () => {
      const req = mockRequest({ params: { id: 'listing-1' }, body: { title: 'Updated service' } });
      const res = mockResponse();
      const next = mockNext();
      (serviceListingsService.updateServiceListing as jest.Mock).mockRejectedValue(
        new ForbiddenError('You do not own this service listing.')
      );

      await serviceListingsController.updateServiceListing(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });
  });

  describe('deleteServiceListing', () => {
    it('returns 200 on success', async () => {
      const req = mockRequest({ params: { id: 'listing-1' } });
      const res = mockResponse();
      const next = mockNext();
      (serviceListingsService.deleteServiceListing as jest.Mock).mockResolvedValue(undefined);

      await serviceListingsController.deleteServiceListing(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(serviceListingsService.deleteServiceListing).toHaveBeenCalledWith('user-1', 'listing-1');
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest({ params: { id: 'listing-1' } });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await serviceListingsController.deleteServiceListing(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest({ params: { id: 'missing' } });
      const res = mockResponse();
      const next = mockNext();
      (serviceListingsService.deleteServiceListing as jest.Mock).mockRejectedValue(
        new NotFoundError('Service listing not found')
      );

      await serviceListingsController.deleteServiceListing(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });
});
