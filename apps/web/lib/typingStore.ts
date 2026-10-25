/** Ephemeral typing signals from SSE — no persistence. */

export type TypingPayload = {
  conversationId: string;
  userId: string;
  isTyping: boolean;
};

type Listener = (payload: TypingPayload) => void;

const listeners = new Set<Listener>();

export function emitTypingEvent(payload: TypingPayload): void {
  listeners.forEach((l) => {
    try {
      l(payload);
    } catch {
      /* ignore */
    }
  });
}

export function onTypingEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
