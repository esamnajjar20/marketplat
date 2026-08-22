'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { MapPin, Heart } from 'lucide-react';
import { ROUTES, CONDITION_LABELS } from '@/lib/constants';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { getThumbnailUrl, getPlaceholderUrl, isCloudinaryUrl, PLACEHOLDER_SVG, getAvatarUrl } from '@/lib/cloudinary';
import { useIsFavorited } from '@/hooks/queries/useFavorites';
import { useToggleFavorite } from '@/hooks/mutations/useFavoriteMutations';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { toast } from 'sonner';
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
 *
 * FIX DESIGN-01: reshaped to match the approved mobile-grid mock
 * (price-first stat row, condition pill top-start, single seller/time
 * footer row) — same underlying data as before, real project tokens
 * (--primary/--success/--muted etc., not the mock's raw hex palette),
 * views count dropped from this compact card (still shown on
 * AdDetail) to match the mock's leaner footer.
 */
export function AdCard({ ad, className, priority = false }: Props) {
  const rawImage = ad.images[0];
  const thumb    = rawImage ? getThumbnailUrl(rawImage, 400, 280) : PLACEHOLDER_SVG;
  const isSold   = ad.status === 'SOLD';
  const isNew    = ad.condition === 'NEW';

  // FIX P2-7: formatRelativeTime always rendered in flat
  // text-muted-foreground regardless of how old the ad actually is —
  // "منذ ساعة" و"منذ شهر" looked identical, so a buyer scanning a
  // grid had to read every timestamp individually to spot the fresh
  // listings. success = <24h (genuinely new), warning = <7d (still
  // recent), muted = everything older — same semantic tokens P2-3
  // already standardized status colors on elsewhere in this file.
  const ageHours = (Date.now() - new Date(ad.createdAt).getTime()) / 3_600_000;
  const timeColorClass =
    ageHours < 24 ? 'text-success' : ageHours < 24 * 7 ? 'text-warning' : 'text-muted-foreground';

  // FIX P1-1: previously the only way to favorite/unfavorite an ad was
  // to open its full detail page — even from inside the favorites list
  // itself. useIsFavorited subscribes to the same client-cached ID set
  // AdDetail reads, so this stays in sync with detail-page toggles with
  // no extra request; useToggleFavorite already handles the optimistic
  // update/rollback.
  const isAuth = useAuthStore(selectIsAuthenticated);
  const isFavorited = useIsFavorited(ad.id);
  const toggleFavorite = useToggleFavorite();

  // FIX UX-21: remounts the heart icon (via key) to replay the
  // heart-pop keyframe (tailwind.config.ts) on every add-to-favorites
  // tap — only on add, not remove, matching the "delight" moment the
  // original static mock's vanilla-JS pop handled. motion-safe: below
  // keeps this off for prefers-reduced-motion users.
  const [popKey, setPopKey] = useState(0);

  function handleFavoriteClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuth) { toast.error('يرجى تسجيل الدخول أولاً'); return; }
    if (!isFavorited) setPopKey((k) => k + 1);
    toggleFavorite.mutate(ad.id);
  }
  // FIX PERF-06: lib/cloudinary.ts already ships a getPlaceholderUrl
  // (tiny, heavily blurred, ~1-2KB) meant to pair with next/image's
  // placeholder="blur" for a smooth fade-in instead of the image
  // popping in abruptly once the real file loads — but nothing in the
  // app actually used it. Only requested when there's a real
  // Cloudinary image; the "no image" SVG placeholder needs no blur-up
  // of its own.
  const blurDataURL = rawImage && isCloudinaryUrl(rawImage) ? getPlaceholderUrl(rawImage) : undefined;

  // NOTE: AdListItem's user relation (AdAuthor) has no nested store
  // fields in the current API response (ads.repository.ts's
  // adListSelect only selects id/name/city/avatarUrl on user) — a
  // store-badge variant here would need a backend select change,
  // which is out of scope for this pass. Seller identity only, using
  // data already present on the ad.
  const sellerAvatar = getAvatarUrl(ad.user.avatarUrl ?? '', 32);

  return (
    <div className="relative">
      <Link href={ROUTES.adDetail(ad.id)}
        className={cn(
          'group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg',
          className,
        )}>

        {/* Image */}
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          <SafeImage
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

          {/* Top-start badge stack: condition pill (styled after its
              value — NEW gets the success tint, USED/REFURBISHED a
              neutral one) plus a separate "مميز" pill when featured,
              stacked rather than sharing one slot so neither flag gets
              silently dropped. */}
          <div className="absolute top-2 start-2 flex flex-col items-start gap-1">
            {ad.condition && (
              <span
                className={cn(
                  'rounded-full px-2 py-1 text-[10px] font-bold font-mono backdrop-blur-sm',
                  isNew
                    ? 'bg-success/10 text-success'
                    : 'border border-border/60 bg-muted/80 text-muted-foreground',
                )}
              >
                {CONDITION_LABELS[ad.condition] ?? ad.condition}
              </span>
            )}
            {ad.isFeatured && !isSold && (
              <span className="rounded-full bg-accent/90 px-2 py-1 text-[10px] font-bold text-accent-foreground shadow-sm backdrop-blur-sm">
                مميز
              </span>
            )}
          </div>
        </div>

        {/* Info — price-first, matching the approved mock's stat order */}
        <div className="flex flex-1 flex-col gap-1 p-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-lg font-bold text-primary">{formatPrice(ad.price)}</span>
            {/* FIX P1-8: isNegotiable was collected in the create form
                (PriceInput's "السعر قابل للتفاوض" checkbox) and stored,
                but never surfaced anywhere in the browsing UI — a buyer
                had no way to know a price was negotiable short of
                opening the full ad detail page first. */}
            {ad.isNegotiable && !isSold && (
              <span className="rounded-full border border-primary/30 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                قابل للتفاوض
              </span>
            )}
          </div>
          <h3 className="line-clamp-2 min-h-0 flex-1 text-base text-foreground leading-snug">{ad.title}</h3>

          <div className="mt-auto flex flex-col gap-1 pt-2">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />{ad.city}
            </span>
            <div className="mt-1 flex items-center justify-between">
              {/* Seller identity — name + tiny avatar only, no
                  rating/verified/etc. (that detail lives in SellerCard
                  on the ad detail page, per design brief item 3.4). */}
              <div className="flex min-w-0 items-center gap-1.5">
                <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full bg-muted">
                  <SafeImage
                    variant="avatar"
                    src={sellerAvatar}
                    alt={ad.user.name}
                    fill
                    className="object-cover"
                    sizes="20px"
                  />
                </div>
                <span className="w-16 truncate text-xs text-muted-foreground">{ad.user.name}</span>
              </div>
              <span className={cn('shrink-0 text-xs', timeColorClass)}>{formatRelativeTime(ad.createdAt)}</span>
            </div>
          </div>
        </div>
      </Link>

      {/* FIX P1-1: rendered as a sibling of <Link>, not nested inside it —
          a <button> inside an <a> is invalid HTML (hydration/a11y risk)
          even though React won't error on it. Absolutely positioned
          against this wrapper so it keeps the same visual spot. */}
      {!isSold && (
        <button
          type="button"
          onClick={handleFavoriteClick}
          disabled={toggleFavorite.isPending}
          aria-label={isFavorited ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
          aria-pressed={isFavorited}
          className="absolute top-2 end-2 flex h-8 w-8 items-center justify-center rounded-full bg-background/90 shadow-sm backdrop-blur-sm transition-transform active:scale-90 disabled:opacity-60"
        >
          <Heart key={popKey} className={cn('h-4 w-4', popKey > 0 && 'motion-safe:animate-heart-pop', isFavorited ? 'fill-destructive text-destructive' : 'text-foreground')} />
        </button>
      )}
    </div>
  );
}
