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
      return {
        ...old,
        items: [...old.items, message],
        meta: old.meta
          ? { ...old.meta, total: (old.meta.total ?? old.items.length) + 1 }
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

export function useNotificationStream(options?: Options) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const accessToken = useAuthStore(selectAccessToken);
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

    async function connect() {
      if (closed) return;
      // Read the token fresh on every connect/reconnect from the ref,
      // so a rotation mid-stream does not require tearing down.
      const token = accessTokenRef.current;
      if (!token) {
        // Logged out while we were trying to connect — retry on the
        // next auth cycle rather than opening an unauthenticated stream.
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/notifications/stream`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'text/event-stream',
          },
          signal: ac.signal,
          credentials: 'include',
        });
        if (!res.ok || !res.body) {
          throw new Error(`stream HTTP ${res.status}`);
        }
        setConnected(true);
        streamConnected = true;

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
            const dataLines: string[] = [];
            for (const line of lines) {
              if (line.startsWith('event:')) eventName = line.slice(6).trim();
              else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
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

              onEventRef.current?.(payload);
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        setConnected(false);
        streamConnected = false;
        if (!closed && !ac.signal.aborted) {
          retryTimer = setTimeout(connect, 5_000);
        }
        return;
      }
      setConnected(false);
      streamConnected = false;
      if (!closed && !ac.signal.aborted) {
        retryTimer = setTimeout(connect, 3_000);
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
    // SW-SSE-TOKEN-REF-01: only isAuthenticated and queryClient are
    // effect dependencies — accessToken is read via ref inside
    // connect() so a token rotation does not restart the SSE stream.
  }, [isAuthenticated, queryClient]);

  return { connected };
}
