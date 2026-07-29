import { adminController } from '../../src/modules/admin/admin.controller';
import { adminService } from '../../src/modules/admin/admin.service';
import { requireUser } from '../../src/shared/utils/requireUser';
import { UnauthorizedError } from '../../src/shared/errors/UnauthorizedError';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/admin/admin.service');
jest.mock('../../src/shared/utils/requireUser');

const mockAd = { id: 'ad-1', title: 'Test Ad' } as any;
const mockUser = { id: 'user-1', name: 'Test User' } as any;
const adminUserId = 'admin-1';

describe('adminController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireUser as jest.Mock).mockReturnValue({ userId: adminUserId, role: 'ADMIN' });
  });

  describe('getStats', () => {
    it('returns 200 with stats on success', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      const stats = { totalAds: 10, totalUsers: 5 };
      (adminService.getStats as jest.Mock).mockResolvedValue(stats);

      await adminController.getStats(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: stats }));
    });

    it('calls next(error) when the service throws', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      (adminService.getStats as jest.Mock).mockRejectedValue(new Error('DB error'));

      await adminController.getStats(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('getAllAds', () => {
    it('returns 200 with items and pagination meta on success', async () => {
      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();
      const items = [mockAd];
      const meta = { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false };
      (adminService.getAllAds as jest.Mock).mockResolvedValue({ items, meta });

      await adminController.getAllAds(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: items, meta: { pagination: meta } })
      );
    });

    it('calls next(error) on an invalid status filter without invoking the service', async () => {
      const req = mockRequest({ query: { status: 'BOGUS' } });
      const res = mockResponse();
      const next = mockNext();

      await adminController.getAllAds(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(adminService.getAllAds).not.toHaveBeenCalled();
    });

    it('calls next(error) on a limit above the maximum', async () => {
      const req = mockRequest({ query: { limit: '101' } });
      const res = mockResponse();
      const next = mockNext();

      await adminController.getAllAds(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(adminService.getAllAds).not.toHaveBeenCalled();
    });
  });

  describe('setAdFeatured', () => {
    it('returns 200 with a "featured" message when isFeatured is true', async () => {
      const req = mockRequest({ params: { id: 'ad-1' }, body: { isFeatured: true } });
      const res = mockResponse();
      const next = mockNext();
      (adminService.setAdFeatured as jest.Mock).mockResolvedValue({ ...mockAd, isFeatured: true });

      await adminController.setAdFeatured(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Ad featured' }));
      expect(adminService.setAdFeatured).toHaveBeenCalledWith('ad-1', true, adminUserId);
    });

    it('returns 200 with an "unfeatured" message when isFeatured is false', async () => {
      const req = mockRequest({ params: { id: 'ad-1' }, body: { isFeatured: false } });
      const res = mockResponse();
      const next = mockNext();
      (adminService.setAdFeatured as jest.Mock).mockResolvedValue({ ...mockAd, isFeatured: false });

      await adminController.setAdFeatured(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Ad unfeatured' }));
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest({ params: { id: 'ad-1' }, body: { isFeatured: true } });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await adminController.setAdFeatured(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(error) on validation failure (non-boolean isFeatured)', async () => {
      const req = mockRequest({ params: { id: 'ad-1' }, body: { isFeatured: 'yes' } });
      const res = mockResponse();
      const next = mockNext();

      await adminController.setAdFeatured(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(adminService.setAdFeatured).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest({ params: { id: 'missing' }, body: { isFeatured: true } });
      const res = mockResponse();
      const next = mockNext();
      (adminService.setAdFeatured as jest.Mock).mockRejectedValue(new NotFoundError('Ad not found'));

      await adminController.setAdFeatured(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('setAdPinned', () => {
    it('returns 200 with a "pinned" message when isPinned is true', async () => {
      const req = mockRequest({ params: { id: 'ad-1' }, body: { isPinned: true } });
      const res = mockResponse();
      const next = mockNext();
      (adminService.setAdPinned as jest.Mock).mockResolvedValue({ ...mockAd, isPinned: true });

      await adminController.setAdPinned(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Ad pinned' }));
      expect(adminService.setAdPinned).toHaveBeenCalledWith('ad-1', true, adminUserId);
    });

    it('returns 200 with an "unpinned" message when isPinned is false', async () => {
      const req = mockRequest({ params: { id: 'ad-1' }, body: { isPinned: false } });
      const res = mockResponse();
      const next = mockNext();
      (adminService.setAdPinned as jest.Mock).mockResolvedValue({ ...mockAd, isPinned: false });

      await adminController.setAdPinned(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Ad unpinned' }));
    });

    it('calls next(error) on validation failure', async () => {
      const req = mockRequest({ params: { id: 'ad-1' }, body: {} });
      const res = mockResponse();
      const next = mockNext();

      await adminController.setAdPinned(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(adminService.setAdPinned).not.toHaveBeenCalled();
    });
  });

  describe('deleteAd', () => {
    it('returns 200 on success', async () => {
      const req = mockRequest({ params: { id: 'ad-1' } });
      const res = mockResponse();
      const next = mockNext();
      (adminService.forceDeleteAd as jest.Mock).mockResolvedValue(undefined);

      await adminController.deleteAd(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(adminService.forceDeleteAd).toHaveBeenCalledWith('ad-1', adminUserId);
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest({ params: { id: 'ad-1' } });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await adminController.deleteAd(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest({ params: { id: 'missing' } });
      const res = mockResponse();
      const next = mockNext();
      (adminService.forceDeleteAd as jest.Mock).mockRejectedValue(new NotFoundError('Ad not found'));

      await adminController.deleteAd(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('getAllUsers', () => {
    it('returns 200 with items and pagination meta on success', async () => {
      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();
      const items = [mockUser];
      const meta = { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false };
      (adminService.getAllUsers as jest.Mock).mockResolvedValue({ items, meta });

      await adminController.getAllUsers(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: items, meta: { pagination: meta } })
      );
    });

    it('calls next(error) on an invalid isActive value', async () => {
      const req = mockRequest({ query: { isActive: 'maybe' } });
      const res = mockResponse();
      const next = mockNext();

      await adminController.getAllUsers(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(adminService.getAllUsers).not.toHaveBeenCalled();
    });
  });

  describe('toggleUserActive', () => {
    it('returns 200 with an "activated" message when isActive is true', async () => {
      const req = mockRequest({ params: { id: 'user-1' }, body: { isActive: true } });
      const res = mockResponse();
      const next = mockNext();
      (adminService.toggleUserActive as jest.Mock).mockResolvedValue({ ...mockUser, isActive: true });

      await adminController.toggleUserActive(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'User activated' }));
      expect(adminService.toggleUserActive).toHaveBeenCalledWith('user-1', true, adminUserId);
    });

    it('returns 200 with a "deactivated" message when isActive is false', async () => {
      const req = mockRequest({ params: { id: 'user-1' }, body: { isActive: false } });
      const res = mockResponse();
      const next = mockNext();
      (adminService.toggleUserActive as jest.Mock).mockResolvedValue({ ...mockUser, isActive: false });

      await adminController.toggleUserActive(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'User deactivated' }));
    });

    it('calls next(error) when the service throws ForbiddenError (self-deactivation / last-admin guard)', async () => {
      const req = mockRequest({ params: { id: adminUserId }, body: { isActive: false } });
      const res = mockResponse();
      const next = mockNext();
      (adminService.toggleUserActive as jest.Mock).mockRejectedValue(
        new ForbiddenError('You cannot deactivate your own account.')
      );

      await adminController.toggleUserActive(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('calls next(error) on validation failure (non-boolean isActive)', async () => {
      const req = mockRequest({ params: { id: 'user-1' }, body: { isActive: 'true' } });
      const res = mockResponse();
      const next = mockNext();

      await adminController.toggleUserActive(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(adminService.toggleUserActive).not.toHaveBeenCalled();
    });
  });

  describe('changeRole', () => {
    it('returns 200 with the updated user on success', async () => {
      const req = mockRequest({ params: { id: 'user-1' }, body: { role: 'ADMIN' } });
      const res = mockResponse();
      const next = mockNext();
      const updated = { ...mockUser, role: 'ADMIN' };
      (adminService.changeRole as jest.Mock).mockResolvedValue(updated);

      await adminController.changeRole(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: updated }));
      expect(adminService.changeRole).toHaveBeenCalledWith('user-1', 'ADMIN', adminUserId);
    });

    it('calls next(error) on an invalid role value', async () => {
      const req = mockRequest({ params: { id: 'user-1' }, body: { role: 'SUPERADMIN' } });
      const res = mockResponse();
      const next = mockNext();

      await adminController.changeRole(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(adminService.changeRole).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws ForbiddenError (self-demotion / last-admin guard)', async () => {
      const req = mockRequest({ params: { id: adminUserId }, body: { role: 'USER' } });
      const res = mockResponse();
      const next = mockNext();
      (adminService.changeRole as jest.Mock).mockRejectedValue(
        new ForbiddenError('You cannot demote yourself.')
      );

      await adminController.changeRole(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest({ params: { id: 'user-1' }, body: { role: 'ADMIN' } });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await adminController.changeRole(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });
});
