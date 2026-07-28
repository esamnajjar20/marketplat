/**
 * FIX TEST-V4-06: logger.ts's WebhookErrorReporterTransport had zero
 * test coverage. Both the transport's existence (only added when
 * ERROR_REPORTER_WEBHOOK_URL is set) and its actual POST payload/
 * failure-handling behavior are tested here.
 *
 * FIX APM-02: extended to cover the new SentryErrorReporterTransport
 * alongside it — same module-load-time-config problem, same fix
 * pattern (jest.resetModules() + manipulating process.env before
 * re-requiring).
 *
 * @sentry/node is mocked at the module boundary (not the real SDK) —
 * this suite verifies THIS APP's integration logic (does the transport
 * get added only when SENTRY_DSN is set, does it call captureException
 * vs captureMessage correctly, does it scrub/pass through metadata
 * correctly), not Sentry's own SDK internals, which are Sentry's
 * responsibility to test, not this codebase's.
 */
jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  init: jest.fn(),
}));

describe('logger — webhook error reporter transport', () => {
  const originalEnv = process.env.ERROR_REPORTER_WEBHOOK_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFetch = global.fetch;

  /**
   * Winston's transport dispatch is asynchronous and involves more than
   * one microtask/event-loop hop (the logger's own internal queue, the
   * custom transport's log() method, and that method's own fetch()
   * call) — a single process.nextTick isn't reliably sufficient to
   * wait for all of that to settle. Polls briefly instead of asserting
   * immediately.
   */
  async function waitForCondition(check: () => boolean, timeoutMs = 1000): Promise<void> {
    const start = Date.now();
    while (!check()) {
      if (Date.now() - start > timeoutMs) {
        throw new Error('waitForCondition timed out');
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  beforeEach(() => {
    jest.resetModules();
    process.env.NODE_ENV = 'test'; // ensures DailyRotateFile transports aren't created
  });

  afterEach(() => {
    process.env.ERROR_REPORTER_WEBHOOK_URL = originalEnv;
    process.env.NODE_ENV = originalNodeEnv;
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('does not POST anywhere when ERROR_REPORTER_WEBHOOK_URL is unset (default)', () => {
    delete process.env.ERROR_REPORTER_WEBHOOK_URL;
    const mockFetch = jest.fn();
    global.fetch = mockFetch as any;

    const { logger } = require('../../src/shared/utils/logger');
    logger.error('something broke');

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('POSTs a JSON payload to the configured URL when an error is logged', async () => {
    process.env.ERROR_REPORTER_WEBHOOK_URL = 'https://errors.example.com/ingest';
    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch as any;

    const { logger } = require('../../src/shared/utils/logger');
    logger.error('database connection failed');

    await waitForCondition(() => mockFetch.mock.calls.length > 0);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://errors.example.com/ingest');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(options.body);
    expect(body.level).toBe('error');
    expect(body.message).toBe('database connection failed');
    expect(body.service).toBe('classifieds-backend');
  });

  it('only reports error-level logs, not info/warn', async () => {
    process.env.ERROR_REPORTER_WEBHOOK_URL = 'https://errors.example.com/ingest';
    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch as any;

    const { logger } = require('../../src/shared/utils/logger');
    logger.info('just some info');
    logger.warn('just a warning');

    // Give any (incorrect) dispatch a fair chance to happen before
    // asserting it didn't.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not throw when the webhook itself is unreachable', async () => {
    process.env.ERROR_REPORTER_WEBHOOK_URL = 'https://errors.example.com/ingest';
    const mockFetch = jest.fn().mockRejectedValue(new Error('ENOTFOUND'));
    global.fetch = mockFetch as any;

    const { logger } = require('../../src/shared/utils/logger');

    expect(() => logger.error('this should not throw even if reporting fails')).not.toThrow();
    await waitForCondition(() => mockFetch.mock.calls.length > 0);
  });

  it('includes meta fields (e.g. userId) passed alongside the message', async () => {
    process.env.ERROR_REPORTER_WEBHOOK_URL = 'https://errors.example.com/ingest';
    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch as any;

    const { logger } = require('../../src/shared/utils/logger');
    logger.error('payment failed', { userId: 'user-42', orderId: 'order-7' });

    await waitForCondition(() => mockFetch.mock.calls.length > 0);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.meta).toMatchObject({ userId: 'user-42', orderId: 'order-7' });
  });
});

describe('logger — Sentry error reporter transport', () => {
  const originalDsn = process.env.SENTRY_DSN;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalWebhookUrl = process.env.ERROR_REPORTER_WEBHOOK_URL;

  async function waitForCondition(
    check: () => boolean,
    timeoutMs = 1000,
    describeState?: () => string
  ): Promise<void> {
    const start = Date.now();
    while (!check()) {
      if (Date.now() - start > timeoutMs) {
        // BUGFIX (found while re-verifying this suite): the bare
        // 'waitForCondition timed out' message gives no signal about
        // WHY — whether the mock was never called at all, or called
        // with something the check didn't recognize. Call sites below
        // now pass a describeState callback that dumps the relevant
        // mock's actual call history into the failure message, so a
        // future failure here is diagnosable from CI output alone
        // instead of needing a live debugger.
        const state = describeState ? `\nActual state: ${describeState()}` : '';
        throw new Error(`waitForCondition timed out${state}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
    delete process.env.ERROR_REPORTER_WEBHOOK_URL; // isolate from the webhook transport's own tests above
  });

  afterEach(() => {
    process.env.SENTRY_DSN = originalDsn;
    process.env.NODE_ENV = originalNodeEnv;
    process.env.ERROR_REPORTER_WEBHOOK_URL = originalWebhookUrl;
  });

  it('does not call Sentry at all when SENTRY_DSN is unset (default)', async () => {
    delete process.env.SENTRY_DSN;
    const Sentry = require('@sentry/node');

    const { logger } = require('../../src/shared/utils/logger');
    logger.error('something broke');

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('calls Sentry.captureException with a reconstructed Error when the log has a stack trace', async () => {
    process.env.SENTRY_DSN = 'https://fake-key@o0.ingest.sentry.io/0';
    const Sentry = require('@sentry/node');

    const { logger } = require('../../src/shared/utils/logger');
    logger.error(new Error('database connection failed'));

    await waitForCondition(
      () => (Sentry.captureException as jest.Mock).mock.calls.length > 0,
      1000,
      () =>
        `captureException calls=${(Sentry.captureException as jest.Mock).mock.calls.length}, ` +
        `captureMessage calls=${(Sentry.captureMessage as jest.Mock).mock.calls.length}` +
        ((Sentry.captureMessage as jest.Mock).mock.calls.length > 0
          ? `, captureMessage args=${JSON.stringify((Sentry.captureMessage as jest.Mock).mock.calls[0])}`
          : '')
    );

    const [capturedError] = (Sentry.captureException as jest.Mock).mock.calls[0];
    expect(capturedError).toBeInstanceOf(Error);
    expect(capturedError.message).toBe('database connection failed');
  });

  it('falls back to Sentry.captureMessage for a plain string log with no stack trace', async () => {
    process.env.SENTRY_DSN = 'https://fake-key@o0.ingest.sentry.io/0';
    const Sentry = require('@sentry/node');

    const { logger } = require('../../src/shared/utils/logger');
    // Winston's errors() format only attaches a `stack` field when the
    // logged value is an actual Error instance — a bare string (like
    // most call sites in this codebase pass) has none, so this
    // exercises the captureMessage fallback path specifically.
    logger.error('plain string error message, no Error object');

    await waitForCondition(() => (Sentry.captureMessage as jest.Mock).mock.calls.length > 0);

    const [message, context] = (Sentry.captureMessage as jest.Mock).mock.calls[0];
    expect(message).toBe('plain string error message, no Error object');
    expect(context.level).toBe('error');
  });

  it('FIX APM-04: captures via captureException when the Error is nested in meta.err (the most common call pattern in this codebase, e.g. securityAlert.ts/auditLog.ts)', async () => {
    process.env.SENTRY_DSN = 'https://fake-key@o0.ingest.sentry.io/0';
    const Sentry = require('@sentry/node');

    const { logger } = require('../../src/shared/utils/logger');
    const realError = new Error('Redis connection refused');
    logger.error('Failed to send security alert email', { err: realError, userId: 'user-1' });

    await waitForCondition(() => (Sentry.captureException as jest.Mock).mock.calls.length > 0);

    const [capturedError, context] = (Sentry.captureException as jest.Mock).mock.calls[0];
    expect(capturedError).toBe(realError);
    expect(context.extra).toMatchObject({ userId: 'user-1' });
  });

  it('also detects a nested Error under meta.error (not just meta.err)', async () => {
    process.env.SENTRY_DSN = 'https://fake-key@o0.ingest.sentry.io/0';
    const Sentry = require('@sentry/node');

    const { logger } = require('../../src/shared/utils/logger');
    const realError = new Error('DB write failed');
    logger.error('Something failed', { error: realError });

    await waitForCondition(() => (Sentry.captureException as jest.Mock).mock.calls.length > 0);

    const [capturedError] = (Sentry.captureException as jest.Mock).mock.calls[0];
    expect(capturedError).toBe(realError);
  });

  it('does not call Sentry for info/warn-level logs, only error', async () => {
    process.env.SENTRY_DSN = 'https://fake-key@o0.ingest.sentry.io/0';
    const Sentry = require('@sentry/node');

    const { logger } = require('../../src/shared/utils/logger');
    logger.info('just some info');
    logger.warn('just a warning');

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('passes extra metadata (e.g. userId) through to Sentry as context', async () => {
    process.env.SENTRY_DSN = 'https://fake-key@o0.ingest.sentry.io/0';
    const Sentry = require('@sentry/node');

    const { logger } = require('../../src/shared/utils/logger');
    logger.error('payment failed', { userId: 'user-42', orderId: 'order-7' });

    await waitForCondition(() => (Sentry.captureMessage as jest.Mock).mock.calls.length > 0);

    const [, context] = (Sentry.captureMessage as jest.Mock).mock.calls[0];
    expect(context.extra).toMatchObject({ userId: 'user-42', orderId: 'order-7' });
  });

  it('runs independently of the webhook transport — both can be active at once', async () => {
    process.env.SENTRY_DSN = 'https://fake-key@o0.ingest.sentry.io/0';
    process.env.ERROR_REPORTER_WEBHOOK_URL = 'https://errors.example.com/ingest';
    const Sentry = require('@sentry/node');
    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch as any;

    const { logger } = require('../../src/shared/utils/logger');
    logger.error('needs both destinations');

    await waitForCondition(
      () => mockFetch.mock.calls.length > 0 && (Sentry.captureMessage as jest.Mock).mock.calls.length > 0,
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
  });
});
