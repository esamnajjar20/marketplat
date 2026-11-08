import { beforeEach, describe, expect, it, vi } from 'vitest';

const transport = vi.hoisted(() => ({
  fetch: vi.fn(),
  getApiBaseUrl: vi.fn(() => 'https://api.example.test'),
  refreshAccessTokenForStream: vi.fn(),
}));
vi.mock('expo/fetch', () => ({ fetch: transport.fetch }));
vi.mock('@/api/client', () => ({
  getApiBaseUrl: transport.getApiBaseUrl,
  refreshAccessTokenForStream: transport.refreshAccessTokenForStream,
}));

import { subscribeChatLiveStream } from '../chat-live-stream';

function streamResponse(text: string, status = 200): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { 'content-type': 'text/event-stream' } });
}

const options = (overrides: Partial<Parameters<typeof subscribeChatLiveStream>[0]> = {}) => ({
  token: 'legacy-token',
  getLastEventId: () => null,
  onEvent: vi.fn(),
  onUnsupported: vi.fn(),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  transport.getApiBaseUrl.mockReturnValue('https://api.example.test');
});

describe('authenticated chat live stream', () => {
  it('parses a valid event and forwards its SSE event id', async () => {
    const event = { type: 'message:new', message: { id: 'm1', conversationId: 'c1', senderId: 'u1', body: 'مرحبا', createdAt: '2026-01-01T00:00:00.000Z' } };
    transport.fetch.mockResolvedValueOnce(streamResponse(`id: event-17\nevent: message\ndata: ${JSON.stringify(event)}\n\n`));
    const onEvent = vi.fn();
    const stop = subscribeChatLiveStream(options({ onEvent }));
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'message:new' }), 'event-17'));
    stop();
    expect(transport.fetch).toHaveBeenCalledWith('https://api.example.test/api/v1/notifications/stream', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({ Accept: 'text/event-stream', Authorization: 'Bearer legacy-token' }),
    }));
  });

  it('uses the latest event id when opening the connection', async () => {
    transport.fetch.mockResolvedValueOnce(streamResponse(': heartbeat\n\n'));
    const stop = subscribeChatLiveStream(options({ getLastEventId: () => 'last-acknowledged' }));
    await vi.waitFor(() => expect(transport.fetch).toHaveBeenCalledTimes(1));
    expect(transport.fetch.mock.calls[0][1].headers['Last-Event-ID']).toBe('last-acknowledged');
    stop();
  });

  it('ignores malformed JSON and schema-invalid event payloads', async () => {
    transport.fetch.mockResolvedValueOnce(streamResponse('data: {bad-json}\n\ndata: {"type":"message:new","message":{"id":"missing-required-fields"}}\n\n'));
    const onEvent = vi.fn();
    const stop = subscribeChatLiveStream(options({ onEvent }));
    await vi.waitFor(() => expect(transport.fetch).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    stop();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('refreshes once after 401 and reconnects with the updated access token', async () => {
    let token = 'expired-token';
    transport.fetch
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockImplementationOnce(async (_url: string, init: RequestInit) => {
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer renewed-token');
        return streamResponse('event: connected\ndata: {"type":"connected"}\n\n');
      });
    transport.refreshAccessTokenForStream.mockImplementationOnce(async () => {
      token = 'renewed-token';
      return token;
    });
    const onEvent = vi.fn();
    const stop = subscribeChatLiveStream(options({ getToken: () => token, onEvent }));
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'connected' }), null));
    stop();
    expect(transport.refreshAccessTokenForStream).toHaveBeenCalledTimes(1);
    expect(transport.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not refresh on 403 because it is an authorization decision', async () => {
    transport.fetch.mockResolvedValueOnce(new Response(null, { status: 403 }));
    const onUnsupported = vi.fn();
    const stop = subscribeChatLiveStream(options({ onUnsupported }));
    await vi.waitFor(() => expect(transport.fetch).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    stop();
    expect(transport.refreshAccessTokenForStream).not.toHaveBeenCalled();
    expect(onUnsupported).not.toHaveBeenCalled();
  });

  it.each([404, 405, 501])('signals fallback when stream endpoint returns unsupported status %s', async (status) => {
    transport.fetch.mockResolvedValueOnce(new Response(null, { status }));
    const onUnsupported = vi.fn();
    const stop = subscribeChatLiveStream(options({ onUnsupported }));
    await vi.waitFor(() => expect(onUnsupported).toHaveBeenCalledTimes(1));
    stop();
  });

  it('stops immediately when the caller aborts', async () => {
    const controller = new AbortController();
    transport.fetch.mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    const stop = subscribeChatLiveStream(options({ signal: controller.signal }));
    await vi.waitFor(() => expect(transport.fetch).toHaveBeenCalledTimes(1));
    controller.abort();
    stop();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(transport.fetch).toHaveBeenCalledTimes(1);
  });
});
