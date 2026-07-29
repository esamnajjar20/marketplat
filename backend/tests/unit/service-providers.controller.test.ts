import { serviceProvidersController } from '../../src/modules/service-providers/service-providers.controller';
import { serviceProvidersService } from '../../src/modules/service-providers/service-providers.service';
import { requireUser } from '../../src/shared/utils/requireUser';
import { UnauthorizedError } from '../../src/shared/errors/UnauthorizedError';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ConflictError } from '../../src/shared/errors/ConflictError';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/service-providers/service-providers.service');
jest.mock('../../src/shared/utils/requireUser');

const mockProvider = { id: 'provider-1', businessName: 'Acme Repairs' } as any;

const validCreateBody = {
  businessName: 'Acme Repairs',
  businessType: 'INDIVIDUAL',
  description: 'We fix things really well',
  serviceAreaCities: ['Gaza'],
  workingHours: {
    sun: null,
    mon: null,
    tue: null,
    wed: null,
    thu: null,
    fri: null,
    sat: null,
  },
  contactPhone: '0599123456',
};

describe('serviceProvidersController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireUser as jest.Mock).mockReturnValue({ userId: 'user-1' });
  });

  describe('createServiceProvider', () => {
    it('returns 201 with the created profile on success', async () => {
      const req = mockRequest({ body: validCreateBody });
      const res = mockResponse();
      const next = mockNext();
      (serviceProvidersService.createServiceProvider as jest.Mock).mockResolvedValue(mockProvider);

      await serviceProvidersController.createServiceProvider(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: mockProvider })
      );
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest({ body: validCreateBody });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await serviceProvidersController.createServiceProvider(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(error) on validation failure without invoking the service', async () => {
      const req = mockRequest({ body: { businessName: 'x' } });
      const res = mockResponse();
      const next = mockNext();

      await serviceProvidersController.createServiceProvider(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(serviceProvidersService.createServiceProvider).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws ConflictError', async () => {
      const req = mockRequest({ body: validCreateBody });
      const res = mockResponse();
      const next = mockNext();
      (serviceProvidersService.createServiceProvider as jest.Mock).mockRejectedValue(
        new ConflictError('You already have a service provider profile.')
      );

      await serviceProvidersController.createServiceProvider(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ConflictError));
    });
  });

  describe('getMyServiceProvider', () => {
    it('returns 200 with the profile on success', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      (serviceProvidersService.getMyServiceProvider as jest.Mock).mockResolvedValue(mockProvider);

      await serviceProvidersController.getMyServiceProvider(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: mockProvider })
      );
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      (serviceProvidersService.getMyServiceProvider as jest.Mock).mockRejectedValue(
        new NotFoundError('Service provider profile not found')
      );

      await serviceProvidersController.getMyServiceProvider(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('updateMyServiceProvider', () => {
    it('returns 200 with the updated profile on success', async () => {
      const req = mockRequest({ body: { businessName: 'New Name' } });
      const res = mockResponse();
      const next = mockNext();
      const updated = { ...mockProvider, businessName: 'New Name' };
      (serviceProvidersService.updateMyServiceProvider as jest.Mock).mockResolvedValue(updated);

      await serviceProvidersController.updateMyServiceProvider(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: updated }));
    });

    it('calls next(error) on validation failure without invoking the service', async () => {
      const req = mockRequest({ body: { latitude: 999 } });
      const res = mockResponse();
      const next = mockNext();

      await serviceProvidersController.updateMyServiceProvider(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(serviceProvidersService.updateMyServiceProvider).not.toHaveBeenCalled();
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest({ body: {} });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await serviceProvidersController.updateMyServiceProvider(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });

  describe('getPublicServiceProvider', () => {
    it('returns 200 with the provider on success', async () => {
      const req = mockRequest({ params: { id: 'provider-1' } });
      const res = mockResponse();
      const next = mockNext();
      (serviceProvidersService.getPublicServiceProvider as jest.Mock).mockResolvedValue(mockProvider);

      await serviceProvidersController.getPublicServiceProvider(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: mockProvider })
      );
    });

    it('calls next(error) when the id param is missing', async () => {
      const req = mockRequest({ params: { id: '' } });
      const res = mockResponse();
      const next = mockNext();

      await serviceProvidersController.getPublicServiceProvider(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(serviceProvidersService.getPublicServiceProvider).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest({ params: { id: 'missing' } });
      const res = mockResponse();
      const next = mockNext();
      (serviceProvidersService.getPublicServiceProvider as jest.Mock).mockRejectedValue(
        new NotFoundError('Service provider not found')
      );

      await serviceProvidersController.getPublicServiceProvider(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('getNearby', () => {
    it('returns 200 with providers and pagination meta on success', async () => {
      const req = mockRequest({ query: { lat: '31.5', lng: '34.45', radius: '10' } });
      const res = mockResponse();
      const next = mockNext();
      const providers = [{ id: 'p1', distanceKm: 1.2 }];
      const meta = { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false };
      (serviceProvidersService.findNearby as jest.Mock).mockResolvedValue({ providers, meta });

      await serviceProvidersController.getNearby(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: providers,
          meta: { pagination: meta },
        })
      );
    });

    it('calls next(error) when lat/lng are missing', async () => {
      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();

      await serviceProvidersController.getNearby(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(serviceProvidersService.findNearby).not.toHaveBeenCalled();
    });

    it('calls next(error) when lat is out of range', async () => {
      const req = mockRequest({ query: { lat: '999', lng: '34.45' } });
      const res = mockResponse();
      const next = mockNext();

      await serviceProvidersController.getNearby(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(serviceProvidersService.findNearby).not.toHaveBeenCalled();
    });
  });
});
