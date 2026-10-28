/**
 * __tests__/unit/lib/errorReporter.test.ts
 *
 * Coverage for lib/errorReporter.ts — the single extension point every
 * error boundary in the app (ErrorBoundary, app/error.tsx,
 * app/global-error.tsx, the ad-detail error.tsx) funnels through.
 *
 * Key behaviors pinned down here:
 *  - Always logs to console first, regardless of whether a reporter URL
 *    is configured (the documented fallback behavior).
 *  - When NEXT_PUBLIC_ERROR_REPORTER_URL is unset, never calls fetch.
 *  - When set, POSTs a JSON payload with message/stack/name/context/
 *    timestamp/service, using keepalive (so it survives a navigation
 *    triggered by the same error).
 *  - Never throws and never rejects even if the reporter endpoint
 *    itself fails — it's fire-and-forget by design.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL_ENV = process.env.NEXT_PUBLIC_ERROR_REPORTER_URL;

async function importFresh() {
  vi.resetModules();
  return import('@/lib/errorReporter');
}

describe('reportClientError', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_ERROR_REPORTER_URL = ORIGINAL_ENV;
  });

  it('always logs to console, even with no reporter URL configured', async () => {
    delete process.env.NEXT_PUBLIC_ERROR_REPORTER_URL;
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { reportClientError } = await importFresh();
    const err = new Error('boom');
    reportClientError(err, { boundary: 'Test' });

    expect(consoleSpy).toHaveBeenCalledWith('[reportClientError]', err, { boundary: 'Test' });
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('does not call fetch when no reporter URL is configured', async () => {
    delete process.env.NEXT_PUBLIC_ERROR_REPORTER_URL;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { reportClientError } = await importFresh();
    reportClientError(new Error('boom'));

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('POSTs a JSON payload with the error details when a reporter URL is configured', async () => {
    process.env.NEXT_PUBLIC_ERROR_REPORTER_URL = 'https://errors.example.com/ingest';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);

    const { reportClientError } = await importFresh();
    const err = new Error('something broke');
    reportClientError(err, { boundary: 'GlobalError', digest: 'abc123' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://errors.example.com/ingest');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.keepalive).toBe(true);

    const body = JSON.parse(options.body);
    expect(body.message).toBe('something broke');
    expect(body.name).toBe('Error');
    expect(body.context).toEqual({ boundary: 'GlobalError', digest: 'abc123' });
    expect(body.service).toBe('marketplace-frontend');
    expect(body.timestamp).toEqual(expect.any(String));

    vi.unstubAllGlobals();
  });

  it('never throws or rejects when the reporter endpoint itself fails', async () => {
    process.env.NEXT_PUBLIC_ERROR_REPORTER_URL = 'https://errors.example.com/ingest';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchSpy = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchSpy);

    const { reportClientError } = await importFresh();

    expect(() => reportClientError(new Error('boom'))).not.toThrow();

    // Let the fire-and-forget .catch() actually run before the test ends.
    await new Promise((resolve) => setTimeout(resolve, 0));

    vi.unstubAllGlobals();
  });
});
