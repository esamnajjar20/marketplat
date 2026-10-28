'use client';
import { HydrationSafeRelativeTime } from '@/components/shared/HydrationSafeRelativeTime';

import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Badge } from '@/components/ui/badge';
import { MapPin, Star, BadgeCheck, Eye } from 'lucide-react';
import { formatPrice } from '@/lib/formatters';
import {
  getListThumbnailUrl,
  getPlaceholderUrl,
  isCloudinaryUrl,
  PLACEHOLDER_SVG,
} from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import { CARD_FOCUS, CARD_HOVER, CARD_PRESS, CARD_SHELL, CARD_IMAGE_43, CARD_BODY_DEFAULT } from '@/components/shared/cards/cardTokens';
import { formatDistanceKm } from '@/lib/distance';
import type { SearchResult, SearchResultType } from '@/types/search.types';

interface Props {
  result: SearchResult;
  className?: string;
  layout?: 'grid' | 'list';
}

const TYPE_BADGE: Record<
  SearchResultType,
  { label: string; variant: 'overlay' | 'default' | 'accent' | 'success' }
> = {
  ad: { label: 'إعلان', variant: 'overlay' },
  product: { label: 'منتج', variant: 'default' },
  store: { label: 'محل', variant: 'accent' },
  service: { label: 'خدمة', variant: 'success' },
};

/**
 * Unified search result card — aligned with AdCard (Badge + typography scale).
 */
export function UnifiedResultCard({ result, className, layout = 'grid' }: Props) {
  const isList = layout === 'list';
  const thumb = result.image
    ? getListThumbnailUrl(result.image, 400, 280)
    : PLACEHOLDER_SVG;
  const blurDataURL =
    result.image && isCloudinaryUrl(result.image)
      ? getPlaceholderUrl(result.image)
      : undefined;
  const badge = TYPE_BADGE[result.type];
  const distanceLabel = formatDistanceKm(result.distanceKm);

  return (
    <div
      className={cn(
        'group/card relative isolate z-0 h-full min-w-0 hover:z-10',
      )}
    >
      <Link
        href={result.url}
        prefetch={false}
        className={cn(
          CARD_SHELL,
          'flex',
          isList ? 'flex-row items-stretch' : 'flex-col',
          CARD_HOVER,
          CARD_PRESS,
          CARD_FOCUS,
          className,
        )}
      >
        <div className={cn('relative overflow-hidden bg-muted', isList ? 'aspect-auto h-24 w-24 shrink-0 sm:h-32 sm:w-40' : CARD_IMAGE_43)}>
          <SafeImage
            src={thumb}
            alt={result.title}
            fill
            className="object-cover transition-transform duration-400 ease-out group-hover/card:scale-[1.04]"
            sizes={isList ? '(max-width: 640px) 96px, 160px' : '(max-width:640px) 50vw, (max-width:1024px) 50vw, 33vw'}
            loading="lazy"
            {...(blurDataURL && { placeholder: 'blur' as const, blurDataURL })}
          />

          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/20 to-transparent"
            aria-hidden
          />

          <Badge
            size="xs"
            variant={badge.variant}
            className="absolute top-2 start-2 z-[1]"
          >
            {badge.label}
          </Badge>
        </div>

        <div className={cn(CARD_BODY_DEFAULT, 'min-w-0', isList && 'sm:gap-2')}>
          {result.price !== null && (
            <p className="font-mono text-base font-bold leading-none tracking-tight text-primary tabular-nums sm:text-xl">
              {formatPrice(result.price)}
            </p>
          )}
          <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground sm:text-card-title" title={result.title}>
            {result.title}
          </h3>

          <div className={cn('mt-auto flex min-w-0 flex-col gap-1.5 border-t border-border/40 pt-2', isList && 'sm:flex-row sm:flex-wrap sm:items-center sm:justify-between')}>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {(result.city || distanceLabel) && (
                <span className="flex min-w-0 items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                  {result.city && <span className="truncate">{result.city}</span>}
                  {distanceLabel && (
                    <span className="shrink-0 font-medium text-primary">
                      {result.city ? '· ' : ''}
                      {distanceLabel}
                    </span>
                  )}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 text-2xs text-muted-foreground sm:text-xs">
              <span className="flex min-w-0 items-center gap-1">
                <span className="truncate">{result.seller.name}</span>
                {result.seller.verified && (
                  <BadgeCheck
                    className="h-3.5 w-3.5 shrink-0 text-primary"
                    aria-label="بائع موثّق"
                  />
                )}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {result.rating > 0 && (
                  <span className="flex items-center gap-0.5">
                    <Star className="h-3 w-3 fill-rating text-rating" aria-hidden />
                    {result.rating.toFixed(1)}
                  </span>
                )}
                {result.type !== 'store' && (
                  <span className="flex items-center gap-0.5 opacity-80">
                    <Eye className="h-3 w-3" aria-hidden />
                    <span>{result.views}</span>
                  </span>
                )}
                <span className="font-medium tabular-nums">
                  {<HydrationSafeRelativeTime date={result.createdAt} />}
                </span>
              </span>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
