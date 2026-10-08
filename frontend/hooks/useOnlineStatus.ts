'use client';

import { useSyncExternalStore } from 'react';

type Listener = () => void;

/**
 * Browser connectivity is a singleton external signal.
 *
 * Before this implementation every useOnlineStatus() instance created its own
 * React state and its own `online`/`offline` DOM listeners. That is especially
 * expensive in card/list UIs where the hook can be mounted dozens of times.
 *
 * The public hook API stays unchanged, but the browser is now subscribed only
 * while at least one React consumer exists. React consumers subscribe to the
 * singleton store through useSyncExternalStore, which is the correct React 19
 * primitive for external browser state and keeps the server snapshot stable.
 */
const listeners = new Set<Listener>();
let listening = false;

// Keep the historical SSR/hydration contract: the first render is optimistic
// (`true`) and the real browser value is synchronized when the first consumer
// subscribes after commit. This avoids reading navigator during SSR/render.
let snapshot = true;

function getSnapshot(): boolean {
  return snapshot;
}

function getServerSnapshot(): boolean {
  return true;
}

function notify(next: boolean): void {
  if (next === snapshot) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

function syncFromBrowser(): void {
  if (typeof navigator === 'undefined') return;
  notify(navigator.onLine);
}

function handleOnline(): void {
  notify(true);
}

function handleOffline(): void {
  notify(false);
}

function startListening(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  // HYDRATION-SAFE: defer browser sync to a microtask so the first client
  // render matches the SSR snapshot (true). Calling syncFromBrowser()
  // synchronously here would change the snapshot during React's subscribe
  // phase and trigger React #418 when navigator.onLine === false at hydration.
  queueMicrotask(() => {
    if (!listening) return;
    syncFromBrowser();
  });
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
}

function stopListening(): void {
  if (!listening || typeof window === 'undefined') return;
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
  listening = false;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (listeners.size === 1) startListening();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopListening();
  };
}

/**
 * Returns the current browser connectivity state.
 *
 * Multiple consumers share one underlying pair of browser event listeners.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
