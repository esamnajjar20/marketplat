'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { onIntentPrefetch } from '@/lib/prefetchOnIntent';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { MapPin, Heart, Star, BadgeCheck } from 'lucide-react';
import { ROUTES, CONDITION_LABELS } from '@/lib/constants';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { getListThumbnailUrl, getPlaceholderUrl, isCloudinaryUrl, PLACEHOLDER_SVG, getAvatarUrl } from '@/lib/cloudinary';
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
 * Improved AdCard — refined hierarchy without overlapping elements.
 * Favorite stays top-end; condition/featured stay top-start.
 * Hover lift uses isolation so cards don't stack over neighbours incorrectly.
 */
export function AdCard({ ad, className, priority = false }: Props) {
  const router = useRouter();
  const detailHref = ROUTES.adDetail(ad.id);

  function warmDetail() {
    onIntentPrefetch(`ad:${ad.id}`, () => {
      router.prefetch(detailHref);
    });
  }

  const rawImage = ad.images[0];
  const thumb    = rawImage ? getListThumbnailUrl(rawImage, 320, 224) : PLACEHOLDER_SVG;
  const isSold   = ad.status === 'SOLD';
  const isNew    = ad.condition === 'NEW';

  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  const ageHours = now === null
    ? Infinity
    : (now - new Date(ad.createdAt).getTime()) / 3_600_000;
  const timeColorClass =
    ageHours < 24 ? 'text-success' : ageHours < 24 * 7 ? 'text-warning' : 'text-muted-foreground';

  const isAuth = useAuthStore(selectIsAuthenticated);
  const isFavorited = useIsFavorited(ad.id);
  const toggleFavorite = useToggleFavorite();

  const [popKey, setPopKey] = useState(0);

  function handleFavoriteClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    // SW-FIX-ADCARD-LOGIN: send the user to login with a return path,
    // same pattern as StickyContactBar / StorePublisherCard. Was a bare
    // toast that left the buyer on the same page with no path forward.
    if (!isAuth) {
      toast.error('سجّل الدخول لحفظ الإعلان');
      router.push(`${ROUTES.login}?from=${encodeURIComponent(detailHref)}`);
      return;
    }
    if (!isFavorited) setPopKey((k) => k + 1);
    toggleFavorite.mutate(ad.id);
  }

  const blurDataURL = rawImage && isCloudinaryUrl(rawImage) ? getPlaceholderUrl(rawImage) : undefined;

  const store = ad.store;
  const isStoreAd = Boolean(store?.id);
  const sellerAvatar = isStoreAd
    ? getAvatarUrl(store?.logoUrl ?? '', 32)
    : getAvatarUrl(ad.user.avatarUrl ?? '', 32);
  const publisherName = isStoreAd ? store!.name : ad.user.name;

  return (
    <div
      className={cn(
        'group/card relative isolate z-0 h-full',
        'transition-transform duration-200 ease-out',
        'hover:z-10 hover:-translate-y-0.5',
      )}
    >
      <Link
        href={detailHref}
        prefetch={false}
        onPointerEnter={warmDetail}
        onFocus={warmDetail}
        className={cn(
          'flex h-full flex-col overflow-hidden rounded-2xl border bg-card',
          'shadow-sm transition-[box-shadow,border-color] duration-200',
          'active:scale-[0.98]',
          'group-hover/card:border-primary/30 group-hover/card:shadow-md',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          ad.isFeatured && !isSold
            ? 'border-accent/40'
            : 'border-border/80',
          className,
        )}
      >
        {/* Image */}
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          <SafeImage
            src={thumb}
            alt={ad.title}
            fill
            className="object-cover transition-transform duration-400 ease-out group-hover/card:scale-[1.04]"
            sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 20vw"
            priority={priority}
            loading={priority ? undefined : 'lazy'}
            {...(blurDataURL && { placeholder: 'blur' as const, blurDataURL })}
          />

          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/20 to-transparent"
            aria-hidden
          />

          {isSold && (
            <div className="absolute inset-0 z-[1] flex items-center justify-center bg-foreground/55 backdrop-blur-[2px]">
              <span className="rounded-full bg-background/95 px-4 py-1.5 text-sm font-bold text-foreground shadow-sm">
                تم البيع
              </span>
            </div>
          )}

          {/* Top-start badges only — never share the end corner with the heart */}
          <div className="absolute top-2 start-2 z-[1] flex max-w-[70%] flex-col items-start gap-1">
            {ad.condition && (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide shadow-sm backdrop-blur-md',
                  isNew
                    ? 'bg-success/90 text-success-foreground'
                    : 'border border-white/20 bg-black/45 text-white',
                )}
              >
                {CONDITION_LABELS[ad.condition] ?? ad.condition}
              </span>
            )}
            {ad.isFeatured && !isSold && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground shadow-sm">
                ★ مميز
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-3.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'font-mono text-lg font-bold tracking-tight sm:text-xl',
                isSold ? 'text-muted-foreground line-through' : 'text-primary',
              )}
            >
              {formatPrice(ad.price)}
            </span>
            {isSold && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-foreground">
                تم البيع
              </span>
            )}
            {ad.isNegotiable && !isSold && (
              <span className="rounded-full border border-primary/25 bg-primary/5 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                قابل للتفاوض
              </span>
            )}
          </div>

          <h3 className="line-clamp-2 min-h-0 flex-1 text-sm font-medium leading-snug text-foreground sm:text-[15px]">
            {ad.title}
          </h3>

          <div className="mt-auto flex flex-col gap-1.5 border-t border-border/40 pt-2">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="truncate">{ad.city}</span>
            </span>

            <div className="flex min-w-0 items-center gap-1.5">
              <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border/60">
                <SafeImage
                  variant="avatar"
                  src={sellerAvatar}
                  alt={publisherName}
                  fill
                  className="object-cover"
                  sizes="20px"
                />
              </div>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {publisherName}
              </span>
              {!isStoreAd && ad.sellerProfile?.verified && (
                <BadgeCheck
                  className="h-3.5 w-3.5 shrink-0 text-primary"
                  aria-label="بائع موثّق"
                />
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                {!isStoreAd && ad.sellerProfile && ad.sellerProfile.totalRatings > 0 && (
                  <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Star className="h-3 w-3 fill-rating text-rating" aria-hidden />
                    {parseFloat(ad.sellerProfile.averageRating).toFixed(1)}
                  </span>
                )}
                {!isStoreAd && ad.sellerProfile && ad.sellerProfile.totalRatings === 0 && (
                  <span className="rounded-full bg-muted/80 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
                    بائع جديد
                  </span>
                )}
              </div>
              <span className={cn('shrink-0 whitespace-nowrap text-[10px] font-medium tabular-nums', timeColorClass)}>
                {now === null ? '—' : formatRelativeTime(ad.createdAt, now)}
              </span>
            </div>
          </div>
        </div>
      </Link>

      {/* Heart: only element allowed in the top-end corner */}
      {!isSold && (
        <button
          type="button"
          onClick={handleFavoriteClick}
          disabled={toggleFavorite.isPending}
          aria-label={isFavorited ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
          aria-pressed={isFavorited}
          className={cn(
            'absolute top-2 end-2 z-20 flex h-9 w-9 items-center justify-center',
            'rounded-full bg-background/95 shadow-md backdrop-blur-md',
            'ring-1 ring-black/5 transition-transform duration-150',
            'hover:scale-105 active:scale-90',
            'disabled:opacity-60',
          )}
        >
          <Heart
            key={popKey}
            className={cn(
              'h-4 w-4 transition-colors',
              popKey > 0 && 'motion-safe:animate-heart-pop',
              isFavorited ? 'fill-destructive text-destructive' : 'text-foreground/80',
            )}
          />
        </button>
      )}
    </div>
  );
}
