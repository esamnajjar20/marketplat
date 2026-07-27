jest.mock('../../src/shared/utils/emailService', () => ({
  emailService: { sendSecurityAlertEmail: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../../src/shared/utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { sendSecurityAlert } from '../../src/shared/utils/securityAlert';
import { emailService } from '../../src/shared/utils/emailService';
import { logger } from '../../src/shared/utils/logger';
import { createTestUser } from '../helpers/auth.helper';

/**
 * FIX TEST-V4-04: securityAlert.ts had zero test coverage despite being
 * the fix for a real gap — account lockouts and detected refresh-token
 * reuse previously only ever produced a server-side log line, with the
 * affected account owner never actually notified (a real security event
 * they'd want to know about immediately, e.g. to change a compromised
 * password).
 *
 * Uses the project's existing createTestUser helper against the real
 * test database (matching this suite's established convention — see
 * tests/setup.ts, which keeps a real Prisma connection rather than
 * mocking it) so the user-lookup-by-id path is exercised for real, not
 * just asserted via a mock.
 */
describe('sendSecurityAlert', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.clearAllMocks();
    global.fetch = originalFetch;
  });

  it('looks up the user by id and sends a security alert email to their address', async () => {
    const user = await createTestUser({ email: `secalert-${Date.now()}@example.com` });

    await sendSecurityAlert({ userId: user.id, event: 'ACCOUNT_LOCKED', ip: '1.2.3.4' });

    expect(emailService.sendSecurityAlertEmail).toHaveBeenCalledWith(
      user.email,
      'ACCOUNT_LOCKED',
      expect.objectContaining({ ip: '1.2.3.4' }),
    );
  });

  it('passes through userAgent and any extra details to the email content', async () => {
    const user = await createTestUser({ email: `secalert-${Date.now()}@example.com` });

    await sendSecurityAlert({
      userId: user.id,
      event: 'TOKEN_REUSE',
      ip: '5.6.7.8',
      userAgent: 'jest-agent',
      details: { sessionId: 'session-xyz' },
    });

    expect(emailService.sendSecurityAlertEmail).toHaveBeenCalledWith(
      user.email,
      'TOKEN_REUSE',
      expect.objectContaining({ ip: '5.6.7.8', userAgent: 'jest-agent', sessionId: 'session-xyz' }),
    );
  });

  it('logs a warning and does not call emailService when the user no longer exists', async () => {
    await sendSecurityAlert({ userId: 'nonexistent-user-id', event: 'ACCOUNT_LOCKED' });

    expect(emailService.sendSecurityAlertEmail).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'Security alert: user not found for email notification',
      { userId: 'nonexistent-user-id' },
    );
  });

  it('does not throw when emailService itself rejects — a failed notification must never block the security action that already happened', async () => {
    (emailService.sendSecurityAlertEmail as jest.Mock).mockRejectedValueOnce(new Error('SMTP down'));
    const user = await createTestUser({ email: `secalert-${Date.now()}@example.com` });

    await expect(
      sendSecurityAlert({ userId: user.id, event: 'SUSPICIOUS_LOGIN' }),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      'Failed to send security alert email',
      expect.objectContaining({ err: expect.any(Error) }),
    );
  });

  it('always logs the raw security alert event regardless of email outcome', async () => {
    const user = await createTestUser({ email: `secalert-${Date.now()}@example.com` });
    await sendSecurityAlert({ userId: user.id, event: 'ACCOUNT_LOCKED', ip: '1.1.1.1' });

    expect(logger.warn).toHaveBeenCalledWith(
      '[SECURITY ALERT] ACCOUNT_LOCKED',
      expect.objectContaining({ userId: user.id, event: 'ACCOUNT_LOCKED' }),
    );
  });

  describe('SIEM webhook (optional)', () => {
    afterEach(() => {
      jest.dontMock('../../src/config/env');
    });

    it('does not call fetch when no webhook URL is configured', async () => {
      jest.resetModules();
      jest.doMock('../../src/config/env', () => ({
        env: { securityAlert: { webhookUrl: '' } },
      }));
      const mockFetch = jest.fn();
      global.fetch = mockFetch as any;

      const { sendSecurityAlert: sendAlertFresh } = require('../../src/shared/utils/securityAlert');
      const user = await createTestUser({ email: `secalert-${Date.now()}@example.com` });
      await sendAlertFresh({ userId: user.id, event: 'ACCOUNT_LOCKED' });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('POSTs the alert payload to the configured webhook URL', async () => {
      jest.resetModules();
      jest.doMock('../../src/config/env', () => ({
        env: { securityAlert: { webhookUrl: 'https://siem.example.com/ingest' } },
      }));
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetch as any;

      const { sendSecurityAlert: sendAlertFresh } = require('../../src/shared/utils/securityAlert');
      const user = await createTestUser({ email: `secalert-${Date.now()}@example.com` });
      await sendAlertFresh({ userId: user.id, event: 'ACCOUNT_LOCKED', ip: '1.2.3.4' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://siem.example.com/ingest',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"event":"ACCOUNT_LOCKED"'),
        }),
      );
    });

    it('does not let a webhook delivery failure throw or propagate', async () => {
      jest.resetModules();
      jest.doMock('../../src/config/env', () => ({
        env: { securityAlert: { webhookUrl: 'https://siem.example.com/ingest' } },
      }));
      const mockFetch = jest.fn().mockRejectedValue(new Error('webhook unreachable'));
      global.fetch = mockFetch as any;

      const { sendSecurityAlert: sendAlertFresh } = require('../../src/shared/utils/securityAlert');
      const user = await createTestUser({ email: `secalert-${Date.now()}@example.com` });

      await expect(
        sendAlertFresh({ userId: user.id, event: 'ACCOUNT_LOCKED' }),
      ).resolves.toBeUndefined();
    });

    /**
     * BUGFIX regression test — found during a post-implementation code
     * audit. This fetch() call previously had no timeout at all — the
     * same class of gap PROD-FIX-02 already closed for Cloudinary and
     * SMTP. Confirms the fix: an AbortSignal is actually passed through
     * to fetch(), so a hung webhook endpoint can be cut off rather than
     * accumulating indefinitely (this matters most exactly when this
     * path fires a lot — during an actual attack).
     */
    it('BUGFIX: passes an AbortSignal to fetch so a hung webhook is not left unbounded', async () => {
      jest.resetModules();
      jest.doMock('../../src/config/env', () => ({
        env: { securityAlert: { webhookUrl: 'https://siem.example.com/ingest' } },
      }));
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetch as any;

      const { sendSecurityAlert: sendAlertFresh } = require('../../src/shared/utils/securityAlert');
      const user = await createTestUser({ email: `secalert-${Date.now()}@example.com` });
      await sendAlertFresh({ userId: user.id, event: 'ACCOUNT_LOCKED' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://siem.example.com/ingest',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });
});
