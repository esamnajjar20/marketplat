import { memo } from 'react';
import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Star, MapPin, Wrench } from 'lucide-react';
import { CardKindBadge } from '@/components/shared/cards/cardDisplayParts';
import { MarketCard } from '@/components/shared/cards/MarketCard';
import type { CardContext } from '@/components/shared/cards/cardTypes';
import {
  CARD_FOCUS,
  CARD_HEART_POSITION,
  CARD_META_ITEM,
  CARD_SHELL_SOFT,
  CARD_TITLE,
  CARD_BADGE_SUCCESS,
  CARD_BADGE_MUTED,
  HIT_AREA,
  cardPlaceholderToneForId,
} from '@/components/shared/cards/cardTokens';
import { TAG_AVAILABLE, TAG_MUTED, TAG_WARNING } from '@/components/shared/detail/detailTokens';
import { ROUTES } from '@/lib/constants';
import { formatServicePrice } from '@/lib/formatters';
import { getListThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import type { ServiceListingWithProvider } from '@/types/service.types';
import { AVAILABILITY_LABEL, AVAILABILITY_DOT, AVAILABILITY_TEXT } from '@/lib/serviceAvailability';

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

const AVAILABILITY_TAG: Record<string, string> = {
  AVAILABLE: TAG_AVAILABLE,
  BUSY: TAG_WARNING,
  UNAVAILABLE: TAG_MUTED,
};

const SERVICE_LOCATION_HINT: Record<string, string> = {
  AT_CUSTOMER: 'عند العميل',
  AT_PROVIDER: 'عند مقدم الخدمة',
  REMOTE: 'عن بُعد',
};

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
                !rawImage && cardPlaceholderToneForId(listing.id),
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
              <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2 text-2xs-tight text-muted-foreground">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 font-semibold',
                    AVAILABILITY_TEXT[avail],
                  )}
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      AVAILABILITY_DOT[avail],
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
                    <Star className="h-3 w-3 fill-rating text-rating" aria-hidden />
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
            <IntentPrefetchLink
              href={detailHref}
              prefetch={false}
              className={cn(
                'inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-card px-4 text-xs font-bold text-primary transition-colors hover:border-primary/40 dark:border-border dark:bg-card',
                CARD_FOCUS,
              )}
            >
              التفاصيل
            </IntentPrefetchLink>
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

  // ── Grid (unified card shared with ads and products) ──
  const hidePlace = context === 'store' || context === 'owner';
  const badges: React.ReactNode[] = [];
  if (showKind) badges.push(<CardKindBadge key="kind" kind="service" />);
  badges.push(
    <span key="avail" className={AVAILABILITY_TAG[avail] ?? TAG_MUTED}>
      {AVAILABILITY_LABEL[avail]}
    </span>,
  );
  const serviceCity = listing.provider.serviceAreaCities?.[0];

  return (
    <MarketCard
      id={listing.id}
      href={detailHref}
      title={listing.title}
      imageSrc={rawImage}
      placeholderIcon={Wrench}
      priority={priority}
      badges={badges.slice(0, 2)}
      price={priceLabel}
      priceDir="auto"
      priceUnset={listing.pricingType === 'NEGOTIABLE' || !listing.price}
      ownerName={context === 'owner' ? undefined : listing.provider.businessName}
      ownerVerified={Boolean(verified)}
      rating={rating != null ? Number(rating) : null}
      city={hidePlace ? undefined : serviceCity}
      extraMeta={
        SERVICE_LOCATION_HINT[listing.serviceLocation] ? (
          <span className={CARD_META_ITEM}>
            <span className="truncate">{SERVICE_LOCATION_HINT[listing.serviceLocation]}</span>
          </span>
        ) : null
      }
      createdAt={context === 'related' || context === 'store' ? undefined : listing.createdAt}
      className={className}
      heart={
        showHeart ? (
          <FavoriteButton
            entityType="SERVICE_LISTING"
            entityId={listing.id}
            returnTo={detailHref}
            variant="card"
            className={`${CARD_HEART_POSITION} ${HIT_AREA}`}
          />
        ) : null
      }
    />
  );
});

