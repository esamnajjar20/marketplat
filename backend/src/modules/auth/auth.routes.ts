import { Router } from 'express';
import { authController } from './auth.controller';
import { authRateLimit, refreshRateLimit, forgotPasswordRateLimit } from '../../middlewares/rateLimit.middleware';
import { authenticate } from '../../middlewares/auth.middleware';

export const authRouter = Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: Registration successful
 *       400:
 *         description: Validation error or email already in use
 */
authRouter.post('/register', authRateLimit, authController.register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 *       429:
 *         description: Account locked or too many attempts
 */
authRouter.post('/login', authRateLimit, authController.login);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh access token
 *     description: >
 *       PROD-FIX-15: refreshToken is now read from an httpOnly cookie
 *       (set by /auth/login, /auth/register, or a prior call to this
 *       same endpoint) rather than the request body. No request body
 *       is required or read; the cookie must be present (the browser
 *       sends it automatically for same-origin requests to
 *       /api/v1/auth/*).
 *     responses:
 *       200:
 *         description: Token refreshed
 *       401:
 *         description: Session expired, or no refresh token cookie present
 */
authRouter.post('/refresh', refreshRateLimit, authController.refresh);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout current session
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out
 */
authRouter.post('/logout', authenticate, authController.logout);

/**
 * @swagger
 * /auth/logout-all:
 *   post:
 *     tags: [Auth]
 *     summary: Logout from all devices
 *     security:
 *       - BearerAuth: []
 */
authRouter.post('/logout-all', authenticate, authController.logoutAll);

/**
 * @swagger
 * /auth/sessions:
 *   get:
 *     tags: [Auth]
 *     summary: Get all active sessions
 *     security:
 *       - BearerAuth: []
 */
authRouter.get('/sessions', authenticate, authController.getSessions);

/**
 * @swagger
 * /auth/sessions/{sessionId}:
 *   delete:
 *     tags: [Auth]
 *     summary: Revoke a specific session
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 */
authRouter.delete('/sessions/:sessionId', authenticate, authController.revokeSession);

/**
 * POST /auth/forgot-password — request a password reset email.
 * Rate-limited at 10/hr. No authentication required.
 */
authRouter.post('/forgot-password', forgotPasswordRateLimit, authController.forgotPassword);

/**
 * POST /auth/reset-password — set a new password using a reset token.
 * Rate-limited at 10/hr.
 */
authRouter.post('/reset-password', authRateLimit, authController.resetPassword);
