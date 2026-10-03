'use client';


/**
 * Unified live channel (SSE): notifications + chat messages.
 * Uses fetch + ReadableStream so Authorization: Bearer works.
 */

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '@/lib/constants';
import { emitTypingEvent } from '@/lib/typingStore';
import { useAuthStore, selectIsAuthenticated, selectAccessToken } from '@/store/auth.store';
import { queryKeys } from '@/lib/queryKeys';
import type { Message } from '@/types/conversation.types';
import type { NotificationData } from '@/types/notification.types';

export type LiveNotificationPayload = {
  type: 'notification';
  action: 'created' | 'updated' | 'read' | 'deleted';
  notificationId?: string;
  notificationType?: string;
  title?: string;
  body?: string;
  /** Per-type ids for deep links (see lib/notificationMeta.ts hrefFor). */
  data?: NotificationData | null;
};

export type LiveMessageNewPayload = {
  type: 'message:new';
  conversationId: string;
  message: Message;
};

export type LiveMessageDeletedPayload = {
  type: 'message:deleted';
  conversationId: string;
  messageId: string;
  deletedAt: string;
};

export type LiveTypingPayload = {
  type: 'typing';
  conversationId: string;
  userId: string;
  isTyping: boolean;
};

export type LiveStreamPayload =
  | LiveNotificationPayload
  | LiveMessageNewPayload
  | LiveMessageDeletedPayload
  | LiveTypingPayload;

type Options = {
  onEvent?: (event: LiveStreamPayload) => void;
};

/** Module-level flag so message queries can skip aggressive polling. */
let streamConnected = false;
export function isNotificationStreamConnected(): boolean {
  return streamConnected;
}

type MessagesPage = {
  items: Message[];
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
};

function appendMessageToCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string,
  message: Message,
) {
  queryClient.setQueriesData<MessagesPage>(
    { queryKey: ['conversations', 'detail', conversationId, 'messages'] },
    (old) => {
      if (!old?.items) return old;
      if (old.items.some((m) => m.id === message.id)) return old;
      // FIX CHAT-OPTIMISTIC-SSE-DUP-01: drop matching optimistic rows so
      // SSE-first delivery does not leave optimistic-* + server id both
      // visible until the next invalidate.
      const withoutOptimistic = old.items.filter((m) => {
        if (!m.id.startsWith('optimistic-')) return true;
        if (m.senderId !== message.senderId) return true;
        const sameBody = (m.body || '') === (message.body || '');
        const sameImage =
          (m.imageUrl || null) === (message.imageUrl || null);
        return !(sameBody && sameImage);
      });
      return {
        ...old,
        items: [...withoutOptimistic, message],
        meta: old.meta
          ? { ...old.meta, total: (old.meta.total ?? withoutOptimistic.length) + 1 }
          : old.meta,
      };
    },
  );
  void queryClient.invalidateQueries({ queryKey: ['conversations', 'me'] });
}

function markDeletedInCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string,
  messageId: string,
  deletedAt: string,
) {
  queryClient.setQueriesData<MessagesPage>(
    { queryKey: ['conversations', 'detail', conversationId, 'messages'] },
    (old) => {
      if (!old?.items) return old;
      return {
        ...old,
        items: old.items.map((m) =>
          m.id === messageId ? { ...m, body: '', deletedAt } : m,
        ),
      };
    },
  );
}

/** Anything the stream may have dropped while we were disconnected → refetch from the API (source of truth). */
function refetchAfterGap(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount() });
  void queryClient.invalidateQueries({ queryKey: ['conversations'] });
  void queryClient.invalidateQueries({ queryKey: ['service-requests'] });
  void queryClient.invalidateQueries({ queryKey: ['appointments'] });
}

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export function useNotificationStream(options?: Options) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const accessToken = useAuthStore(selectAccessToken);
  // FIX N4: boolean presence only — avoids SSE restart on every refresh rotation.
  const hasAccessToken = Boolean(accessToken);
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(options?.onEvent);
  const accessTokenRef = useRef(accessToken);
  const isAuthenticatedRef = useRef(isAuthenticated);

  // SW-SSE-TOKEN-REF-01: keep the refs fresh without triggering the
  // SSE effect. The connection itself only cares about "is this user
  // logged in at all" — not which specific access token is currently
  // in the store. Reading the token from a ref on the retry tick lets
  // the same connection survive every 14-minute rotation of the access
  // token, which previously tore down the SSE stream and re-established
  // it (a 1-3 second window of missed events, six times an hour).
  useEffect(() => {
    onEventRef.current = options?.onEvent;
  }, [options?.onEvent]);

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setConnected(false);
      streamConnected = false;
      return;
    }

    const ac = new AbortController();
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    // Resume point: id of the last event applied. Sent as Last-Event-ID so the
    // server replays what we missed; absent on the very first connect.
    let lastEventId: string | undefined;
    let everConnected = false;
    let failures = 0;
    const nextDelay = () =>
      Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.min(failures, 5)) *
      (0.75 + Math.random() * 0.5); // jitter: don't reconnect a whole fleet in lockstep

    async function connect() {
      if (closed) return;
      // Read the token fresh on every connect/reconnect from the ref,
      // so a rotation mid-stream does not require tearing down.
      const token = accessTokenRef.current;
      if (!token) {
        // FIX N4-SSE-OFFLINE-BOOT: app may start offline with
        // isAuthenticated=true and accessToken='' (auth.store
        // onRehydrateStorage). Previously we returned with no timer, so
        // when the real token arrived the effect did not re-run (deps
        // are only isAuthenticated + queryClient). Schedule a soft
        // retry so connect picks up the token after AuthHydration
        // finishes without requiring a full page reload.
        if (!closed && isAuthenticatedRef.current) {
          retryTimer = setTimeout(connect, nextDelay());
        }
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/notifications/stream`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'text/event-stream',
            ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}),
          },
          signal: ac.signal,
          credentials: 'include',
        });
        if (!res.ok || !res.body) {
          throw new Error(`stream HTTP ${res.status}`);
        }
        setConnected(true);
        streamConnected = true;
        failures = 0;
        // Reconnect with no resume point (first drop before any id, or after a
        // server restart) cannot be replayed → refetch once to be safe.
        if (everConnected && !lastEventId) refetchAfterGap(queryClient);
        everConnected = true;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!closed) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split('\n\n');
          buffer = chunks.pop() ?? '';
          for (const chunk of chunks) {
            const lines = chunk.split('\n');
            let eventName = 'message';
            let eventId: string | undefined;
            const dataLines: string[] = [];
            for (const line of lines) {
              if (line.startsWith('event:')) eventName = line.slice(6).trim();
              else if (line.startsWith('id:')) eventId = line.slice(3).trim();
              else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
            }
            if (eventName === 'resync') {
              // FIX-F3-RESYNC-01: clear lastEventId; otherwise every reconnect
              // re-sends the same stale id and the server re-emits resync+refetch.
              lastEventId = undefined;
              // Server could not prove the replay was complete → drop caches' trust.
              refetchAfterGap(queryClient);
              continue;
            }
            if (!dataLines.length) continue;
            if (eventName !== 'notification' && eventName !== 'message') continue;

            try {
              const payload = JSON.parse(dataLines.join('\n')) as LiveStreamPayload;

              if (payload.type === 'message:new') {
                appendMessageToCaches(queryClient, payload.conversationId, payload.message);
              } else if (payload.type === 'message:deleted') {
                markDeletedInCaches(
                  queryClient,
                  payload.conversationId,
                  payload.messageId,
                  payload.deletedAt,
                );
              } else if (payload.type === 'typing') {
                emitTypingEvent({
                  conversationId: payload.conversationId,
                  userId: payload.userId,
                  isTyping: payload.isTyping,
                });
              } else if (payload.type === 'notification') {
                void queryClient.invalidateQueries({ queryKey: ['notifications'] });
                void queryClient.invalidateQueries({
                  queryKey: queryKeys.notifications.unreadCount(),
                });
                // Service-request / appointment notifications mean the
                // request page or the lists behind it are now stale —
                // refresh them so an open page updates without waiting
                // for a manual reload.
                if (
                  payload.notificationType === 'SERVICE_REQUEST_NEW' ||
                  payload.notificationType === 'SERVICE_REQUEST_UPDATE' ||
                  payload.notificationType === 'APPOINTMENT_UPDATE'
                ) {
                  void queryClient.invalidateQueries({ queryKey: ['service-requests'] });
                  void queryClient.invalidateQueries({ queryKey: ['appointments'] });
                }
              }

              // FIX-F1-ORDER-01: advance lastEventId only after the handler
              // succeeds; otherwise a throw silently loses the event forever.
              onEventRef.current?.(payload);
              if (eventId) lastEventId = eventId;
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        setConnected(false);
        streamConnected = false;
        if (!closed && !ac.signal.aborted) {
          failures += 1;
          retryTimer = setTimeout(connect, nextDelay());
        }
        return;
      }
      setConnected(false);
      streamConnected = false;
      if (!closed && !ac.signal.aborted) {
        // FIX-F2-CLEANEND-01: a clean end is not a failure — do NOT grow the
        // backoff. Render Free cuts idle SSE every ~30-60s; counting those as
        // failures pushed every reconnect to the 30s cap within an hour.
        retryTimer = setTimeout(connect, nextDelay());
      }
    }

    void connect();

    return () => {
      closed = true;
      ac.abort();
      if (retryTimer) clearTimeout(retryTimer);
      setConnected(false);
      streamConnected = false;
    };
    // SW-SSE-TOKEN-REF-01 + FIX N4-SSE-OFFLINE-BOOT:
    // hasAccessToken (boolean) re-runs the effect when token appears
    // after offline boot, without restarting on every token rotation.
  }, [isAuthenticated, queryClient, hasAccessToken]);

  return { connected };
}
