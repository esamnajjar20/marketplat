'use client';


/**
 * Unified live channel (SSE): notifications + chat messages.
 * Uses fetch + ReadableStream so Authorization: Bearer works.
 */

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '@/lib/constants';
import { useAuthStore, selectIsAuthenticated, selectAccessToken } from '@/store/auth.store';
import { queryKeys } from '@/lib/queryKeys';
import type { Message } from '@/types/conversation.types';

export type LiveNotificationPayload = {
  type: 'notification';
  action: 'created' | 'updated' | 'read' | 'deleted';
  notificationId?: string;
  notificationType?: string;
  title?: string;
  body?: string;
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

export type LiveStreamPayload =
  | LiveNotificationPayload
  | LiveMessageNewPayload
  | LiveMessageDeletedPayload;

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
  onEventRef.current = options?.onEvent;

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      setConnected(false);
      streamConnected = false;
      return;
    }

    const ac = new AbortController();
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    async function connect() {
      if (closed) return;
      try {
        const res = await fetch(`${API_BASE_URL}/notifications/stream`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
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
              } else if (payload.type === 'notification') {
                void queryClient.invalidateQueries({ queryKey: ['notifications'] });
                void queryClient.invalidateQueries({
                  queryKey: queryKeys.notifications.unreadCount(),
                });
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
  }, [isAuthenticated, accessToken, queryClient]);

  return { connected };
}
