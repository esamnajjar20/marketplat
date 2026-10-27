'use client';


/**
 * Unified live channel (SSE): notifications + chat messages.
 * Uses fetch + ReadableStream so Authorization: Bearer works.
 */

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '@/lib/constants';
import { emitTypingEvent } from '@/lib/typingStore';
import { useAuthStore, selectIsAuthenticated, selectAccessToken, selectUser } from '@/store/auth.store';
import { queryKeys } from '@/lib/queryKeys';
import { subscribeNetworkLifecycle } from '@/lib/networkLifecycle';
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

/** Split complete SSE frames using every line-ending form allowed by the
 * event-stream format (LF, CRLF, or CR), retaining the incomplete tail.
 * Keeping this pure makes framing behavior independently testable.
 */
export function splitSseFrames(buffer: string): { frames: string[]; remainder: string } {
  const frames: string[] = [];
  let frameStart = 0;
  let previousLineEndingStart = -1;
  let previousLineEndingEnd = -1;

  // Scan line endings as tokens rather than a repeated regex group: a CRLF
  // pair is one line ending, not two, and may straddle fetch reader chunks.
  for (let i = 0; i < buffer.length;) {
    const char = buffer[i];
    if (char !== '\r' && char !== '\n') {
      i += 1;
      continue;
    }
    const length = char === '\r' && buffer[i + 1] === '\n' ? 2 : 1;
    if (previousLineEndingEnd === i) {
      frames.push(buffer.slice(frameStart, previousLineEndingStart));
      frameStart = i + length;
      previousLineEndingStart = -1;
      previousLineEndingEnd = -1;
    } else {
      previousLineEndingStart = i;
      previousLineEndingEnd = i + length;
    }
    i += length;
  }
  return { frames, remainder: buffer.slice(frameStart) };
}

/** Module-level flag so message queries can skip aggressive polling. */
let streamConnected = false;
export function isNotificationStreamConnected(): boolean {
  return streamConnected;
}

// Coalesce bursts of message events into one inbox/unread refresh. Without
// this, every SSE event invalidated the full conversation list independently.
// The active visible thread is refreshed once per burst so the backend's
// GET-messages read-receipt side effect still runs without polling constantly.
let conversationRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let pendingConversationIds = new Set<string>();
let pendingUnreadRefresh = false;
let pendingRefreshClient: ReturnType<typeof useQueryClient> | null = null;

function scheduleConversationRefresh(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string,
  refreshUnread = false,
) {
  pendingRefreshClient = queryClient;
  pendingConversationIds.add(conversationId);
  pendingUnreadRefresh ||= refreshUnread;
  if (conversationRefreshTimer) return;

  conversationRefreshTimer = setTimeout(() => {
    conversationRefreshTimer = null;
    const client = pendingRefreshClient;
    const conversationIds = [...pendingConversationIds];
    const shouldRefreshUnread = pendingUnreadRefresh;
    pendingConversationIds = new Set<string>();
    pendingUnreadRefresh = false;
    pendingRefreshClient = null;
    if (!client) return;

    void client.invalidateQueries({ queryKey: queryKeys.conversations.mineRoot() });
    if (shouldRefreshUnread) {
      void client.invalidateQueries({ queryKey: queryKeys.conversations.unreadCount() });
    }

    // GET /messages is the authoritative path that marks recipient messages
    // read. Do that only when the matching conversation is actually visible;
    // background tabs should accumulate unread state instead.
    if (typeof window !== 'undefined' && document.visibilityState === 'visible') {
      const activeConversationId = window.location.pathname.split('/').filter(Boolean).at(-1);
      if (activeConversationId) {
        for (const id of conversationIds) {
          if (id === activeConversationId) {
            void client.invalidateQueries({ queryKey: queryKeys.conversations.messagesRoot(id) });
          }
        }
      }
    }
  }, 500);
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
    { queryKey: queryKeys.conversations.messagesRoot(conversationId) },
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
      // If this server event replaces an optimistic row, the optimistic
      // send already incremented total; do not count the same message twice.
      const replacedOptimistic = withoutOptimistic.length < old.items.length;
      return {
        ...old,
        items: [...withoutOptimistic, message],
        meta: old.meta
          ? {
              ...old.meta,
              total: Math.max(0, (old.meta.total ?? old.items.length) + (replacedOptimistic ? 0 : 1)),
            }
          : old.meta,
      };
    },
  );
  scheduleConversationRefresh(queryClient, conversationId, true);
}

function markDeletedInCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string,
  messageId: string,
  deletedAt: string,
) {
  queryClient.setQueriesData<MessagesPage>(
    { queryKey: queryKeys.conversations.messagesRoot(conversationId) },
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
  scheduleConversationRefresh(queryClient, conversationId);
}

/** Anything the stream may have dropped while we were disconnected → refetch from the API (source of truth). */
function refetchAfterGap(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.mineRoot() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.serviceRequests.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all() });
}

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const SSE_HEARTBEAT_TIMEOUT_MS = 45_000;
// A healthy stream should live longer than the ~30s idle limit observed on
// some hosting paths. Short clean closes still need backoff; otherwise a 200
// response followed by an immediate EOF reconnects forever at the base delay.
const SSE_STABLE_CONNECTION_MS = 25_000;
const SSE_LAST_EVENT_STORAGE_KEY = 'marketplat:sse:last-event-id';

export function useNotificationStream(options?: Options) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const accessToken = useAuthStore(selectAccessToken);
  const userId = useAuthStore(selectUser)?.id ?? null;
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

    const sessionUserId = userId;
    const ac = new AbortController();
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    // Resume point: id of the last event applied. Sent as Last-Event-ID so the
    // server replays what we missed; absent on the very first connect.
    let lastEventId: string | undefined;
    try {
      lastEventId = sessionStorage.getItem(SSE_LAST_EVENT_STORAGE_KEY) ?? undefined;
    } catch {
      lastEventId = undefined;
    }
    let everConnected = false;
    let failures = 0;
    let connectionStartedAt = 0;
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
        connectionStartedAt = Date.now();
        // Reconnect with no resume point (first drop before any id, or after a
        // server restart) cannot be replayed → refetch once to be safe.
        if (everConnected && !lastEventId) refetchAfterGap(queryClient);
        everConnected = true;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!closed) {
          let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
          const heartbeatTimeout = new Promise<never>((_, reject) => {
            heartbeatTimer = setTimeout(() => reject(new Error('SSE heartbeat timeout')), SSE_HEARTBEAT_TIMEOUT_MS);
          });
          let result: ReadableStreamReadResult<Uint8Array>;
          try {
            result = await Promise.race([reader.read(), heartbeatTimeout]);
          } catch (error) {
            await reader.cancel().catch(() => undefined);
            throw error;
          } finally {
            if (heartbeatTimer) clearTimeout(heartbeatTimer);
          }
          const { done, value } = result;
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { frames, remainder } = splitSseFrames(buffer);
          buffer = remainder;
          for (const chunk of frames) {
            const lines = chunk.split(/\r\n|\r|\n/);
            let eventName = 'message';
            let eventId: string | undefined;
            const dataLines: string[] = [];
            for (const line of lines) {
              if (line.startsWith('event:')) eventName = line.slice(6).trim();
              else if (line.startsWith('id:')) eventId = line.slice(3).trim();
              else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
            }
            if (eventName === 'resync') {
              if (useAuthStore.getState().user?.id !== sessionUserId) {
                continue;
              }
              // FIX-F3-RESYNC-01: clear lastEventId; otherwise every reconnect
              // re-sends the same stale id and the server re-emits resync+refetch.
              lastEventId = undefined;
              try { sessionStorage.removeItem(SSE_LAST_EVENT_STORAGE_KEY); } catch { /* storage unavailable */ }
              // Server could not prove the replay was complete → drop caches' trust.
              refetchAfterGap(queryClient);
              continue;
            }
            if (!dataLines.length) continue;
            if (eventName !== 'notification' && eventName !== 'message') continue;

            try {
              // A tab can switch accounts without briefly becoming
              // unauthenticated. Never apply an event from the old SSE
              // connection to the new account's React Query cache.
              if (useAuthStore.getState().user?.id !== sessionUserId) {
                continue;
              }
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
                void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.mineRoot() });
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
                  void queryClient.invalidateQueries({ queryKey: queryKeys.serviceRequests.all() });
                  void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all() });
                }
              }

              // FIX-F1-ORDER-01: advance lastEventId only after the handler
              // succeeds; otherwise a throw silently loses the event forever.
              onEventRef.current?.(payload);
              if (eventId) {
                lastEventId = eventId;
                try { sessionStorage.setItem(SSE_LAST_EVENT_STORAGE_KEY, eventId); } catch { /* storage unavailable */ }
              }
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        setConnected(false);
        streamConnected = false;
        if (!closed && !ac.signal.aborted) {
          // Only reset the failure streak after a genuinely stable connection.
          // A quick HTTP 200 followed by EOF/timeout is not a healthy session.
          if (connectionStartedAt && Date.now() - connectionStartedAt >= SSE_STABLE_CONNECTION_MS) {
            failures = 0;
          }
          failures += 1;
          retryTimer = setTimeout(connect, nextDelay());
        }
        connectionStartedAt = 0;
        return;
      }
      setConnected(false);
      streamConnected = false;
      if (!closed && !ac.signal.aborted) {
        // Some hosting paths close an SSE stream cleanly after a short idle
        // window. Treat a short-lived clean EOF as a reconnect failure too,
        // so we back off instead of creating repeated 1s/2s reconnect loops.
        if (connectionStartedAt && Date.now() - connectionStartedAt >= SSE_STABLE_CONNECTION_MS) {
          failures = 0;
        }
        failures += 1;
        retryTimer = setTimeout(connect, nextDelay());
      }
      connectionStartedAt = 0;
    }

    const onOnline = () => {
      if (!closed && !streamConnected) {
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(connect, 0);
      }
    };
    const unsubscribeNetwork = subscribeNetworkLifecycle((event) => {
      if (event.type === 'online' || event.type === 'resume') onOnline();
    });

    void connect();

    return () => {
      unsubscribeNetwork();
      closed = true;
      ac.abort();
      if (retryTimer) clearTimeout(retryTimer);
      setConnected(false);
      streamConnected = false;
    };
    // SW-SSE-TOKEN-REF-01 + FIX N4-SSE-OFFLINE-BOOT:
    // hasAccessToken (boolean) re-runs the effect when token appears
    // after offline boot, without restarting on every token rotation.
  }, [isAuthenticated, queryClient, hasAccessToken, userId]);

  return { connected };
}
