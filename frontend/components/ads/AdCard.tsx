import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Eye } from 'lucide-react';
import { ROUTES, CONDITION_LABELS } from '@/lib/constants';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { getThumbnailUrl, getPlaceholderUrl, isCloudinaryUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import type { AdListItem } from '@/types/ad.types';
import { cn } from '@/lib/utils';

interface Props {
  ad: AdListItem;
  className?: string;
  /**
   * FIX PERF-05: next/image lazy-loads by default, which is correct
   * for a grid of cards below the fold but actively hurts LCP
   * (Largest Contentful Paint) for cards that render above the fold —
   * their image request doesn't even start until the browser notices
   * them entering the viewport, adding a needless round trip to the
   * page's most visually significant paint. Callers rendering a fixed
   * number of cards near the top of a page (e.g. FeaturedAds) should
   * pass this for roughly the first row.
   */
  priority?: boolean;
}

/**
 * FIX UX-01: swapped hand-picked raw Tailwind colors (bg-amber-400,
 * bg-black/60) for the semantic accent/foreground tokens so the
 * "featured" flag reads as an intentional brand moment rather than a
 * leftover default yellow, and stays in sync if the palette changes.
 * Border/shadow treatment also moved from the flat, generic
 * `border + hover:shadow-md` combination to a slightly warmer resting
 * state with a more deliberate lift on hover.
 */
export function AdCard({ ad, className, priority = false }: Props) {
  const rawImage = ad.images[0];
  const thumb    = rawImage ? getThumbnailUrl(rawImage, 400, 280) : PLACEHOLDER_SVG;
  const isSold   = ad.status === 'SOLD';
  // FIX PERF-06: lib/cloudinary.ts already ships a getPlaceholderUrl
  // (tiny, heavily blurred, ~1-2KB) meant to pair with next/image's
  // placeholder="blur" for a smooth fade-in instead of the image
  // popping in abruptly once the real file loads — but nothing in the
  // app actually used it. Only requested when there's a real
  // Cloudinary image; the "no image" SVG placeholder needs no blur-up
  // of its own.
  const blurDataURL = rawImage && isCloudinaryUrl(rawImage) ? getPlaceholderUrl(rawImage) : undefined;

  return (
    <Link href={ROUTES.adDetail(ad.id)}
      className={cn(
        'group block overflow-hidden rounded-xl border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg',
        className,
      )}>

      {/* Image */}
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <Image
          src={thumb}
          alt={ad.title}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
          priority={priority}
          loading={priority ? undefined : 'lazy'}
          {...(blurDataURL && { placeholder: 'blur' as const, blurDataURL })}
        />
        {isSold && (
          <div className="absolute inset-0 flex items-center justify-center bg-foreground/60 backdrop-blur-[1px]">
            <span className="rounded-full bg-background px-4 py-1 text-sm font-bold text-foreground">تم البيع</span>
          </div>
        )}
        {ad.isFeatured && !isSold && (
          <span className="absolute top-2 start-2 rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground shadow-sm">
            مميز
          </span>
        )}
        {ad.condition && (
          <span className="absolute top-2 end-2 rounded-full bg-foreground/70 px-2.5 py-0.5 text-xs text-background backdrop-blur-sm">
            {CONDITION_LABELS[ad.condition] ?? ad.condition}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="space-y-1.5 p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{ad.title}</h3>
        <p className="font-mono text-base font-bold text-primary">{formatPrice(ad.price)}</p>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{ad.city}</span>
          <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{ad.views}</span>
        </div>
        <p className="text-xs text-muted-foreground">{formatRelativeTime(ad.createdAt)}</p>
      </div>
    </Link>
  );
}
