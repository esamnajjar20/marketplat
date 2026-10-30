import { requestJsonWithGoFallback } from '../../../src/shared/go-worker/requestJsonWithFallback';

jest.mock('../../../src/shared/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

type Payload = { ok: true; count: number };
const isPayload = (value: unknown): value is Payload =>
  Boolean(
    value &&
      typeof value === 'object' &&
      (value as { ok?: unknown }).ok === true &&
      Number.isSafeInteger((value as { count?: unknown }).count)
  );

describe('requestJsonWithGoFallback', () => {
  const originalUrl = process.env.GO_WORKER_URL;
  const originalToken = process.env.GO_WORKER_TOKEN;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalUrl === undefined) delete process.env.GO_WORKER_URL;
    else process.env.GO_WORKER_URL = originalUrl;
    if (originalToken === undefined) delete process.env.GO_WORKER_TOKEN;
    else process.env.GO_WORKER_TOKEN = originalToken;
  });

  it('runs Express when Go is not configured', async () => {
    delete process.env.GO_WORKER_URL;
    delete process.env.GO_WORKER_TOKEN;
    const fallback = jest.fn().mockResolvedValue({ ok: true, count: 7 });

    const result = await requestJsonWithGoFallback<Payload>({
      jobName: 'test-read',
      path: '/internal/reports/test',
      body: { userId: 'seller-1' },
      validateResult: isPayload,
      runExpressFallback: fallback,
    });

    expect(result).toEqual({ ok: true, count: 7 });
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('returns a valid Go result without invoking Express', async () => {
    process.env.GO_WORKER_URL = 'https://worker.example/';
    process.env.GO_WORKER_TOKEN = 'secret';
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, count: 3 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const fallback = jest.fn().mockResolvedValue({ ok: true, count: 7 });

    const result = await requestJsonWithGoFallback<Payload>({
      jobName: 'test-read',
      path: '/internal/reports/test',
      body: { userId: 'seller-1' },
      validateResult: isPayload,
      runExpressFallback: fallback,
    });

    expect(result).toEqual({ ok: true, count: 3 });
    expect(fallback).not.toHaveBeenCalled();
  });

  it('uses Express when Go returns an invalid successful payload', async () => {
    process.env.GO_WORKER_URL = 'https://worker.example';
    process.env.GO_WORKER_TOKEN = 'secret';
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"ok":true,"count":"3"}', { status: 200 })
    );
    const fallback = jest.fn().mockResolvedValue({ ok: true, count: 7 });

    const result = await requestJsonWithGoFallback<Payload>({
      jobName: 'test-read',
      path: '/internal/reports/test',
      body: { userId: 'seller-1' },
      validateResult: isPayload,
      runExpressFallback: fallback,
    });

    expect(result).toEqual({ ok: true, count: 7 });
    expect(fallback).toHaveBeenCalledTimes(1);
  });
});
