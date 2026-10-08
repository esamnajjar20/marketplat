'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime } from '@/lib/formatters';

export type CardContext = 'public' | 'favorites' | 'store' | 'owner' | 'related' | 'featured' | 'catalog';
export type CardKind = 'ad' | 'product' | 'service';

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
  nowListeners.set(listener, { dateStr, lastBucket: relativeBucket(dateStr, Date.now()) });
  if (!nowInitialized) {
    nowInitialized = true;
    nowSnapshot = Date.now();
    startNowScheduler();
  }
  listener();

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

const KIND_BADGE: Record<CardKind, { label: string; className?: string; accent?: boolean }> = {
  ad: { label: 'إعلان', accent: true },
  product: { label: 'منتج', className: 'bg-cat-product text-white hover:bg-cat-product' },
  service: { label: 'خدمة', className: 'bg-cat-service text-white hover:bg-cat-service' },
};

export function CardKindBadge({ kind }: { kind: CardKind }) {
  const cfg = KIND_BADGE[kind];
  return <Badge size="xs" variant={cfg.accent ? 'accent' : 'default'} className={cfg.className}>{cfg.label}</Badge>;
}

export function CardOfflineBadgeView({ isOnline }: { isOnline: boolean }) {
  if (isOnline) return null;
  return <Badge size="xs" variant="overlay" className="absolute bottom-2 start-2 z-10">محفوظ محلي</Badge>;
}

export function CardOfflineBadge() {
  return <CardOfflineBadgeView isOnline={useOnlineStatus()} />;
}

export const CARD_GRID_CLASS = 'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4';
export const RELATED_CARD_GRID_CLASS = 'grid grid-cols-2 gap-3 sm:gap-4';
export const CARD_SECTION_CLASS = 'grid min-w-0 auto-rows-fr';
