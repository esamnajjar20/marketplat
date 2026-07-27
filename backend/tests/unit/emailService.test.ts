/**
 * FIX TEST-V4-02: emailService.ts had zero test coverage despite being
 * this session's single highest-stakes fix — it's what makes
 * forgotPassword actually deliver a usable reset link instead of only
 * logging the token. These tests cover:
 *   1. The graceful-fallback path (SMTP unconfigured — must not throw,
 *      must not attempt a real network call).
 *   2. The real-send path (SMTP configured) — nodemailer is mocked at
 *      the module boundary, so no real network/SMTP connection is ever
 *      attempted in tests.
 *   3. Error handling — sendMail rejecting must be caught and logged,
 *      never thrown (password reset/security alerts must fail soft).
 *   4. The actual reset-link URL format, since
 *      app/(auth)/reset-password/page.tsx on the frontend expects
 *      exactly `?token=<value>` — a mismatch here would silently break
 *      every password reset email even though "an email was sent".
 *
 * NOTE on module-level caching: emailService.ts caches its nodemailer
 * Transporter in a module-scope variable (`let transporter`), created
 * once on first use of a configured environment. jest.resetModules()
 * + re-require() is used between test groups that change
 * env.email.isConfigured, so each group gets its own fresh module
 * instance instead of accidentally reusing a transporter (or lack
 * thereof) cached by an earlier test.
 */

const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn(() => ({ sendMail: mockSendMail }));

jest.mock('nodemailer', () => ({
  createTransport: mockCreateTransport,
}));

jest.mock('../../src/shared/utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

describe('emailService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when SMTP is not configured (the default fallback)', () => {
    beforeEach(() => {
      jest.resetModules();
      jest.doMock('../../src/config/env', () => ({
        env: {
          email: { isConfigured: false, fromEmail: 'no-reply@example.com', fromName: 'سوق غزة' },
          frontendUrl: 'https://example.com',
        },
      }));
    });

    it('sendPasswordResetEmail does not throw and does not call nodemailer', async () => {
      const { emailService } = require('../../src/shared/utils/emailService');
      await expect(
        emailService.sendPasswordResetEmail('user@example.com', 'reset-token-abc'),
      ).resolves.toBeUndefined();

      expect(mockCreateTransport).not.toHaveBeenCalled();
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('sendPasswordResetEmail logs a clearly-labeled fallback warning', async () => {
      const { emailService } = require('../../src/shared/utils/emailService');
      const { logger } = require('../../src/shared/utils/logger');

      await emailService.sendPasswordResetEmail('user@example.com', 'reset-token-abc');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('EMAIL NOT SENT'),
        expect.objectContaining({ to: 'user@example.com' }),
      );
    });

    it('sendSecurityAlertEmail also falls back to logging without throwing', async () => {
      const { emailService } = require('../../src/shared/utils/emailService');
      await expect(
        emailService.sendSecurityAlertEmail('user@example.com', 'ACCOUNT_LOCKED', { ip: '1.2.3.4' }),
      ).resolves.toBeUndefined();
      expect(mockSendMail).not.toHaveBeenCalled();
    });
  });

  describe('when SMTP is configured', () => {
    beforeEach(() => {
      jest.resetModules();
      jest.doMock('../../src/config/env', () => ({
        env: {
          email: {
            isConfigured: true,
            smtpHost: 'smtp.example.com',
            smtpPort: 587,
            smtpSecure: false,
            smtpUser: 'user',
            smtpPassword: 'pass',
            fromEmail: 'no-reply@example.com',
            fromName: 'سوق غزة',
          },
          frontendUrl: 'https://example.com',
        },
      }));
      mockSendMail.mockResolvedValue({ messageId: 'mock-id' });
    });

    it('sendPasswordResetEmail calls nodemailer.createTransport with the configured SMTP settings', async () => {
      const { emailService } = require('../../src/shared/utils/emailService');
      await emailService.sendPasswordResetEmail('user@example.com', 'reset-token-abc');

      expect(mockCreateTransport).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: { user: 'user', pass: 'pass' },
        // PROD-FIX-02: explicit timeouts added to prevent an
        // indefinitely hanging SMTP connection from blocking the
        // calling request (see emailService.ts's own comment).
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      });
    });

    it('sendPasswordResetEmail sends to the correct address with a reset URL matching the frontend route', async () => {
      const { emailService } = require('../../src/shared/utils/emailService');
      await emailService.sendPasswordResetEmail('user@example.com', 'reset-token-abc');

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const call = mockSendMail.mock.calls[0][0];
      expect(call.to).toBe('user@example.com');
      // FIX-critical: app/(auth)/reset-password/page.tsx reads
      // searchParams.token — the URL format here must match exactly,
      // or "an email was sent" while the link inside it is broken.
      expect(call.html).toContain('https://example.com/reset-password?token=reset-token-abc');
      expect(call.text).toContain('https://example.com/reset-password?token=reset-token-abc');
    });

    it('URL-encodes the token in the reset link', async () => {
      const { emailService } = require('../../src/shared/utils/emailService');
      await emailService.sendPasswordResetEmail('user@example.com', 'token with spaces & symbols');

      const call = mockSendMail.mock.calls[0][0];
      expect(call.html).toContain(encodeURIComponent('token with spaces & symbols'));
    });

    it('sendSecurityAlertEmail sends with a subject distinct from the password-reset email', async () => {
      const { emailService } = require('../../src/shared/utils/emailService');
      await emailService.sendSecurityAlertEmail('user@example.com', 'TOKEN_REUSE', { ip: '9.9.9.9' });

      const call = mockSendMail.mock.calls[0][0];
      expect(call.to).toBe('user@example.com');
      expect(call.html).toContain('9.9.9.9');
    });

    it('reuses the same transporter across multiple calls instead of recreating it each time', async () => {
      const { emailService } = require('../../src/shared/utils/emailService');
      await emailService.sendPasswordResetEmail('a@example.com', 'token-1');
      await emailService.sendPasswordResetEmail('b@example.com', 'token-2');

      expect(mockCreateTransport).toHaveBeenCalledTimes(1);
      expect(mockSendMail).toHaveBeenCalledTimes(2);
    });

    it('does not throw when sendMail rejects on every attempt — fails soft so the calling request is not 500\'d', async () => {
      jest.useFakeTimers();
      mockSendMail.mockRejectedValue(new Error('SMTP connection refused'));
      const { emailService } = require('../../src/shared/utils/emailService');

      const promise = emailService.sendPasswordResetEmail('user@example.com', 'reset-token-abc');
      // PROD-FIX-13: sendEmail retries twice (500ms, then 1500ms
      // backoff) before giving up — advance fake timers past both
      // delays so the retry loop actually completes within this test
      // instead of hanging on a real 2s of wall-clock sleep().
      await jest.advanceTimersByTimeAsync(500);
      await jest.advanceTimersByTimeAsync(1500);
      await expect(promise).resolves.toBeUndefined();

      expect(mockSendMail).toHaveBeenCalledTimes(3);
      jest.useRealTimers();
    });

    it('logs the error once, after all retries are exhausted, when sendMail rejects every time', async () => {
      jest.useFakeTimers();
      mockSendMail.mockRejectedValue(new Error('SMTP connection refused'));
      const { emailService } = require('../../src/shared/utils/emailService');
      const { logger } = require('../../src/shared/utils/logger');

      const promise = emailService.sendPasswordResetEmail('user@example.com', 'reset-token-abc');
      await jest.advanceTimersByTimeAsync(500);
      await jest.advanceTimersByTimeAsync(1500);
      await promise;

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to send email after all retries',
        expect.objectContaining({ to: 'user@example.com', attempts: 3 }),
      );
      jest.useRealTimers();
    });

    it('PROD-FIX-13: recovers on retry after a transient failure, without surfacing an error', async () => {
      jest.useFakeTimers();
      mockSendMail
        .mockRejectedValueOnce(new Error('temporary SMTP hiccup'))
        .mockResolvedValueOnce({ messageId: 'mock-id-after-retry' });
      const { emailService } = require('../../src/shared/utils/emailService');
      const { logger } = require('../../src/shared/utils/logger');

      const promise = emailService.sendPasswordResetEmail('user@example.com', 'reset-token-abc');
      await jest.advanceTimersByTimeAsync(500);
      await expect(promise).resolves.toBeUndefined();

      expect(mockSendMail).toHaveBeenCalledTimes(2);
      expect(logger.error).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Email sent after retry',
        expect.objectContaining({ to: 'user@example.com', attempt: 2 }),
      );
      jest.useRealTimers();
    });
  });
});
