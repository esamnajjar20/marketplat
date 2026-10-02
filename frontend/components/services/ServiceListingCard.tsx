'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { onIntentPrefetch } from '@/lib/prefetchOnIntent';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { CardKindBadge, useNowAfterMount } from '@/components/shared/cards/cardParts';
import { HIT_AREA, TIME_PLACEHOLDER, freshnessClass } from '@/components/shared/cards/cardTokens';
import { Badge } from '@/components/ui/badge';
import { BadgeCheck, Clock, MapPin, Star } from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import { formatRelativeTime, formatServicePrice } from '@/lib/formatters';
import {
  getListThumbnailUrl,
  getPlaceholderUrl,
  isCloudinaryUrl,
  PLACEHOLDER_SVG,
  getAvatarUrl,
} from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import type { ServiceListingWithProvider, ServiceAvailability } from '@/types/service.types';

interface Props {
  listing: ServiceListingWithProvider;
  className?: string;
  priority?: boolean;
  density?: 'default' | 'compact';
  /** Mixed lists: show a "خدمة" chip inside the badge stack. */
  showKind?: boolean;
}

const AVAILABILITY_DOT: Record<ServiceAvailability, string> = {
  AVAILABLE: 'bg-success',
  BUSY: 'bg-warning',
  UNAVAILABLE: 'bg-muted-foreground',
};

const AVAILABILITY_LABEL: Record<ServiceAvailability, string> = {
  AVAILABLE: 'متاح الآن',
  BUSY: 'مشغول',
  UNAVAILABLE: 'غير متاح',
};

/**
 * Service listing card — unified Badge + typography (Phase 3+).
 */
export function ServiceListingCard({
  listing,
  className,
  priority = false,
  density = 'default',
  showKind = false,
}: Props) {
  const compact = density === 'compact';
  const router = useRouter();
  const detailHref = ROUTES.serviceDetail(listing.id);
  function warmDetail() {
    onIntentPrefetch(`service:${listing.id}`, () => {
      router.prefetch(detailHref);
    });
  }

  const rawImage = listing.images[0];
  const thumb = rawImage ? getListThumbnailUrl(rawImage, 320, 224) : PLACEHOLDER_SVG;
  const blurDataURL =
    rawImage && isCloudinaryUrl(rawImage) ? getPlaceholderUrl(rawImage) : undefined;
  const priceLabel = formatServicePrice(listing.pricingType, listing.price);
  const isNegotiable = listing.pricingType === 'NEGOTIABLE' || !listing.price;

  const now = useNowAfterMount();
  const timeColorClass = freshnessClass(now, listing.createdAt);

  const providerLogo = getAvatarUrl(listing.provider.logoUrl ?? '', 32);
  const ratingRaw = listing.provider.sellerProfile?.averageRating;
  const rating = ratingRaw != null && ratingRaw !== '' ? parseFloat(String(ratingRaw)) : NaN;
  /** Avoid showing 0.0 / negative as a real rating */
  const hasRating = Number.isFinite(rating) && rating > 0;

  const cityHint =
    listing.serviceLocation === 'AT_CUSTOMER'
      ? 'عند العميل'
      : listing.serviceLocation === 'AT_PROVIDER'
        ? 'عند مقدم الخدمة'
        : listing.serviceLocation === 'REMOTE'
          ? 'عن بُعد'
          : null;

  const isAvailable = listing.provider.availabilityStatus === 'AVAILABLE';

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
          isAvailable ? 'border-success/25' : 'border-border/80',
          className,
        )}
      >
        <div className={cn('relative overflow-hidden bg-muted', compact ? 'aspect-[3/2]' : 'aspect-[4/3]')}>
          <SafeImage
            src={thumb}
            alt={listing.title}
            fill
            className="object-cover transition-transform duration-400 ease-out group-hover/card:scale-[1.04]"
            sizes={compact ? '(max-width:640px) 60vw, 220px' : '(max-width:640px) 50vw, (max-width:1024px) 33vw, 20vw'}
            priority={priority}
            loading={priority ? undefined : 'lazy'}
            {...(blurDataURL && { placeholder: 'blur' as const, blurDataURL })}
          />

          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/20 to-transparent"
            aria-hidden
          />

          <div className="absolute top-2 start-2 z-[1] flex max-w-[70%] flex-col items-start gap-1">
            {showKind && <CardKindBadge kind="service" />}
            <Badge size="xs" variant="overlay" className="gap-1.5">
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full ring-1 ring-white/30',
                  AVAILABILITY_DOT[listing.provider.availabilityStatus],
                )}
              />
              {AVAILABILITY_LABEL[listing.provider.availabilityStatus]}
            </Badge>
          </div>
        </div>

        <div className={cn('flex flex-1 flex-col', compact ? 'gap-1 p-2.5' : 'gap-1.5 p-3 sm:p-3.5')}>
          <div className="flex flex-wrap items-center gap-1.5">
            <p
              className={cn(
                'font-mono font-bold tabular-nums tracking-tight text-primary',
                compact ? 'text-base sm:text-lg' : 'text-lg sm:text-xl',
              )}
            >
              {priceLabel}
            </p>
            {isNegotiable && listing.pricingType === 'NEGOTIABLE' && (
              <Badge size="sm" variant="soft">
                قابل للتفاوض
              </Badge>
            )}
          </div>

          <h3 className={cn('line-clamp-2 min-h-0 flex-1 font-medium leading-snug text-foreground', compact ? 'text-xs sm:text-sm' : 'text-sm sm:text-card-title')}>
            {listing.title}
          </h3>

          <div className={cn('mt-auto flex flex-col border-t border-border/40', compact ? 'gap-1 pt-1.5' : 'gap-1.5 pt-2')}>
            {(cityHint || listing.durationEstimate) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {cityHint && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                    <span className="truncate">{cityHint}</span>
                  </span>
                )}
                {listing.durationEstimate && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                    <span>{listing.durationEstimate}</span>
                  </span>
                )}
              </div>
            )}

            <div className="flex min-w-0 items-center gap-1.5">
              <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border/60">
                <SafeImage
                  variant="avatar"
                  src={providerLogo}
                  alt={listing.provider.businessName}
                  fill
                  className="object-cover"
                  sizes="20px"
                />
              </div>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {listing.provider.businessName}
              </span>
              {listing.provider.sellerProfile?.verified && (
                <BadgeCheck
                  className="h-3.5 w-3.5 shrink-0 text-primary"
                  aria-label="موثّق"
                />
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                {hasRating ? (
                  <span className="flex shrink-0 items-center gap-0.5 text-2xs text-muted-foreground">
                    <Star className="h-3 w-3 fill-rating text-rating" aria-hidden />
                    {rating.toFixed(1)}
                  </span>
                ) : (
                  <Badge size="sm" variant="secondary">
                    مقدم خدمة
                  </Badge>
                )}
              </div>
              <span
                className={cn(
                  'shrink-0 whitespace-nowrap text-2xs font-medium tabular-nums',
                  timeColorClass,
                )}
              >
                {now === null ? TIME_PLACEHOLDER : formatRelativeTime(listing.createdAt, now)}
              </span>
            </div>
          </div>
        </div>
      </Link>

      <FavoriteButton
        entityType="SERVICE_LISTING"
        entityId={listing.id}
        size="sm"
        className={`absolute top-2 end-2 z-20 !h-9 !w-9 rounded-full bg-background/95 shadow-md backdrop-blur-md ring-1 ring-black/5 ${HIT_AREA}`}
      />
    </div>
  );
}
