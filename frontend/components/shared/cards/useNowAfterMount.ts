'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { formatRelativeTime } from '@/lib/formatters';

// One shared relative-time scheduler for all cards. The scheduler has one
// browser timer and only notifies a card when its displayed relative-time
// bucket can actually change. Hidden tabs stop the timer and are refreshed
// once when they become visible again.
let nowSnapshot: number | null = null;
const nowListeners = new Map<() => void, { dateStr?: string; lastBucket: string }>();
let nowInitialized = false;
let nowTimer: ReturnType<typeof setInterval> | null = null;
let visibilityHandler: (() => void) | null = null;

function getNowSnapshot(): number | null { return nowSnapshot; }
function getNowServerSnapshot(): number | null { return null; }
const noopSubscribe = (_listener: () => void) => () => {};

function relativeBucket(dateStr: string | undefined, now: number): string {
  if (!dateStr) return String(Math.floor(now / 60_000));
  return formatRelativeTime(dateStr, now);
}

function notifyNow(): void {
  nowSnapshot = Date.now();
  for (const [listener, state] of nowListeners) {
    const nextBucket = relativeBucket(state.dateStr, nowSnapshot);
    if (nextBucket === state.lastBucket) continue;
    state.lastBucket = nextBucket;
    listener();
  }
}

function startNowScheduler(): void {
  if (nowTimer === null && typeof document !== 'undefined' && document.visibilityState !== 'hidden') {
    nowTimer = setInterval(notifyNow, 60_000);
  }
  if (typeof document !== 'undefined' && !visibilityHandler) {
    visibilityHandler = () => {
      if (document.visibilityState === 'hidden') {
        if (nowTimer !== null) {
          clearInterval(nowTimer);
          nowTimer = null;
        }
        return;
      }
      notifyNow();
      if (nowListeners.size > 0 && nowTimer === null) nowTimer = setInterval(notifyNow, 60_000);
    };
    document.addEventListener('visibilitychange', visibilityHandler);
  }
}

function stopNowScheduler(): void {
  if (nowTimer !== null) {
    clearInterval(nowTimer);
    nowTimer = null;
  }
  if (typeof document !== 'undefined' && visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
}

function subscribeToNow(listener: () => void, dateStr?: string): () => void {
  // HYDRATION-SAFE: React calls subscribe() synchronously during the first
  // commit. We must NOT mutate nowSnapshot here (React may have already read
  // getSnapshot() during hydration and any later read must match for the
  // first render to be stable). Defer the initialization to a microtask.
  const isFirstSubscriber = nowListeners.size === 0;
  nowListeners.set(listener, { dateStr, lastBucket: '' });
  if (isFirstSubscriber) {
    queueMicrotask(() => {
      if (nowListeners.size === 0) return;
      if (!nowInitialized) {
        nowInitialized = true;
        nowSnapshot = Date.now();
        startNowScheduler();
      }
      for (const [l, state] of nowListeners) {
        state.lastBucket = relativeBucket(state.dateStr, nowSnapshot ?? Date.now());
        l();
      }
    });
  }

  return () => {
    nowListeners.delete(listener);
    if (nowListeners.size === 0) {
      nowInitialized = false;
      nowSnapshot = null;
      stopNowScheduler();
    }
  };
}

export function useNowAfterMount(enabled: boolean = true, dateStr?: string): number | null {
  const subscribe = useCallback(
    (listener: () => void) => (enabled ? subscribeToNow(listener, dateStr) : noopSubscribe(listener)),
    [enabled, dateStr],
  );
  return useSyncExternalStore(subscribe, getNowSnapshot, getNowServerSnapshot);
}

