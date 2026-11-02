import { requestJsonWithGoIdempotentFallback } from '../../../src/shared/go-worker/requestJsonWithIdempotentFallback';

jest.mock('../../../src/shared/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

type Payload = { accepted: number };
const isPayload = (value: unknown): value is Payload =>
  Boolean(value && typeof value === 'object' && Number.isSafeInteger((value as { accepted?: unknown }).accepted));

describe('requestJsonWithGoIdempotentFallback', () => {
  const originalUrl = process.env.GO_WORKER_URL;
  const originalToken = process.env.GO_WORKER_TOKEN;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalUrl === undefined) delete process.env.GO_WORKER_URL;
    else process.env.GO_WORKER_URL = originalUrl;
    if (originalToken === undefined) delete process.env.GO_WORKER_TOKEN;
    else process.env.GO_WORKER_TOKEN = originalToken;
  });

  it('requires a stable idempotency key', async () => {
    await expect(requestJsonWithGoIdempotentFallback({
      jobName: 'analytics-ingest',
      path: '/internal/analytics/events',
      body: { events: [] },
      idempotencyKey: ' ',
      validateResult: isPayload,
      runExpressFallback: async () => ({ accepted: 0 }),
    })).rejects.toThrow('idempotency key');
  });

  it('sends the idempotency key to Go and avoids fallback on a valid result', async () => {
    process.env.GO_WORKER_URL = 'https://worker.example/';
    process.env.GO_WORKER_TOKEN = 'secret';
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ accepted: 2 }), { status: 202 })
    );
    const fallback = jest.fn(async () => ({ accepted: 0 }));

    const result = await requestJsonWithGoIdempotentFallback({
      jobName: 'analytics-ingest',
      path: '/internal/analytics/events',
      body: { events: [{ eventId: 'evt-1' }] },
      idempotencyKey: 'batch-evt-1',
      validateResult: isPayload,
      runExpressFallback: fallback,
    });

    expect(result).toEqual({ accepted: 2 });
    expect(fetchMock).toHaveBeenCalledWith('https://worker.example/internal/analytics/events', expect.objectContaining({
      headers: expect.objectContaining({ 'Idempotency-Key': 'batch-evt-1' }),
    }));
    expect(fallback).not.toHaveBeenCalled();
  });

  it('uses Express exactly once when Go fails', async () => {
    process.env.GO_WORKER_URL = 'https://worker.example';
    process.env.GO_WORKER_TOKEN = 'secret';
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const fallback = jest.fn(async () => ({ accepted: 1 }));

    const result = await requestJsonWithGoIdempotentFallback({
      jobName: 'analytics-ingest',
      path: '/internal/analytics/events',
      body: { events: [{ eventId: 'evt-1' }] },
      idempotencyKey: 'batch-evt-1',
      validateResult: isPayload,
      runExpressFallback: fallback,
    });

    expect(result).toEqual({ accepted: 1 });
    expect(fallback).toHaveBeenCalledTimes(1);
  });
});
