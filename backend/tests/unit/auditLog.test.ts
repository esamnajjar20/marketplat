import { auditLog, AuditEvent } from '../../src/shared/utils/auditLog';
import { prisma } from '../../src/config/prisma';
import { logger } from '../../src/shared/utils/logger';

/**
 * Coverage for auditLog.ts. Two behaviors worth pinning down:
 *   1. It always logs synchronously via the Winston logger FIRST,
 *      regardless of whether the DB write later succeeds — the audit
 *      trail must not silently vanish just because Postgres is down.
 *   2. The DB write is fire-and-forget: a failed prisma.auditLog.create
 *      must never throw out of auditLog() / reject its returned promise,
 *      since audit logging is a side-effect that should never break the
 *      request path that triggered it (e.g. a login).
 */
describe('auditLog', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('logs via the Winston logger with the event name and entry details', async () => {
    const loggerSpy = jest.spyOn(logger, 'info').mockImplementation(() => logger);
    jest.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

    await auditLog({
      event: AuditEvent.LOGIN_SUCCESS,
      userId: 'user-1',
      sessionId: 'session-1',
      ip: '203.0.113.5',
      userAgent: 'jest-test-agent',
    });

    expect(loggerSpy).toHaveBeenCalledWith(
      '[AUDIT] LOGIN_SUCCESS',
      expect.objectContaining({
        audit: true,
        event: AuditEvent.LOGIN_SUCCESS,
        userId: 'user-1',
        sessionId: 'session-1',
        ip: '203.0.113.5',
        userAgent: 'jest-test-agent',
        timestamp: expect.any(String),
      }),
    );
  });

  it('writes the entry to the database via prisma.auditLog.create', async () => {
    const createSpy = jest.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);
    jest.spyOn(logger, 'info').mockImplementation(() => logger);

    await auditLog({
      event: AuditEvent.PASSWORD_CHANGED,
      userId: 'user-2',
      details: { reason: 'user-initiated' },
    });

    // Fire-and-forget: give the unawaited .catch() chain a microtask tick.
    await new Promise((resolve) => setImmediate(resolve));

    expect(createSpy).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: AuditEvent.PASSWORD_CHANGED,
        userId: 'user-2',
        details: { reason: 'user-initiated' },
      }),
    });
  });

  it('does not throw or reject when the DB write fails (fire-and-forget)', async () => {
    jest.spyOn(prisma.auditLog, 'create').mockRejectedValue(new Error('DB unavailable'));
    jest.spyOn(logger, 'info').mockImplementation(() => logger);
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);

    await expect(
      auditLog({ event: AuditEvent.LOGIN_FAILED, ip: '203.0.113.5' }),
    ).resolves.toBeUndefined();

    // Allow the unawaited .catch() handler to actually run.
    await new Promise((resolve) => setImmediate(resolve));

    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to write audit log to DB',
      expect.objectContaining({ err: expect.any(Error) }),
    );
  });

  it('omits undefined optional fields rather than passing literal undefined oddly', async () => {
    const createSpy = jest.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);
    jest.spyOn(logger, 'info').mockImplementation(() => logger);

    await auditLog({ event: AuditEvent.LOGOUT });
    await new Promise((resolve) => setImmediate(resolve));

    expect(createSpy).toHaveBeenCalledWith({
      data: {
        event: AuditEvent.LOGOUT,
        userId: undefined,
        sessionId: undefined,
        ip: undefined,
        userAgent: undefined,
        details: undefined,
      },
    });
  });
});
