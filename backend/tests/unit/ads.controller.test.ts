import { adsController } from '../../src/modules/ads/ads.controller';
import { adsService } from '../../src/modules/ads/ads.service';
import { requireUser } from '../../src/shared/utils/requireUser';
import { UnauthorizedError } from '../../src/shared/errors/UnauthorizedError';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/ads/ads.service');
jest.mock('../../src/shared/utils/requireUser');

const mockAd = { id: 'ad-1', title: 'Test Ad' } as any;
const mockFile = { buffer: Buffer.from('fake-image'), mimetype: 'image/jpeg' } as Express.Multer.File;

const validCreateBody = {
  title: 'A nice used bicycle',
  description: 'Barely used, great condition, comes with lock',
  city: 'Gaza',
  isNegotiable: 'true',
};

describe('adsController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireUser as jest.Mock).mockReturnValue({ userId: 'user-1', role: 'USER' });
  });

  describe('createAd', () => {
    it('returns 201 with the created ad when files are attached', async () => {
      const req = mockRequest({ body: validCreateBody, files: [mockFile] as any });
      const res = mockResponse();
      const next = mockNext();
      (adsService.createAd as jest.Mock).mockResolvedValue(mockAd);

      await adsController.createAd(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: mockAd }));
      expect(adsService.createAd).toHaveBeenCalledWith('user-1', expect.any(Object), [mockFile]);
    });

    it('calls next(error) with BadRequestError when no files are attached', async () => {
      const req = mockRequest({ body: validCreateBody });
      const res = mockResponse();
      const next = mockNext();

      await adsController.createAd(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
      expect(adsService.createAd).not.toHaveBeenCalled();
    });

    it('calls next(error) with BadRequestError when req.files is an empty array', async () => {
      const req = mockRequest({ body: validCreateBody, files: [] as any });
      const res = mockResponse();
      const next = mockNext();

      await adsController.createAd(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
      expect(adsService.createAd).not.toHaveBeenCalled();
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest({ body: validCreateBody, files: [mockFile] as any });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await adsController.createAd(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(error) on validation failure without invoking the service', async () => {
      const req = mockRequest({ body: { title: 'x' }, files: [mockFile] as any });
      const res = mockResponse();
      const next = mockNext();

      await adsController.createAd(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(adsService.createAd).not.toHaveBeenCalled();
    });
  });

  describe('getAds', () => {
    it('returns 200 with items and pagination meta on success', async () => {
      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();
      const items = [mockAd];
      const meta = { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false };
      (adsService.getAds as jest.Mock).mockResolvedValue({ items, meta });

      await adsController.getAds(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: items, meta: { pagination: meta } })
      );
    });

    it('calls next(error) on an invalid sortBy value', async () => {
      const req = mockRequest({ query: { sortBy: 'bogus' } });
      const res = mockResponse();
      const next = mockNext();

      await adsController.getAds(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(adsService.getAds).not.toHaveBeenCalled();
    });
  });

  describe('getAdById', () => {
    it('returns 200 with the ad on success, forwarding the viewer IP', async () => {
      const req = mockRequest({ params: { id: 'ad-1' }, ip: '203.0.113.5' } as any);
      const res = mockResponse();
      const next = mockNext();
      (adsService.getAdById as jest.Mock).mockResolvedValue(mockAd);

      await adsController.getAdById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(adsService.getAdById).toHaveBeenCalledWith('ad-1', '203.0.113.5');
    });

    it('calls next(error) when the id param is missing', async () => {
      const req = mockRequest({ params: { id: '' } });
      const res = mockResponse();
      const next = mockNext();

      await adsController.getAdById(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(adsService.getAdById).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest({ params: { id: 'missing' } });
      const res = mockResponse();
      const next = mockNext();
      (adsService.getAdById as jest.Mock).mockRejectedValue(new NotFoundError('Ad not found'));

      await adsController.getAdById(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('getMyAds', () => {
    it('returns 200 with items and pagination meta on success', async () => {
      const req = mockRequest({ query: { status: 'ACTIVE' } });
      const res = mockResponse();
      const next = mockNext();
      const items = [mockAd];
      const meta = { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false };
      (adsService.getMyAds as jest.Mock).mockResolvedValue({ items, meta });

      await adsController.getMyAds(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(adsService.getMyAds).toHaveBeenCalledWith('user-1', expect.objectContaining({ status: 'ACTIVE' }));
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await adsController.getMyAds(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(error) on an invalid status filter (e.g. DELETED is allowed here, bogus is not)', async () => {
      const req = mockRequest({ query: { status: 'BOGUS' } });
      const res = mockResponse();
      const next = mockNext();

      await adsController.getMyAds(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(adsService.getMyAds).not.toHaveBeenCalled();
    });
  });

  describe('getRelatedAds', () => {
    it('returns 200 with related ads on success', async () => {
      const req = mockRequest({ params: { id: 'ad-1' } });
      const res = mockResponse();
      const next = mockNext();
      const related = [mockAd];
      (adsService.getRelatedAds as jest.Mock).mockResolvedValue(related);

      await adsController.getRelatedAds(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: related }));
    });

    it('calls next(error) when the id param is missing', async () => {
      const req = mockRequest({ params: { id: '' } });
      const res = mockResponse();
      const next = mockNext();

      await adsController.getRelatedAds(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(adsService.getRelatedAds).not.toHaveBeenCalled();
    });
  });

  describe('updateAd', () => {
    it('returns 200 with the updated ad on success', async () => {
      const req = mockRequest({ params: { id: 'ad-1' }, body: { title: 'New title here' } });
      const res = mockResponse();
      const next = mockNext();
      const updated = { ...mockAd, title: 'New title here' };
      (adsService.updateAd as jest.Mock).mockResolvedValue(updated);

      await adsController.updateAd(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(adsService.updateAd).toHaveBeenCalledWith(
        'ad-1',
        'user-1',
        'USER',
        expect.objectContaining({ title: 'New title here' })
      );
    });

    it('calls next(error) when the service throws ForbiddenError (not the owner)', async () => {
      const req = mockRequest({ params: { id: 'ad-1' }, body: { title: 'New title here' } });
      const res = mockResponse();
      const next = mockNext();
      (adsService.updateAd as jest.Mock).mockRejectedValue(
        new ForbiddenError('You do not have permission to modify this ad.')
      );

      await adsController.updateAd(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('calls next(error) on validation failure without invoking the service', async () => {
      const req = mockRequest({ params: { id: 'ad-1' }, body: { title: 'x' } });
      const res = mockResponse();
      const next = mockNext();

      await adsController.updateAd(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(adsService.updateAd).not.toHaveBeenCalled();
    });
  });

  describe('addImages', () => {
    it('returns 200 with the updated ad when files are attached', async () => {
      const req = mockRequest({ params: { id: 'ad-1' }, files: [mockFile] as any });
      const res = mockResponse();
      const next = mockNext();
      (adsService.addImages as jest.Mock).mockResolvedValue(mockAd);

      await adsController.addImages(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(adsService.addImages).toHaveBeenCalledWith('ad-1', 'user-1', 'USER', [mockFile]);
    });

    it('calls next(error) with BadRequestError when no files are attached', async () => {
      const req = mockRequest({ params: { id: 'ad-1' } });
      const res = mockResponse();
      const next = mockNext();

      await adsController.addImages(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
      expect(adsService.addImages).not.toHaveBeenCalled();
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest({ params: { id: 'ad-1' }, files: [mockFile] as any });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await adsController.addImages(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });

  describe('removeImage', () => {
    it('returns 200 with the updated ad on success', async () => {
      const req = mockRequest({
        params: { id: 'ad-1' },
        body: { imageUrl: 'https://example.com/img.jpg' },
      });
      const res = mockResponse();
      const next = mockNext();
      (adsService.removeImage as jest.Mock).mockResolvedValue(mockAd);

      await adsController.removeImage(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(adsService.removeImage).toHaveBeenCalledWith(
        'ad-1',
        'user-1',
        'USER',
        'https://example.com/img.jpg'
      );
    });

    it('calls next(error) when imageUrl is not a valid URL', async () => {
      const req = mockRequest({ params: { id: 'ad-1' }, body: { imageUrl: 'not-a-url' } });
      const res = mockResponse();
      const next = mockNext();

      await adsController.removeImage(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(adsService.removeImage).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws NotFoundError (image not on ad)', async () => {
      const req = mockRequest({
        params: { id: 'ad-1' },
        body: { imageUrl: 'https://example.com/img.jpg' },
      });
      const res = mockResponse();
      const next = mockNext();
      (adsService.removeImage as jest.Mock).mockRejectedValue(new NotFoundError('Image not found'));

      await adsController.removeImage(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('searchAds', () => {
    it('returns 200 with items and pagination meta, forwarding q as search', async () => {
      const req = mockRequest({ query: { q: 'bicycle' } });
      const res = mockResponse();
      const next = mockNext();
      const items = [mockAd];
      const meta = { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false };
      (adsService.getAds as jest.Mock).mockResolvedValue({ items, meta });

      await adsController.searchAds(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(adsService.getAds).toHaveBeenCalledWith(expect.objectContaining({ search: 'bicycle' }));
      // q itself must not leak through as a raw filter key
      const callArg = (adsService.getAds as jest.Mock).mock.calls[0][0];
      expect(callArg).not.toHaveProperty('q');
    });

    it('calls next(error) when q is missing', async () => {
      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();

      await adsController.searchAds(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(adsService.getAds).not.toHaveBeenCalled();
    });

    it('calls next(error) when q is an empty string', async () => {
      const req = mockRequest({ query: { q: '' } });
      const res = mockResponse();
      const next = mockNext();

      await adsController.searchAds(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(adsService.getAds).not.toHaveBeenCalled();
    });
  });

  describe('deleteAd', () => {
    it('returns 200 on success', async () => {
      const req = mockRequest({ params: { id: 'ad-1' } });
      const res = mockResponse();
      const next = mockNext();
      (adsService.deleteAd as jest.Mock).mockResolvedValue(undefined);

      await adsController.deleteAd(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(adsService.deleteAd).toHaveBeenCalledWith('ad-1', 'user-1', 'USER');
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest({ params: { id: 'ad-1' } });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await adsController.deleteAd(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(error) when the service throws ForbiddenError (not the owner)', async () => {
      const req = mockRequest({ params: { id: 'ad-1' } });
      const res = mockResponse();
      const next = mockNext();
      (adsService.deleteAd as jest.Mock).mockRejectedValue(
        new ForbiddenError('You do not have permission to delete this ad.')
      );

      await adsController.deleteAd(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest({ params: { id: 'missing' } });
      const res = mockResponse();
      const next = mockNext();
      (adsService.deleteAd as jest.Mock).mockRejectedValue(new NotFoundError('Ad not found'));

      await adsController.deleteAd(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });
});
