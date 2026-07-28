import { sellersController } from '../../src/modules/sellers/sellers.controller';
import { sellersService } from '../../src/modules/sellers/sellers.service';
import { requireUser } from '../../src/shared/utils/requireUser';
import { UnauthorizedError } from '../../src/shared/errors/UnauthorizedError';
import { ConflictError } from '../../src/shared/errors/ConflictError';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/sellers/sellers.service');
jest.mock('../../src/shared/utils/requireUser');

const mockProfile = { id: 'seller-profile-1', userId: 'user-1', suspended: false } as any;

describe('sellersController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireUser as jest.Mock).mockReturnValue({ userId: 'user-1' });
  });

  describe('createSellerProfile', () => {
    it('returns 201 with the created profile on success', async () => {
      const req = mockRequest({ body: { agreedToSellerTerms: true } });
      const res = mockResponse();
      const next = mockNext();
      (sellersService.createSellerProfile as jest.Mock).mockResolvedValue(mockProfile);

      await sellersController.createSellerProfile(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: mockProfile }));
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest({ body: { agreedToSellerTerms: true } });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await sellersController.createSellerProfile(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(error) when agreedToSellerTerms is missing', async () => {
      const req = mockRequest({ body: {} });
      const res = mockResponse();
      const next = mockNext();

      await sellersController.createSellerProfile(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(sellersService.createSellerProfile).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws ConflictError', async () => {
      const req = mockRequest({ body: { agreedToSellerTerms: true } });
      const res = mockResponse();
      const next = mockNext();
      (sellersService.createSellerProfile as jest.Mock).mockRejectedValue(
        new ConflictError('You already have a seller profile.')
      );

      await sellersController.createSellerProfile(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ConflictError));
    });
  });

  describe('getMySellerProfile', () => {
    it('returns 200 with the profile on success', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      (sellersService.getMySellerProfile as jest.Mock).mockResolvedValue(mockProfile);

      await sellersController.getMySellerProfile(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: mockProfile }));
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await sellersController.getMySellerProfile(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      (sellersService.getMySellerProfile as jest.Mock).mockRejectedValue(
        new NotFoundError('Seller profile not found')
      );

      await sellersController.getMySellerProfile(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('getPublicSellerProfile', () => {
    it('returns 200 with the profile on success (no auth required)', async () => {
      const req = mockRequest({ params: { id: 'seller-profile-1' } });
      const res = mockResponse();
      const next = mockNext();
      (sellersService.getPublicSellerProfile as jest.Mock).mockResolvedValue(mockProfile);

      await sellersController.getPublicSellerProfile(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(requireUser).not.toHaveBeenCalled();
    });

    it('calls next(error) for a missing id param', async () => {
      const req = mockRequest({ params: {} });
      const res = mockResponse();
      const next = mockNext();

      await sellersController.getPublicSellerProfile(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(sellersService.getPublicSellerProfile).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest({ params: { id: 'missing' } });
      const res = mockResponse();
      const next = mockNext();
      (sellersService.getPublicSellerProfile as jest.Mock).mockRejectedValue(
        new NotFoundError('Seller not found')
      );

      await sellersController.getPublicSellerProfile(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('createRating', () => {
    it('returns 201 on success', async () => {
      const req = mockRequest({ params: { id: 'seller-profile-1' }, body: { score: 5 } });
      const res = mockResponse();
      const next = mockNext();
      (sellersService.createRating as jest.Mock).mockResolvedValue(undefined);

      await sellersController.createRating(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(sellersService.createRating).toHaveBeenCalledWith('seller-profile-1', 'user-1', {
        score: 5,
      });
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest({ params: { id: 'seller-profile-1' }, body: { score: 5 } });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await sellersController.createRating(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(error) for a score outside 1-5', async () => {
      const req = mockRequest({ params: { id: 'seller-profile-1' }, body: { score: 6 } });
      const res = mockResponse();
      const next = mockNext();

      await sellersController.createRating(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(sellersService.createRating).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws ForbiddenError (self-rating)', async () => {
      const req = mockRequest({ params: { id: 'seller-profile-1' }, body: { score: 5 } });
      const res = mockResponse();
      const next = mockNext();
      (sellersService.createRating as jest.Mock).mockRejectedValue(
        new ForbiddenError('You cannot rate your own seller profile.')
      );

      await sellersController.createRating(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });
  });

  describe('verifySeller', () => {
    it('returns 200 with the updated profile on success (no auth check in this controller)', async () => {
      const req = mockRequest({ params: { id: 'seller-profile-1' }, body: { verified: true } });
      const res = mockResponse();
      const next = mockNext();
      (sellersService.setVerification as jest.Mock).mockResolvedValue({
        ...mockProfile,
        verified: true,
      });

      await sellersController.verifySeller(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(sellersService.setVerification).toHaveBeenCalledWith('seller-profile-1', true);
    });

    it('calls next(error) when verified is not a boolean', async () => {
      const req = mockRequest({ params: { id: 'seller-profile-1' }, body: { verified: 'yes' } });
      const res = mockResponse();
      const next = mockNext();

      await sellersController.verifySeller(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(sellersService.setVerification).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest({ params: { id: 'missing' }, body: { verified: true } });
      const res = mockResponse();
      const next = mockNext();
      (sellersService.setVerification as jest.Mock).mockRejectedValue(
        new NotFoundError('Seller not found')
      );

      await sellersController.verifySeller(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('suspendSeller', () => {
    it('returns 200 with the updated profile on success', async () => {
      const req = mockRequest({ params: { id: 'seller-profile-1' }, body: { suspended: true } });
      const res = mockResponse();
      const next = mockNext();
      (sellersService.setSuspension as jest.Mock).mockResolvedValue({
        ...mockProfile,
        suspended: true,
      });

      await sellersController.suspendSeller(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(sellersService.setSuspension).toHaveBeenCalledWith('seller-profile-1', true);
    });

    it('calls next(error) when suspended is not a boolean', async () => {
      const req = mockRequest({ params: { id: 'seller-profile-1' }, body: { suspended: 1 } });
      const res = mockResponse();
      const next = mockNext();

      await sellersController.suspendSeller(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(sellersService.setSuspension).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest({ params: { id: 'missing' }, body: { suspended: true } });
      const res = mockResponse();
      const next = mockNext();
      (sellersService.setSuspension as jest.Mock).mockRejectedValue(
        new NotFoundError('Seller not found')
      );

      await sellersController.suspendSeller(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });
});
