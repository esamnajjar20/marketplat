import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './auth.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { UnauthorizedError } from '../../shared/errors/UnauthorizedError';
import {
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  getRefreshTokenFromCookie,
  setCsrfCookie,
  clearCsrfCookie,
  setSessionHintCookie,
  clearSessionHintCookie,
} from '../../shared/utils/authCookies';

import { getClientIp } from '../../shared/utils/getClientIp';

const getUserAgent = (req: Request): string => req.headers['user-agent'] ?? 'unknown';

/**
 * PROD-FIX-15: register/login/refresh previously returned
 * refreshToken as part of the JSON response body, and the frontend
 * stored it in localStorage. Now: refreshToken is set as an httpOnly
 * cookie (never appears in the JSON body at all — see
 * shared/utils/authCookies.ts) and a matching CSRF token is set in a
 * separate, readable cookie the frontend must echo back on
 * state-changing requests (see middlewares/csrf.middleware.ts).
 *
 * `accessToken` still comes back in the JSON body — unchanged, still
 * meant to be kept in memory only by the frontend (never persisted to
 * localStorage), exactly as before this fix.
 *
 * Generic over T so this works for both AuthResult (register/login —
 * has `user`) and the bare `{ tokens }` shape `authService.refresh()`
 * returns (no `user` field) — both share the same `tokens: {
 * accessToken, refreshToken }` shape, which is the only part this
 * function actually needs to inspect/rewrite.
 */
function respondWithSession<T extends { tokens: { accessToken: string; refreshToken: string } }>(
  res: Response,
  status: number,
  message: string,
  result: T
): void {
  setRefreshTokenCookie(res, result.tokens.refreshToken);
  const csrfToken = setCsrfCookie(res);
  // AUDIT-FIX C-1: see authCookies.ts's own doc comment on this
  // function — lets middleware.ts distinguish "no session at all" from
  // "session exists, just needs a silent refresh" on a fresh page load.
  setSessionHintCookie(res);

  // refreshToken deliberately stripped from the response body — the
  // cookie is now the only place it lives. csrfToken IS included in
  // the body (in addition to its own cookie) purely as a convenience
  // so the frontend doesn't have to parse document.cookie itself on
  // first load; it's not a secret (that's the whole point of the
  // double-submit pattern — see csrf.middleware.ts).
  const { refreshToken: _omit, ...tokensWithoutRefresh } = result.tokens;
  void _omit;

  res.status(status).json(
    successResponse(message, {
      ...result,
      tokens: tokensWithoutRefresh,
      csrfToken,
    })
  );
}

export const authController = {
  register: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { body } = registerSchema.parse({ body: req.body });
      const result = await authService.register(body, getClientIp(req), getUserAgent(req));
      respondWithSession(res, 201, 'Registration successful', result);
    } catch (error) {
      next(error);
    }
  },

  login: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { body } = loginSchema.parse({ body: req.body });
      const result = await authService.login(body, getClientIp(req), getUserAgent(req));
      respondWithSession(res, 200, 'Login successful', result);
    } catch (error) {
      next(error);
    }
  },

  refresh: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // PROD-FIX-15: refreshToken now comes from the httpOnly cookie,
      // never from the request body — there's no longer any client-
      // readable JavaScript value to send back on this endpoint at
      // all, which is the entire point of moving it into an httpOnly
      // cookie in the first place.
      const refreshToken = getRefreshTokenFromCookie(req);
      if (!refreshToken) {
        throw new UnauthorizedError('No refresh token provided');
      }

      const tokens = await authService.refresh(refreshToken);
      respondWithSession(res, 200, 'Token refreshed', { tokens });
    } catch (error) {
      next(error);
    }
  },

  logout: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const accessToken = req.headers.authorization!.split(' ')[1];
      await authService.logout(user.userId, user.sessionId, accessToken, getClientIp(req));
      clearRefreshTokenCookie(res);
      clearCsrfCookie(res);
      clearSessionHintCookie(res); // AUDIT-FIX C-1
      res.status(200).json(successResponse('Logged out successfully'));
    } catch (error) {
      next(error);
    }
  },

  logoutAll: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const accessToken = req.headers.authorization!.split(' ')[1];
      await authService.logoutAll(user.userId, accessToken, getClientIp(req));
      clearRefreshTokenCookie(res);
      clearCsrfCookie(res);
      clearSessionHintCookie(res); // AUDIT-FIX C-1
      res.status(200).json(successResponse('Logged out from all devices'));
    } catch (error) {
      next(error);
    }
  },

  getSessions: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const sessions = await authService.getSessions(user.userId, user.sessionId);
      res.status(200).json(successResponse('Sessions fetched', sessions));
    } catch (error) {
      next(error);
    }
  },

  revokeSession: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { sessionId } = req.params;

      if (!sessionId) throw new BadRequestError('Session ID is required');

      if (sessionId === user.sessionId) {
        throw new BadRequestError('Cannot revoke current session. Use /logout instead');
      }

      await authService.revokeSession(user.userId, sessionId);
      res.status(200).json(successResponse('Session revoked'));
    } catch (error) {
      next(error);
    }
  },


  forgotPassword: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { body } = forgotPasswordSchema.parse({ body: req.body });
      await authService.forgotPassword(body.email);
      // Always return 200 to prevent email enumeration
      res.status(200).json(successResponse(
        'إذا كان البريد الإلكتروني مسجلاً، ستصلك رسالة لإعادة تعيين كلمة المرور خلال دقائق',
      ));
    } catch (error) {
      next(error);
    }
  },

  resetPassword: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { body } = resetPasswordSchema.parse({ body: req.body });
      await authService.resetPassword(body.token, body.newPassword);
      res.status(200).json(successResponse('تم تعيين كلمة المرور الجديدة بنجاح'));
    } catch (error) {
      next(error);
    }
  },
};