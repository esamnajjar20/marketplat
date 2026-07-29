import { usersController } from '../../src/modules/users/users.controller';
import { usersService } from '../../src/modules/users/users.service';
import { requireUser } from '../../src/shared/utils/requireUser';
import { UnauthorizedError } from '../../src/shared/errors/UnauthorizedError';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/users/users.service');
jest.mock('../../src/shared/utils/requireUser');

const mockUser = { id: 'user-1', name: 'Test User', email: 'test@example.com' } as any;

describe('usersController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireUser as jest.Mock).mockReturnValue({ userId: 'user-1' });
  });

  describe('getMe', () => {
    it('returns 200 with the profile on success', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      (usersService.getMe as jest.Mock).mockResolvedValue(mockUser);

      await usersController.getMe(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: mockUser }));
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await usersController.getMe(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });

  describe('getUserById', () => {
    it('returns 200 with the public user on success', async () => {
      const req = mockRequest({ params: { id: 'user-1' } });
      const res = mockResponse();
      const next = mockNext();
      (usersService.getUserById as jest.Mock).mockResolvedValue(mockUser);

      await usersController.getUserById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: mockUser }));
    });

    it('calls next(error) when the id param is missing', async () => {
      const req = mockRequest({ params: { id: '' } });
      const res = mockResponse();
      const next = mockNext();

      await usersController.getUserById(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(usersService.getUserById).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest({ params: { id: 'missing' } });
      const res = mockResponse();
      const next = mockNext();
      (usersService.getUserById as jest.Mock).mockRejectedValue(new NotFoundError('User not found'));

      await usersController.getUserById(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('getUserAds', () => {
    it('returns 200 with items and pagination meta on success', async () => {
      const req = mockRequest({ params: { id: 'user-1' }, query: { page: '1', limit: '20' } });
      const res = mockResponse();
      const next = mockNext();
      const items = [{ id: 'ad-1' }];
      const meta = { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false };
      (usersService.getUserAds as jest.Mock).mockResolvedValue({ items, meta });

      await usersController.getUserAds(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: items, meta: { pagination: meta } })
      );
    });

    it('calls next(error) when the id param is missing', async () => {
      const req = mockRequest({ params: { id: '' }, query: { page: '1', limit: '20' } });
      const res = mockResponse();
      const next = mockNext();

      await usersController.getUserAds(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(usersService.getUserAds).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest({ params: { id: 'missing' }, query: { page: '1', limit: '20' } });
      const res = mockResponse();
      const next = mockNext();
      (usersService.getUserAds as jest.Mock).mockRejectedValue(new NotFoundError('User not found'));

      await usersController.getUserAds(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('updateMe', () => {
    it('returns 200 with the updated profile on success', async () => {
      const req = mockRequest({ body: { name: 'New Name' } });
      const res = mockResponse();
      const next = mockNext();
      const updated = { ...mockUser, name: 'New Name' };
      (usersService.updateMe as jest.Mock).mockResolvedValue(updated);

      await usersController.updateMe(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: updated }));
    });

    it('calls next(error) on invalid phone format', async () => {
      const req = mockRequest({ body: { phone: 'not-a-phone' } });
      const res = mockResponse();
      const next = mockNext();

      await usersController.updateMe(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(usersService.updateMe).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws BadRequestError (phone in use)', async () => {
      const req = mockRequest({ body: { phone: '+966501234567' } });
      const res = mockResponse();
      const next = mockNext();
      (usersService.updateMe as jest.Mock).mockRejectedValue(
        new BadRequestError('Phone number already in use')
      );

      await usersController.updateMe(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });
  });

  describe('deleteMe', () => {
    it('returns 200 on success', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      (usersService.deleteMe as jest.Mock).mockResolvedValue(undefined);

      await usersController.deleteMe(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await usersController.deleteMe(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      (usersService.deleteMe as jest.Mock).mockRejectedValue(new NotFoundError('User not found'));

      await usersController.deleteMe(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('updateNotificationPreferences', () => {
    it('returns 200 with the updated profile on success', async () => {
      const req = mockRequest({ body: { promotions: true } });
      const res = mockResponse();
      const next = mockNext();
      (usersService.updateNotificationPreferences as jest.Mock).mockResolvedValue(mockUser);

      await usersController.updateNotificationPreferences(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: mockUser }));
    });

    it('calls next(error) when no preference keys are provided (empty body)', async () => {
      const req = mockRequest({ body: {} });
      const res = mockResponse();
      const next = mockNext();

      await usersController.updateNotificationPreferences(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(usersService.updateNotificationPreferences).not.toHaveBeenCalled();
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest({ body: { promotions: true } });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await usersController.updateNotificationPreferences(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });

  describe('changePassword', () => {
    it('returns 200 on success and extracts the bearer token for the service', async () => {
      const req = mockRequest({
        body: { currentPassword: 'old-password', newPassword: 'newPassword123' },
        headers: { authorization: 'Bearer abc.def.ghi' },
      });
      const res = mockResponse();
      const next = mockNext();
      (usersService.changePassword as jest.Mock).mockResolvedValue(undefined);

      await usersController.changePassword(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(usersService.changePassword).toHaveBeenCalledWith(
        'user-1',
        'old-password',
        'newPassword123',
        'abc.def.ghi'
      );
    });

    it('passes undefined as the access token when the Authorization header is missing', async () => {
      const req = mockRequest({
        body: { currentPassword: 'old-password', newPassword: 'newPassword123' },
      });
      const res = mockResponse();
      const next = mockNext();
      (usersService.changePassword as jest.Mock).mockResolvedValue(undefined);

      await usersController.changePassword(req, res, next);

      expect(usersService.changePassword).toHaveBeenCalledWith(
        'user-1',
        'old-password',
        'newPassword123',
        undefined
      );
    });

    it('calls next(error) when newPassword is too short', async () => {
      const req = mockRequest({ body: { currentPassword: 'old-password', newPassword: 'short' } });
      const res = mockResponse();
      const next = mockNext();

      await usersController.changePassword(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(usersService.changePassword).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws BadRequestError (wrong current password)', async () => {
      const req = mockRequest({ body: { currentPassword: 'wrong', newPassword: 'newPassword123' } });
      const res = mockResponse();
      const next = mockNext();
      (usersService.changePassword as jest.Mock).mockRejectedValue(
        new BadRequestError('كلمة المرور الحالية غير صحيحة')
      );

      await usersController.changePassword(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });
  });

  describe('uploadAvatar', () => {
    const mockFile = { buffer: Buffer.from('fake-image') } as Express.Multer.File;

    it('returns 200 with the updated profile on success', async () => {
      const req = mockRequest();
      (req as any).file = mockFile;
      const res = mockResponse();
      const next = mockNext();
      const updated = { ...mockUser, avatarUrl: 'https://example.com/avatar.jpg' };
      (usersService.uploadAvatar as jest.Mock).mockResolvedValue(updated);

      await usersController.uploadAvatar(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: updated }));
      expect(usersService.uploadAvatar).toHaveBeenCalledWith('user-1', mockFile);
    });

    it('calls next(error) with BadRequestError when no file is attached', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();

      await usersController.uploadAvatar(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
      expect(usersService.uploadAvatar).not.toHaveBeenCalled();
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest();
      (req as any).file = mockFile;
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await usersController.uploadAvatar(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest();
      (req as any).file = mockFile;
      const res = mockResponse();
      const next = mockNext();
      (usersService.uploadAvatar as jest.Mock).mockRejectedValue(new NotFoundError('User not found'));

      await usersController.uploadAvatar(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });
});
