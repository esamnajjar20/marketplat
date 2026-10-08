'use client';

import { useSyncExternalStore } from 'react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { Badge } from '@/components/ui/badge';

export type CardContext = 'public' | 'favorites' | 'store' | 'owner' | 'related' | 'featured' | 'catalog';
export type CardKind = 'ad' | 'product' | 'service';

// One shared post-mount timestamp for all cards. The previous implementation
// created one state/effect pair per card and therefore caused N post-mount
// state updates for N mounted cards. The external snapshot preserves the
// existing SSR contract while notifying all consumers once.
let nowSnapshot: number | null = null;
const nowListeners = new Set<() => void>();
let nowInitialized = false;
let nowTimer: ReturnType<typeof setInterval> | null = null;

function getNowSnapshot(): number | null { return nowSnapshot; }
function getNowServerSnapshot(): number | null { return null; }
const noopSubscribe = (_listener: () => void) => () => {};

function notifyNow(): void {
  nowSnapshot = Date.now();
  for (const subscriber of nowListeners) subscriber();
}

function subscribeToNow(listener: () => void): () => void {
  nowListeners.add(listener);
  if (!nowInitialized) {
    nowInitialized = true;
    nowSnapshot = Date.now();
    // Relative-time labels need to advance while the page stays open, but
    // minute-level precision is sufficient and avoids per-card timers.
    nowTimer = setInterval(notifyNow, 60_000);
    listener();
  }
  return () => {
    nowListeners.delete(listener);
    if (nowListeners.size === 0) {
      nowInitialized = false;
      nowSnapshot = null;
      if (nowTimer !== null) {
        clearInterval(nowTimer);
        nowTimer = null;
      }
    }
  };
}

export function useNowAfterMount(enabled: boolean = true): number | null {
  return useSyncExternalStore(
    enabled ? subscribeToNow : noopSubscribe,
    enabled ? getNowSnapshot : getNowServerSnapshot,
    getNowServerSnapshot,
  );
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
