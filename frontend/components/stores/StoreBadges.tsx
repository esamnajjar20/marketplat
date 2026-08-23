'use client';

import { useStoreBadges } from '@/hooks/queries/useBadges';
import { Badge } from '@/components/shared/ui/Badge';
import { cn } from '@/lib/utils';
import type { StoreBadgeType } from '@/types/badge.types';

interface Props {
  storeId: string;
  className?: string;
}

// BADGES: maps each computed badge type to a Badge variant so
// VERIFIED reads distinctly from the others — mirrors PromotionForm's
// STATUS_VARIANTS convention. HIGHLY_RATED/POPULAR/NEW_STORE are all
// "positive but not authoritative" signals, so they share the
// neutral `secondary` treatment; only VERIFIED (backed by an actual
// admin verification, not a computed threshold) gets `default`.
const BADGE_VARIANT: Record<StoreBadgeType, 'default' | 'secondary'> = {
  VERIFIED: 'default',
  HIGHLY_RATED: 'secondary',
  POPULAR: 'secondary',
  NEW_STORE: 'secondary',
};

/**
 * BADGES: public, unauthenticated read — computed server-side from
 * data other modules already own (see badges.service.ts), no owner
 * control here. Renders nothing while loading/empty rather than a
 * skeleton, since badges are a supplementary trust signal, not core
 * content — StoreHeader's layout shouldn't visibly shift while this
 * resolves.
 */
export function StoreBadges({ storeId, className }: Props) {
  const { data: badges } = useStoreBadges(storeId);

  if (!badges || badges.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-1.5', className)}>
      {badges.map((badge) => (
        <Badge key={badge.type} variant={BADGE_VARIANT[badge.type]} className="gap-1 text-xs">
          <span aria-hidden="true">{badge.icon}</span>
          {badge.label}
        </Badge>
      ))}
    </div>
  );
}
