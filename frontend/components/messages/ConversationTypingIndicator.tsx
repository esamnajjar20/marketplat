'use client';

import { memo, useEffect, useState } from 'react';
import { onTypingEvent } from '@/lib/typingStore';

interface Props {
  conversationId: string;
  userId?: string;
}

/**
 * Keep transient typing events out of ChatWindow's render tree.
 * Typing can change several times per second; owning this state in the
 * message-list parent would schedule a full conversation render for each
 * event even though no message content changed.
 */
export const ConversationTypingIndicator = memo(function ConversationTypingIndicator({
  conversationId,
  userId,
}: Props) {
  const [typingState, setTypingState] = useState<{ conversationId: string; isTyping: boolean } | null>(null);

  useEffect(() => {
    setTypingState(null);
    let clearTimer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = onTypingEvent((event) => {
      if (event.conversationId !== conversationId || event.userId === userId) return;

      setTypingState({ conversationId, isTyping: event.isTyping });
      if (clearTimer) clearTimeout(clearTimer);
      clearTimer = null;

      if (event.isTyping) {
        clearTimer = setTimeout(() => {
          clearTimer = null;
          setTypingState((current) =>
            current?.conversationId === conversationId
              ? { conversationId, isTyping: false }
              : current,
          );
        }, 4000);
      }
    });

    return () => {
      unsubscribe();
      if (clearTimer) clearTimeout(clearTimer);
    };
  }, [conversationId, userId]);

  if (typingState?.conversationId !== conversationId || !typingState.isTyping) return null;

  return (
    <p aria-live="polite" className="border-t border-border/40 px-4 py-1.5 text-2xs-tight text-muted-foreground">
      يكتب الآن…
    </p>
  );
});
