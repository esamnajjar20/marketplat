/**
 * Cross-tab session boundary signal.
 *
 * Access/refresh tokens are deliberately never sent through this channel.
 * The message only tells sibling tabs that the local session ended and their
 * user-scoped state must be cleared as well.
 */

const CHANNEL_NAME = 'marketplat-auth-session';
const STORAGE_KEY = 'marketplat:auth-session-event';
const EVENT_TYPE = 'SESSION_ENDED';

type SessionEndedEvent = {
  type: typeof EVENT_TYPE;
  userId: string | null;
  nonce: string;
};

function makeNonce(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // fallback below
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function publishSessionEnded(userId: string | null): void {
  if (typeof window === 'undefined') return;
  const event: SessionEndedEvent = {
    type: EVENT_TYPE,
    userId,
    nonce: makeNonce(),
  };

  try {
    const channel = typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel(CHANNEL_NAME)
      : null;
    if (channel) {
      channel.postMessage(event);
      channel.close();
    }
  } catch {
    // localStorage fallback below
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(event));
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode / storage disabled — the current tab still cleans itself.
  }
}

export function subscribeToSessionEnded(
  onSessionEnded: (event: SessionEndedEvent) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;

  let channel: BroadcastChannel | null = null;
  const onMessage = (event: MessageEvent<SessionEndedEvent>) => {
    if (event.data?.type === EVENT_TYPE) onSessionEnded(event.data);
  };

  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.addEventListener('message', onMessage);
    }
  } catch {
    channel = null;
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const parsed = JSON.parse(event.newValue) as SessionEndedEvent;
      if (parsed?.type === EVENT_TYPE) onSessionEnded(parsed);
    } catch {
      // Ignore malformed cross-tab signals.
    }
  };

  window.addEventListener('storage', onStorage);

  return () => {
    channel?.removeEventListener('message', onMessage);
    channel?.close();
    window.removeEventListener('storage', onStorage);
  };
}
