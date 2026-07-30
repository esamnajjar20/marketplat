import { authController } from '../../src/modules/auth/auth.controller';
import { authService } from '../../src/modules/auth/auth.service';
import { requireUser } from '../../src/shared/utils/requireUser';
import { UnauthorizedError } from '../../src/shared/errors/UnauthorizedError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';
import { TooManyRequestsError } from '../../src/shared/errors/TooManyRequestsError';
import * as authCookies from '../../src/shared/utils/authCookies';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/auth/auth.service');
jest.mock('../../src/shared/utils/requireUser');
jest.mock('../../src/shared/utils/authCookies');
jest.mock('../../src/shared/utils/getClientIp', () => ({
  getClientIp: jest.fn().mockReturnValue('1.2.3.4'),
}));

const authResult = {
  tokens: { accessToken: 'access-1', refreshToken: 'refresh-1' },
  user: { id: 'user-1', name: 'Test', email: 'test@example.com', role: 'USER' },
};

const validRegisterBody = {
  name: 'Test User',
  email: 'test@example.com',
  password: 'Password123',
  city: 'Gaza',
};

const validLoginBody = { email: 'test@example.com', password: 'Password123' };

describe('authController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireUser as jest.Mock).mockReturnValue({ userId: 'user-1', sessionId: 'session-1' });
    (authCookies.setCsrfCookie as jest.Mock).mockReturnValue('csrf-token-1');
  });

  describe('register', () => {
    it('returns 201, sets session cookies, and strips refreshToken from the JSON body', async () => {
      const req = mockRequest({ body: validRegisterBody });
      const res = mockResponse();
      const next = mockNext();
      (authService.register as jest.Mock).mockResolvedValue(authResult);

      await authController.register(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(authCookies.setRefreshTokenCookie).toHaveBeenCalledWith(res, 'refresh-1');
      expect(authCookies.setCsrfCookie).toHaveBeenCalledWith(res);
      expect(authCookies.setSessionHintCookie).toHaveBeenCalledWith(res);

      const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
      expect(jsonArg.data.tokens).toEqual({ accessToken: 'access-1' });
      expect(jsonArg.data.tokens.refreshToken).toBeUndefined();
      expect(jsonArg.data.csrfToken).toBe('csrf-token-1');
    });

    it('calls next(error) on validation failure without invoking the service', async () => {
      const req = mockRequest({ body: { email: 'not-an-email' } });
      const res = mockResponse();
      const next = mockNext();

      await authController.register(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(authService.register).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws BadRequestError (email in use)', async () => {
      const req = mockRequest({ body: validRegisterBody });
      const res = mockResponse();
      const next = mockNext();
      (authService.register as jest.Mock).mockRejectedValue(new BadRequestError('Email already in use'));

      await authController.register(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
      expect(authCookies.setRefreshTokenCookie).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns 200 and sets session cookies on success', async () => {
      const req = mockRequest({ body: validLoginBody });
      const res = mockResponse();
      const next = mockNext();
      (authService.login as jest.Mock).mockResolvedValue(authResult);

      await authController.login(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(authCookies.setRefreshTokenCookie).toHaveBeenCalledWith(res, 'refresh-1');
    });

    it('calls next(error) when the service throws TooManyRequestsError (lockout)', async () => {
      const req = mockRequest({ body: validLoginBody });
      const res = mockResponse();
      const next = mockNext();
      (authService.login as jest.Mock).mockRejectedValue(
        new TooManyRequestsError('Account temporarily locked. Try again in 30 minutes')
      );

      await authController.login(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(TooManyRequestsError));
    });

    it('calls next(error) on validation failure', async () => {
      const req = mockRequest({ body: { email: 'test@example.com' } });
      const res = mockResponse();
      const next = mockNext();

      await authController.login(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(authService.login).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('returns 200 with new tokens when a refresh cookie is present', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      (authCookies.getRefreshTokenFromCookie as jest.Mock).mockReturnValue('cookie-refresh-token');
      (authService.refresh as jest.Mock).mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      });

      await authController.refresh(req, res, next);

      expect(authService.refresh).toHaveBeenCalledWith('cookie-refresh-token');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(authCookies.setRefreshTokenCookie).toHaveBeenCalledWith(res, 'new-refresh');
    });

    it('calls next(error) with UnauthorizedError when no refresh cookie is present', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      (authCookies.getRefreshTokenFromCookie as jest.Mock).mockReturnValue(undefined);

      await authController.refresh(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
      expect(authService.refresh).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws (e.g. reuse detected)', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      (authCookies.getRefreshTokenFromCookie as jest.Mock).mockReturnValue('stale-token');
      (authService.refresh as jest.Mock).mockRejectedValue(new UnauthorizedError('Session expired. Please login again'));

      await authController.refresh(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });

  describe('logout', () => {
    it('clears session cookies and returns 200 on success', async () => {
      const req = mockRequest({ headers: { authorization: 'Bearer access-token-1' } });
      const res = mockResponse();
      const next = mockNext();
      (authService.logout as jest.Mock).mockResolvedValue(undefined);

      await authController.logout(req, res, next);

      expect(authService.logout).toHaveBeenCalledWith('user-1', 'session-1', 'access-token-1', '1.2.3.4');
      expect(authCookies.clearRefreshTokenCookie).toHaveBeenCalledWith(res);
      expect(authCookies.clearCsrfCookie).toHaveBeenCalledWith(res);
      expect(authCookies.clearSessionHintCookie).toHaveBeenCalledWith(res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest({ headers: { authorization: 'Bearer x' } });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await authController.logout(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });

  describe('logoutAll', () => {
    it('clears session cookies and returns 200 on success', async () => {
      const req = mockRequest({ headers: { authorization: 'Bearer access-token-1' } });
      const res = mockResponse();
      const next = mockNext();
      (authService.logoutAll as jest.Mock).mockResolvedValue(undefined);

      await authController.logoutAll(req, res, next);

      expect(authService.logoutAll).toHaveBeenCalledWith('user-1', 'access-token-1', '1.2.3.4');
      expect(authCookies.clearRefreshTokenCookie).toHaveBeenCalledWith(res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getSessions', () => {
    it('returns 200 with the sessions list on success', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      const sessions = [{ sessionId: 'session-1', isCurrent: true }];
      (authService.getSessions as jest.Mock).mockResolvedValue(sessions);

      await authController.getSessions(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: sessions }));
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await authController.getSessions(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });

  describe('revokeSession', () => {
    it('returns 200 on success when revoking a different session', async () => {
      const req = mockRequest({ params: { sessionId: 'session-2' } });
      const res = mockResponse();
      const next = mockNext();
      (authService.revokeSession as jest.Mock).mockResolvedValue(undefined);

      await authController.revokeSession(req, res, next);

      expect(authService.revokeSession).toHaveBeenCalledWith('user-1', 'session-2');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('calls next(error) with BadRequestError when sessionId param is missing', async () => {
      const req = mockRequest({ params: {} });
      const res = mockResponse();
      const next = mockNext();

      await authController.revokeSession(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
      expect(authService.revokeSession).not.toHaveBeenCalled();
    });

    it('calls next(error) with BadRequestError when attempting to revoke the current session', async () => {
      const req = mockRequest({ params: { sessionId: 'session-1' } });
      const res = mockResponse();
      const next = mockNext();

      await authController.revokeSession(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
      expect(authService.revokeSession).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest({ params: { sessionId: 'session-2' } });
      const res = mockResponse();
      const next = mockNext();
      const { NotFoundError } = require('../../src/shared/errors/NotFoundError');
      (authService.revokeSession as jest.Mock).mockRejectedValue(new NotFoundError('Session not found'));

      await authController.revokeSession(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('forgotPassword', () => {
    it('always returns 200, regardless of whether the email exists', async () => {
      const req = mockRequest({ body: { email: 'test@example.com' } });
      const res = mockResponse();
      const next = mockNext();
      (authService.forgotPassword as jest.Mock).mockResolvedValue(undefined);

      await authController.forgotPassword(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('calls next(error) on an invalid email format', async () => {
      const req = mockRequest({ body: { email: 'not-an-email' } });
      const res = mockResponse();
      const next = mockNext();

      await authController.forgotPassword(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(authService.forgotPassword).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('returns 200 on success', async () => {
      const req = mockRequest({ body: { token: 'reset-token', newPassword: 'NewPassword123' } });
      const res = mockResponse();
      const next = mockNext();
      (authService.resetPassword as jest.Mock).mockResolvedValue(undefined);

      await authController.resetPassword(req, res, next);

      expect(authService.resetPassword).toHaveBeenCalledWith('reset-token', 'NewPassword123');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('calls next(error) when the service throws BadRequestError (invalid/expired token)', async () => {
      const req = mockRequest({ body: { token: 'bad-token', newPassword: 'NewPassword123' } });
      const res = mockResponse();
      const next = mockNext();
      (authService.resetPassword as jest.Mock).mockRejectedValue(
        new BadRequestError('Password reset link is invalid or has expired')
      );

      await authController.resetPassword(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });

    it('calls next(error) on validation failure (missing newPassword)', async () => {
      const req = mockRequest({ body: { token: 'reset-token' } });
      const res = mockResponse();
      const next = mockNext();

      await authController.resetPassword(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(authService.resetPassword).not.toHaveBeenCalled();
    });
  });
});
