'use client';

import { useProviderBadges } from '@/hooks/queries/useBadges';
import { Badge } from '@/components/shared/ui/Badge';
import { cn } from '@/lib/utils';
import type { ProviderBadgeType } from '@/types/badge.types';

interface Props {
  providerId: string;
  className?: string;
}

// BADGES: same variant mapping rationale as StoreBadges' own
// BADGE_VARIANT — only VERIFIED (backed by an actual admin
// verification) gets the stronger `default` treatment; the other
// three are computed thresholds and share the neutral `secondary` look.
const BADGE_VARIANT: Record<ProviderBadgeType, 'default' | 'secondary'> = {
  VERIFIED: 'default',
  HIGHLY_RATED: 'secondary',
  POPULAR: 'secondary',
  NEW_PROVIDER: 'secondary',
};

/**
 * BADGES: public, unauthenticated read — computed server-side from
 * data other modules already own (see badges.service.ts's
 * getProviderBadges), no owner control here. Renders nothing while
 * loading/empty, same as StoreBadges, so ServiceProviderHeader's
 * layout doesn't visibly shift while this resolves.
 */
export function ProviderBadges({ providerId, className }: Props) {
  const { data: badges } = useProviderBadges(providerId);

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
