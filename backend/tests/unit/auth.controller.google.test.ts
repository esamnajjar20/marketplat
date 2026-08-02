import { authController } from '../../src/modules/auth/auth.controller';
import { authService } from '../../src/modules/auth/auth.service';
import * as authCookies from '../../src/shared/utils/authCookies';
import { mockRequest, mockResponse } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/auth/auth.service');
jest.mock('../../src/shared/utils/authCookies');
jest.mock('../../src/shared/utils/getClientIp', () => ({
  getClientIp: jest.fn().mockReturnValue('1.2.3.4'),
}));
jest.mock('../../src/config/env', () => ({
  env: {
    frontendUrl: 'http://localhost:3000',
    googleOAuth: { isConfigured: true, clientId: 'x', clientSecret: 'y', callbackUrl: 'z' },
  },
}));

const googleAuthResult = {
  tokens: { accessToken: 'access-1', refreshToken: 'refresh-1' },
  user: { id: 'user-1', name: 'Test User', email: 'test@example.com', role: 'USER' },
};

describe('authController.googleCallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authCookies.setCsrfCookie as jest.Mock).mockReturnValue('csrf-token-1');
  });

  it('resolves the profile via authService.loginWithGoogle, sets session cookies, and redirects to the frontend on success', async () => {
    const req = mockRequest({ googleProfile: { googleId: 'g-1', email: 'test@example.com', name: 'Test User' } } as any);
    const res = mockResponse();
    (authService.loginWithGoogle as jest.Mock).mockResolvedValue(googleAuthResult);

    await authController.googleCallback(req, res);

    expect(authService.loginWithGoogle).toHaveBeenCalledWith(
      { googleId: 'g-1', email: 'test@example.com', name: 'Test User' },
      '1.2.3.4',
      expect.any(String)
    );
    expect(authCookies.setRefreshTokenCookie).toHaveBeenCalledWith(res, 'refresh-1');
    expect(authCookies.setCsrfCookie).toHaveBeenCalledWith(res);
    expect(authCookies.setSessionHintCookie).toHaveBeenCalledWith(res);
    expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000');
    // Redirect-based flow — never a JSON response for this handler.
    expect(res.json).not.toHaveBeenCalled();
  });

  it('redirects to /login?error=google_auth_failed when req.googleProfile is missing', async () => {
    const req = mockRequest({} as any);
    const res = mockResponse();

    await authController.googleCallback(req, res);

    expect(authService.loginWithGoogle).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/login?error=google_auth_failed');
    expect(authCookies.setRefreshTokenCookie).not.toHaveBeenCalled();
  });

  it('redirects to /login?error=google_auth_failed when authService.loginWithGoogle throws (e.g. deactivated account)', async () => {
    const req = mockRequest({ googleProfile: { googleId: 'g-1', email: 'test@example.com', name: 'Test User' } } as any);
    const res = mockResponse();
    (authService.loginWithGoogle as jest.Mock).mockRejectedValue(new Error('Account is deactivated'));

    await authController.googleCallback(req, res);

    expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/login?error=google_auth_failed');
    expect(authCookies.setRefreshTokenCookie).not.toHaveBeenCalled();
    // Deliberately no next(error) call for this handler — see
    // googleCallback's own comment on why a redirect-based flow can't
    // rely on the normal JSON error middleware.
  });
});
