import { getApiBaseUrl } from '@/api/client';

export type ChatLiveEvent = {
  type: 'message:new' | 'message:deleted' | 'typing' | 'notification' | 'resync' | 'connected' | string;
  conversationId?: string;
  message?: {
    id: string;
    conversationId: string;
    senderId: string;
    body?: string | null;
    imageUrl?: string | null;
    audioUrl?: string | null;
    fileUrl?: string | null;
    createdAt: string;
    readAt?: string | null;
    deletedAt?: string | null;
  };
  messageId?: string;
  deletedAt?: string;
  userId?: string;
  isTyping?: boolean;
};

export type ChatLiveStreamOptions = {
  token: string;
  getLastEventId: () => string | null;
  onEvent: (event: ChatLiveEvent, eventId: string | null) => void;
  /** Called only when the platform cannot consume a stream or the endpoint is unsupported. */
  onUnsupported: () => void;
  signal?: AbortSignal;
};

function wait(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise(resolve => {
    if (signal.aborted) return resolve(false);
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve(true);
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      resolve(false);
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

function parseFrame(frame: string): { eventName: string; id: string | null; data: string } | null {
  let eventName = 'message';
  let id: string | null = null;
  const data: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') eventName = value || 'message';
    else if (field === 'id' && !value.includes('\0')) id = value;
    else if (field === 'data') data.push(value);
  }
  if (!data.length) return null;
  return { eventName, id, data: data.join('\n') };
}

/**
 * Authenticated, resumable SSE connection to the existing unified notification/chat stream.
 * It reconnects with Last-Event-ID and bounded backoff; it never writes to the database.
 */
export function subscribeChatLiveStream(options: ChatLiveStreamOptions): () => void {
  const outer = new AbortController();
  let stopped = false;
  let activeRequest: AbortController | null = null;
  const abortOuter = () => outer.abort();
  options.signal?.addEventListener('abort', abortOuter, { once: true });

  const run = async () => {
    let failures = 0;
    while (!stopped && !outer.signal.aborted) {
      const baseUrl = getApiBaseUrl();
      if (!baseUrl) {
        // Configuration is missing; periodic fallback requests would only add noise.
        stopped = true;
        return;
      }
      const controller = new AbortController();
      activeRequest = controller;
      const abortCurrent = () => controller.abort();
      outer.signal.addEventListener('abort', abortCurrent, { once: true });
      try {
        const lastEventId = options.getLastEventId();
        const response = await fetch(`${baseUrl}/api/v1/notifications/stream`, {
          method: 'GET',
          headers: {
            Accept: 'text/event-stream',
            Authorization: `Bearer ${options.token}`,
            ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}),
          },
          signal: controller.signal,
        });

        if (response.status === 404 || response.status === 405 || response.status === 501) {
          stopped = true;
          options.onUnsupported();
          return;
        }
        if (response.status === 401 || response.status === 403) {
          // Do not spin or fall back to periodic authenticated queries on an expired session.
          stopped = true;
          return;
        }
        if (!response.ok) throw new Error(`SSE request failed (${response.status})`);
        const body = response.body as ReadableStream<Uint8Array> | null | undefined;
        if (!body || typeof body.getReader !== 'function') {
          try { await response.body?.cancel(); } catch { /* best effort */ }
          stopped = true;
          options.onUnsupported();
          return;
        }

        failures = 0;
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
          while (!stopped && !outer.signal.aborted) {
            const chunk = await reader.read();
            if (chunk.done) break;
            buffer += decoder.decode(chunk.value, { stream: true });
            let boundary = buffer.search(/\r?\n\r?\n/);
            while (boundary >= 0) {
              const frame = buffer.slice(0, boundary);
              const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0] ?? '\n\n';
              buffer = buffer.slice(boundary + separator.length);
              const parsed = parseFrame(frame);
              if (parsed) {
                let payload: unknown;
                try { payload = JSON.parse(parsed.data); } catch { payload = null; }
                if (payload && typeof payload === 'object') {
                  const event = payload as ChatLiveEvent;
                  if (parsed.eventName === 'resync') event.type = 'resync';
                  if (parsed.eventName === 'connected') event.type = 'connected';
                  if (parsed.id) options.onEvent(event, parsed.id);
                  else options.onEvent(event, null);
                }
              }
              boundary = buffer.search(/\r?\n\r?\n/);
            }
          }
        } finally {
          try { await reader.cancel(); } catch { /* connection already closed */ }
        }
        if (!stopped && !outer.signal.aborted) throw new Error('SSE stream closed');
      } catch {
        if (stopped || outer.signal.aborted) return;
        failures += 1;
      } finally {
        outer.signal.removeEventListener('abort', abortCurrent);
        if (activeRequest === controller) activeRequest = null;
      }
      const delay = Math.min(30_000, 1_000 * (2 ** Math.min(failures, 5)));
      if (!(await wait(delay, outer.signal))) return;
    }
  };

  void run();
  return () => {
    stopped = true;
    options.signal?.removeEventListener('abort', abortOuter);
    outer.abort();
    activeRequest?.abort();
  };
}
