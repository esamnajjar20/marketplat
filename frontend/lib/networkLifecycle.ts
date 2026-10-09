/**
 * Shared browser lifecycle for offline/network-aware features.
 *
 * All consumers share one set of browser listeners. Connectivity events update
 * the stable online snapshot; resume/controller events are delivered to policy
 * consumers so long-suspended tabs can refresh decisions without requiring a
 * synthetic `online` event from the browser.
 */
export type NetworkLifecycleEventType =
  | 'online'
  | 'offline'
  | 'connection-change'
  | 'resume'
  | 'controller-change';

export interface NetworkLifecycleEvent {
  type: NetworkLifecycleEventType;
  online: boolean;
}

type LifecycleListener = (event: NetworkLifecycleEvent) => void;
type OnlineListener = () => void;

const lifecycleListeners = new Set<LifecycleListener>();
const onlineListeners = new Set<OnlineListener>();
let listening = false;
let onlineSnapshot = true;
let activeConnection: EventTarget | null = null;
let activeServiceWorker: ServiceWorkerContainer | null = null;

function readOnline(): boolean {
  return typeof navigator === 'undefined' ? onlineSnapshot : navigator.onLine;
}

function emit(type: NetworkLifecycleEventType, syncOnline = false): void {
  if (syncOnline) {
    const next = readOnline();
    if (next !== onlineSnapshot) {
      onlineSnapshot = next;
      for (const listener of onlineListeners) listener();
    }
  }
  const event = { type, online: onlineSnapshot } satisfies NetworkLifecycleEvent;
  for (const listener of lifecycleListeners) listener(event);
}

function handleOnline(): void {
  const changed = onlineSnapshot !== true;
  onlineSnapshot = true;
  if (changed) for (const listener of onlineListeners) listener();
  emit('online');
}

function handleOffline(): void {
  const changed = onlineSnapshot !== false;
  onlineSnapshot = false;
  if (changed) for (const listener of onlineListeners) listener();
  emit('offline');
}

function handleConnectionChange(): void {
  emit('connection-change', true);
}

function handleResume(): void {
  emit('resume', true);
}

function handleControllerChange(): void {
  emit('controller-change', true);
}

function start(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  // Preserve the SSR snapshot and sync only after React's subscription phase.
  queueMicrotask(() => {
    if (!listening) return;
    const next = readOnline();
    if (next !== onlineSnapshot) {
      onlineSnapshot = next;
      for (const listener of onlineListeners) listener();
    }
  });
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  window.addEventListener('pageshow', handleResume);
  window.addEventListener('focus', handleResume);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', handleResume);

  activeConnection = typeof navigator === 'undefined'
    ? null
    : (navigator as Navigator & { connection?: EventTarget }).connection ?? null;
  activeConnection?.addEventListener('change', handleConnectionChange);
  activeServiceWorker = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    ? navigator.serviceWorker
    : null;
  activeServiceWorker?.addEventListener('controllerchange', handleControllerChange);
}

function stop(): void {
  if (!listening || typeof window === 'undefined') return;
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
  window.removeEventListener('pageshow', handleResume);
  window.removeEventListener('focus', handleResume);
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', handleResume);
  activeConnection?.removeEventListener('change', handleConnectionChange);
  activeServiceWorker?.removeEventListener('controllerchange', handleControllerChange);
  activeConnection = null;
  activeServiceWorker = null;
  listening = false;
}

function ensureStarted(): void {
  if (lifecycleListeners.size + onlineListeners.size > 0) start();
}

function stopIfUnused(): void {
  if (lifecycleListeners.size + onlineListeners.size === 0) stop();
}

export function subscribeNetworkLifecycle(listener: LifecycleListener): () => void {
  lifecycleListeners.add(listener);
  ensureStarted();
  return () => {
    lifecycleListeners.delete(listener);
    stopIfUnused();
  };
}

export function subscribeOnlineStatus(listener: OnlineListener): () => void {
  onlineListeners.add(listener);
  ensureStarted();
  return () => {
    onlineListeners.delete(listener);
    stopIfUnused();
  };
}

export function getOnlineSnapshot(): boolean {
  return onlineSnapshot;
}

export function getServerOnlineSnapshot(): boolean {
  return true;
}
