'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';

export type CardContext = 'public' | 'favorites' | 'store' | 'owner' | 'related' | 'featured' | 'catalog';
export type CardKind = 'ad' | 'product' | 'service';

export function useNowAfterMount(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);
  return now;
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

export function CardOfflineBadge() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);
  if (!offline) return null;
  return <Badge size="xs" variant="overlay" className="absolute bottom-2 start-2 z-10">محفوظ محلي</Badge>;
}

export const CARD_GRID_CLASS = 'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4';
export const RELATED_CARD_GRID_CLASS = 'grid grid-cols-2 gap-3 sm:gap-4';
export const CARD_SECTION_CLASS = 'grid min-w-0 auto-rows-fr';
