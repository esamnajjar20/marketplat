'use client';

import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { MapPin, Star, BadgeCheck, Eye } from 'lucide-react';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { getListThumbnailUrl, getPlaceholderUrl, isCloudinaryUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import { formatDistanceKm } from '@/lib/distance';
import type { SearchResult, SearchResultType } from '@/types/search.types';

interface Props {
  result: SearchResult;
  className?: string;
}

const TYPE_BADGE: Record<SearchResultType, { label: string; className: string }> = {
  ad:      { label: 'إعلان', className: 'bg-foreground/80 text-background backdrop-blur-md' },
  product: { label: 'منتج',  className: 'bg-primary text-primary-foreground shadow-sm' },
  store:   { label: 'محل',   className: 'bg-accent text-accent-foreground shadow-sm' },
  service: { label: 'خدمة',  className: 'bg-success text-success-foreground shadow-sm' },
};

/**
 * Unified search result card — matches dedicated cards; type badge top-start only.
 */
export function UnifiedResultCard({ result, className }: Props) {
  const thumb = result.image ? getListThumbnailUrl(result.image, 400, 280) : PLACEHOLDER_SVG;
  const blurDataURL =
    result.image && isCloudinaryUrl(result.image) ? getPlaceholderUrl(result.image) : undefined;
  const badge = TYPE_BADGE[result.type];
  const distanceLabel = formatDistanceKm(result.distanceKm);

  return (
    <div
      className={cn(
        'group/card relative isolate z-0 h-full',
        'transition-transform duration-200 ease-out',
        'hover:z-10 hover:-translate-y-0.5',
      )}
    >
      <Link
        href={result.url}
        prefetch={false}
        className={cn(
          'flex h-full flex-col overflow-hidden rounded-2xl border border-border/80 bg-card',
          'shadow-sm transition-[box-shadow,border-color] duration-200',
          'active:scale-[0.98]',
          'group-hover/card:border-primary/30 group-hover/card:shadow-md',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          className,
        )}
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          <SafeImage
            src={thumb}
            alt={result.title}
            fill
            className="object-cover transition-transform duration-400 ease-out group-hover/card:scale-[1.04]"
            sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
            loading="lazy"
            {...(blurDataURL && { placeholder: 'blur' as const, blurDataURL })}
          />

          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/20 to-transparent"
            aria-hidden
          />

          <span
            className={cn(
              'absolute top-2 start-2 z-[1] rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide shadow-sm',
              badge.className,
            )}
          >
            {badge.label}
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-3.5">
          {result.price !== null && (
            <p className="font-mono text-lg font-bold tabular-nums tracking-tight text-primary leading-none sm:text-xl">
              {formatPrice(result.price)}
            </p>
          )}
          <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground sm:text-[15px]">
            {result.title}
          </h3>

          <div className="mt-auto flex flex-col gap-1.5 border-t border-border/40 pt-2">
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
                {result.type !== 'store' && (
                  <span className="flex items-center gap-0.5 opacity-80">
                    <Eye className="h-3 w-3" aria-hidden />
                    <span>{result.views}</span>
                  </span>
                )}
                <span className="font-medium tabular-nums">{formatRelativeTime(result.createdAt)}</span>
              </span>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
