import { blockedUsersController } from '../../src/modules/blocked-users/blocked-users.controller';
import { blockedUsersService } from '../../src/modules/blocked-users/blocked-users.service';
import { requireUser } from '../../src/shared/utils/requireUser';
import { UnauthorizedError } from '../../src/shared/errors/UnauthorizedError';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/blocked-users/blocked-users.service');
jest.mock('../../src/shared/utils/requireUser');

const mockBlock = { id: 'b-1', blocked: { id: 'user-2', name: 'Target', avatarUrl: null } } as any;

describe('blockedUsersController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireUser as jest.Mock).mockReturnValue({ userId: 'user-1' });
  });

  describe('toggleBlock', () => {
    it('returns 200 with the toggle result on success', async () => {
      const req = mockRequest({ params: { userId: 'user-2' } });
      const res = mockResponse();
      const next = mockNext();
      (blockedUsersService.toggleBlock as jest.Mock).mockResolvedValue({ action: 'blocked' });

      await blockedUsersController.toggleBlock(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: { action: 'blocked' } })
      );
      expect(blockedUsersService.toggleBlock).toHaveBeenCalledWith('user-1', 'user-2');
      expect(next).not.toHaveBeenCalled();
    });

    it('calls next(error) when the caller is unauthenticated', async () => {
      const req = mockRequest({ params: { userId: 'user-2' } });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError('Authentication required');
      });

      await blockedUsersController.toggleBlock(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
      expect(res.status).not.toHaveBeenCalled();
    });

    it('calls next(error) when the userId param is missing', async () => {
      const req = mockRequest({ params: {} });
      const res = mockResponse();
      const next = mockNext();

      await blockedUsersController.toggleBlock(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(blockedUsersService.toggleBlock).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws ForbiddenError (self-block)', async () => {
      const req = mockRequest({ params: { userId: 'user-1' } });
      const res = mockResponse();
      const next = mockNext();
      (blockedUsersService.toggleBlock as jest.Mock).mockRejectedValue(
        new ForbiddenError('You cannot block yourself.')
      );

      await blockedUsersController.toggleBlock(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest({ params: { userId: 'missing' } });
      const res = mockResponse();
      const next = mockNext();
      (blockedUsersService.toggleBlock as jest.Mock).mockRejectedValue(
        new NotFoundError('User not found')
      );

      await blockedUsersController.toggleBlock(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('getMyBlockedUsers', () => {
    it('returns 200 with items and pagination meta on success', async () => {
      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();
      (blockedUsersService.getMyBlockedUsers as jest.Mock).mockResolvedValue({
        items: [mockBlock],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false },
      });

      await blockedUsersController.getMyBlockedUsers(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: [mockBlock],
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

      await blockedUsersController.getMyBlockedUsers(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(error) when query params fail validation', async () => {
      const req = mockRequest({ query: { page: '0' } });
      const res = mockResponse();
      const next = mockNext();

      await blockedUsersController.getMyBlockedUsers(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(blockedUsersService.getMyBlockedUsers).not.toHaveBeenCalled();
    });
  });
});
