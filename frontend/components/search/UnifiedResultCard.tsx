'use client';

import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { MapPin, Star, BadgeCheck } from 'lucide-react';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { getListThumbnailUrl, getPlaceholderUrl, isCloudinaryUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import type { SearchResult, SearchResultType } from '@/types/search.types';

interface Props {
  result: SearchResult;
  className?: string;
}

// Small Arabic label + tint per entity type, shown as a corner badge —
// the same "what am I looking at" signal AdCard gives via its
// condition/featured badges, needed here specifically because a mixed
// "الكل" results grid otherwise gives no visual cue which of the four
// entities each card actually is.
const TYPE_BADGE: Record<SearchResultType, { label: string; className: string }> = {
  ad:      { label: 'إعلان', className: 'bg-foreground/75 text-background backdrop-blur-sm' },
  product: { label: 'منتج',  className: 'bg-primary text-primary-foreground shadow-xs' },
  store:   { label: 'محل',   className: 'bg-accent text-accent-foreground shadow-xs' },
  // DESIGN-FIX (audit): was raw bg-emerald-600/90 text-white — the
  // other three badges above already use semantic tokens, and
  // ServiceListingCard.tsx already maps this same green to --success
  // for the identical concept, so this just adopts that existing token
  // instead of a fourth ad-hoc green.
  service: { label: 'خدمة',  className: 'bg-success text-success-foreground shadow-xs' },
};

/**
 * One card shape for all four search-result entities. Mirrors AdCard's
 * layout/interaction (image, hover lift, price line, meta row) so
 * results don't feel like a different product depending on which
 * entity matched — the whole point of the backend normalizing into
 * one SearchResult shape (see search.service.ts's normalizeRow) is
 * that the frontend doesn't need a different card per type either,
 * only a small badge to label which type each result is.
 */
export function UnifiedResultCard({ result, className }: Props) {
  const thumb = result.image ? getListThumbnailUrl(result.image, 400, 280) : PLACEHOLDER_SVG;
  const blurDataURL =
    result.image && isCloudinaryUrl(result.image) ? getPlaceholderUrl(result.image) : undefined;
  const badge = TYPE_BADGE[result.type];
  // TRACK-NEARBY-SEARCH: same m/km formatting convention as
  // ServiceProviderCard.tsx's own distanceLabel — kept identical so a
  // person doesn't see two different distance formats depending on
  // which nearby-search surface they're looking at. null on a plain
  // (non-geo) search, or per-row when that particular result's entity
  // has no lat/lng pin — see SearchResult.distanceKm's own comment.
  const distanceLabel =
    result.distanceKm === null
      ? null
      : result.distanceKm < 1
        ? `${Math.round(result.distanceKm * 1000)} م`
        : `${result.distanceKm.toFixed(1)} كم`;

  return (
    <Link
      href={result.url}
      className={cn(
        'group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        className
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <SafeImage
          src={thumb}
          alt={result.title}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
          loading="lazy"
          {...(blurDataURL && { placeholder: 'blur' as const, blurDataURL })}
        />
        <span
          className={cn(
            'absolute top-2 start-2 rounded-full px-2.5 py-0.5 text-xs font-semibold shadow-sm backdrop-blur-sm',
            badge.className
          )}
        >
          {badge.label}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {result.price !== null && (
          <p className="font-mono text-base font-bold tabular-nums text-primary leading-none">
            {formatPrice(result.price)}
          </p>
        )}
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground">{result.title}</h3>
        <div className="mt-auto flex flex-col gap-1 pt-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {(result.city || distanceLabel) && (
              <span className="flex min-w-0 items-center gap-1">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">
                  {result.city}
                  {result.city && distanceLabel ? ' · ' : ''}
                  {distanceLabel ? (
                    <span className="font-medium text-primary">{distanceLabel}</span>
                  ) : null}
                </span>
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate">{result.seller.name}</span>
              {result.seller.verified && (
                <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="بائع موثّق" />
              )}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {result.rating > 0 && (
                <span className="flex items-center gap-0.5">
                  <Star className="h-3 w-3 fill-rating text-rating" aria-hidden />
                  {result.rating.toFixed(1)}
                </span>
              )}
              <span className="tabular-nums">{formatRelativeTime(result.createdAt)}</span>
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
