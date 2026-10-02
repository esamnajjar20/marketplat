'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';

export type CardKind = 'ad' | 'product' | 'service';

/**
 * Current time, available only after mount (null on the server and during the
 * first client render) so relative-time labels never cause a hydration mismatch.
 */
export function useNowAfterMount(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
  }, []);
  return now;
}

const KIND_BADGE: Record<CardKind, { label: string; className?: string; accent?: boolean }> = {
  ad: { label: 'إعلان', accent: true },
  product: { label: 'منتج', className: 'bg-emerald-600 text-white hover:bg-emerald-600' },
  service: { label: 'خدمة', className: 'bg-blue-600 text-white hover:bg-blue-600' },
};

/**
 * Type chip for mixed lists (للمخصص لك / الاقتراحات). It lives INSIDE each
 * card's top-start badge stack, so it can never overlap the card's own badges
 * (condition / featured / discount / availability) the way an absolutely
 * positioned wrapper did.
 */
export function CardKindBadge({ kind }: { kind: CardKind }) {
  const cfg = KIND_BADGE[kind];
  return (
    <Badge size="xs" variant={cfg.accent ? 'accent' : 'default'} className={cfg.className}>
      {cfg.label}
    </Badge>
  );
}
