'use client';

import { memo } from 'react';
import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Star, MapPin, Wrench } from 'lucide-react';
import { CardKindBadge, CardOfflineBadge, type CardContext } from '@/components/shared/cards/cardParts';
import {
  CARD_FOCUS,
  CARD_HOVER,
  CARD_IMAGE_HOVER,
  CARD_HEART_POSITION,
  CARD_IMAGE_43,
  CARD_IMAGE_SHADE,
  CARD_PRESS,
  CARD_SHELL,
  CARD_SHELL_SOFT,
  CARD_BODY_COMPACT,
  CARD_TITLE,
  CARD_BADGE_SUCCESS,
  CARD_BADGE_MUTED,
  HIT_AREA,
} from '@/components/shared/cards/cardTokens';
import { Badge } from '@/components/ui/badge';
import { ROUTES } from '@/lib/constants';
import { formatServicePrice } from '@/lib/formatters';
import { getListThumbnailUrl, getPlaceholderUrl, isCloudinaryUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import type { ServiceListingWithProvider, ServiceAvailability } from '@/types/service.types';

interface Props {
  listing: ServiceListingWithProvider;
  context?: CardContext;
  className?: string;
  priority?: boolean;
  density?: 'default' | 'compact';
  layout?: 'grid' | 'list';
  showKind?: boolean;
  /** بطاقة التصميم الأفقية (صفحة /services). */
  designLayout?: boolean;
}

const AVAILABILITY_LABEL: Record<ServiceAvailability, string> = {
  AVAILABLE: 'متاح الآن',
  BUSY: 'مشغول',
  UNAVAILABLE: 'غير متاح',
};

const SERVICE_LOCATION_HINT: Record<string, string> = {
  AT_CUSTOMER: 'عند العميل',
  AT_PROVIDER: 'عند مقدم الخدمة',
  REMOTE: 'عن بُعد',
};

const PASTEL = ['bg-[#E8F1EC]', 'bg-[#F6E7DB]', 'bg-[#E3EEF5]', 'bg-[#EFEADF]', 'bg-[#FBF0D9]'] as const;

function pastel(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * (i + 1)) % PASTEL.length;
  return PASTEL[h];
}

export const ServiceListingCard = memo(function ServiceListingCard({
  listing,
  context = 'public',
  className,
  priority = false,
  
  layout = 'grid',
  showKind = false,
  designLayout = true,
}: Props) {
  const detailHref = ROUTES.serviceDetail(listing.id);
  const rawImage = listing.images?.[0];
  const thumb = rawImage ? getListThumbnailUrl(rawImage, 320, 240) : PLACEHOLDER_SVG;
  const blurDataURL = rawImage && isCloudinaryUrl(rawImage) ? getPlaceholderUrl(rawImage) : undefined;
  const priceLabel = formatServicePrice(listing.pricingType, listing.price);
  const showHeart = context !== 'owner';
  const avail = listing.provider.availabilityStatus;
  const rating = listing.provider.sellerProfile?.averageRating;
  const verified = listing.provider.sellerProfile?.verified;
  const locationHint = SERVICE_LOCATION_HINT[listing.serviceLocation] || listing.provider.serviceAreaCities?.[0];

  // ── Design: horizontal list card (mockup) ──
  if (designLayout && layout !== 'grid') {
    return (
      <article className={cn('group relative min-w-0', className)}>
        <div className={cn(CARD_SHELL_SOFT, "p-2.5 sm:p-3")}>
          <div className="flex gap-3">
            <div
              className={cn(
                'relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl sm:h-[72px] sm:w-[72px]',
                !rawImage && pastel(listing.id),
                rawImage && 'bg-muted',
              )}
            >
              {rawImage ? (
                <SafeImage
                  src={thumb}
                  alt={listing.title}
                  fill
                  className="object-cover"
                  sizes="72px"
                  priority={priority}
                />
              ) : (
                <Wrench className="h-7 w-7 text-primary/45" aria-hidden />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 title={listing.title} className={cn(CARD_TITLE, "line-clamp-2")}>
                {listing.title}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="truncate text-xs text-muted-foreground">{listing.provider.businessName}</span>
                {verified ? (
                  <span className={CARD_BADGE_SUCCESS}>
                    ✓ موثّق
                  </span>
                ) : null}
              </div>
              <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 font-semibold',
                    avail === 'AVAILABLE' && 'text-success',
                    avail === 'BUSY' && 'text-warning',
                  )}
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      avail === 'AVAILABLE' && 'bg-success',
                      avail === 'BUSY' && 'bg-amber-500',
                      avail === 'UNAVAILABLE' && 'bg-muted-foreground',
                    )}
                  />
                  {AVAILABILITY_LABEL[avail]}
                </span>
                {locationHint ? (
                  <span className="inline-flex min-w-0 max-w-full items-center gap-0.5">
                    <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="min-w-0 truncate" title={locationHint}>
                      {locationHint}
                    </span>
                  </span>
                ) : null}
                {rating != null ? (
                  <span className="inline-flex items-center gap-0.5 font-medium text-foreground">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden />
                    {Number(rating).toFixed(1)}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span dir="ltr" className="text-sm font-extrabold tabular-nums text-primary">
                {priceLabel}
              </span>
              {listing.pricingType === 'NEGOTIABLE' || listing.pricingType === 'STARTING_FROM' ? (
                <span className={CARD_BADGE_MUTED}>
                  قابل للتفاوض
                </span>
              ) : null}
            </div>
            <Link
              href={detailHref}
              prefetch={false}
              className={cn(
                'inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-[#EAE3D6] bg-white px-4 text-xs font-bold text-primary transition-colors hover:border-primary/40 dark:border-border dark:bg-card',
                CARD_FOCUS,
              )}
            >
              التفاصيل
            </Link>
          </div>
        </div>
        {showHeart && (
          <FavoriteButton
            entityType="SERVICE_LISTING"
            entityId={listing.id}
            returnTo={detailHref}
            variant="card"
            className={`absolute end-2 top-2 z-20 ${HIT_AREA}`}
          />
        )}
      </article>
    );
  }

  // ── Fallback grid card ──
  return (
    <article
      className={cn(
        'group relative h-full min-w-0 [content-visibility:auto] [contain-intrinsic-size:auto_280px]',
        className,
      )}
    >
      <Link
        href={detailHref}
        prefetch={false}
        className={cn(
          CARD_SHELL,
          'group/card flex flex-col',
          CARD_HOVER,
          CARD_FOCUS,
          CARD_PRESS,
        )}
      >
        <div className={CARD_IMAGE_43}>
          <SafeImage
            src={thumb}
            alt={listing.title}
            fill
            className={cn('object-cover', CARD_IMAGE_HOVER)}
            sizes="(max-width: 640px) 50vw, 33vw"
            priority={priority}
            loading={priority ? undefined : 'lazy'}
            {...(blurDataURL && { placeholder: 'blur' as const, blurDataURL })}
          />
          <div className={CARD_IMAGE_SHADE} aria-hidden />
          <CardOfflineBadge />
          <div className="absolute start-2 top-2 z-10 flex flex-col items-start gap-1">
            {showKind && <CardKindBadge kind="service" />}
            <Badge size="xs" variant="overlay">
              {AVAILABILITY_LABEL[avail]}
            </Badge>
          </div>
        </div>
        <div className={CARD_BODY_COMPACT}>
          <h3 title={listing.title} className={cn(CARD_TITLE, "line-clamp-2")}>
            {listing.title}
          </h3>
          <span dir="ltr" className="text-sm font-extrabold tabular-nums text-primary">
            {priceLabel}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">{listing.provider.businessName}</span>
        </div>
      </Link>
      {showHeart && (
        <FavoriteButton
          entityType="SERVICE_LISTING"
          entityId={listing.id}
          returnTo={detailHref}
          variant="card"
          className={`${CARD_HEART_POSITION} ${HIT_AREA}`}
        />
      )}
    </article>
  );
});
