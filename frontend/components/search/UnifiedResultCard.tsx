'use client';

import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Eye, Star, BadgeCheck } from 'lucide-react';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { getThumbnailUrl, getPlaceholderUrl, isCloudinaryUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
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
  ad:      { label: 'إعلان', className: 'bg-foreground/70 text-background' },
  product: { label: 'منتج',  className: 'bg-primary/90 text-primary-foreground' },
  store:   { label: 'محل',   className: 'bg-accent text-accent-foreground' },
  service: { label: 'خدمة',  className: 'bg-emerald-600/90 text-white' },
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
  const thumb = result.image ? getThumbnailUrl(result.image, 400, 280) : PLACEHOLDER_SVG;
  const blurDataURL =
    result.image && isCloudinaryUrl(result.image) ? getPlaceholderUrl(result.image) : undefined;
  const badge = TYPE_BADGE[result.type];

  return (
    <Link
      href={result.url}
      className={cn(
        'group block overflow-hidden rounded-xl border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg',
        className
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <Image
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

      <div className="space-y-1.5 p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{result.title}</h3>

        {result.price !== null && (
          <p className="font-mono text-base font-bold text-primary">{formatPrice(result.price)}</p>
        )}

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{result.seller.name}</span>
          {result.seller.verified && (
            <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="بائع موثّق" />
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            {result.city && (
              <>
                <MapPin className="h-3 w-3" />
                {result.city}
              </>
            )}
          </span>
          <span className="flex items-center gap-2">
            {result.rating > 0 && (
              <span className="flex items-center gap-0.5">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {result.rating.toFixed(1)}
              </span>
            )}
            {result.type !== 'store' && (
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {result.views}
              </span>
            )}
          </span>
        </div>

        <p className="text-xs text-muted-foreground">{formatRelativeTime(result.createdAt)}</p>
      </div>
    </Link>
  );
}
