'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { CardKindBadge, CardOfflineBadge, type CardContext, useNowAfterMount } from '@/components/shared/cards/cardParts';
import { CARD_BODY_COMPACT, CARD_BODY_DEFAULT, CARD_IMAGE_43, CARD_SHELL, HIT_AREA, TIME_PLACEHOLDER, freshnessClass } from '@/components/shared/cards/cardTokens';
import { Badge } from '@/components/ui/badge';
import { ROUTES } from '@/lib/constants';
import { formatRelativeTime, formatServicePrice } from '@/lib/formatters';
import { getListThumbnailUrl, getPlaceholderUrl, isCloudinaryUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import type { ServiceListingWithProvider, ServiceAvailability } from '@/types/service.types';

interface Props { listing: ServiceListingWithProvider; context?: CardContext; className?: string; priority?: boolean; density?: 'default' | 'compact'; showKind?: boolean; }
const AVAILABILITY_LABEL: Record<ServiceAvailability, string> = { AVAILABLE: 'متاح الآن', BUSY: 'مشغول', UNAVAILABLE: 'غير متاح' };
const SERVICE_LOCATION_HINT: Record<string, string> = { AT_CUSTOMER: 'عند العميل', AT_PROVIDER: 'عند مقدم الخدمة', REMOTE: 'عن بُعد' };

export function ServiceListingCard({ listing, context = 'public', className, priority = false, density = 'default', showKind = false }: Props) {
  const compact = density === 'compact';
  const router = useRouter();
  const detailHref = ROUTES.serviceDetail(listing.id);
  const rawImage = listing.images[0];
  const thumb = rawImage ? getListThumbnailUrl(rawImage, 320, 240) : PLACEHOLDER_SVG;
  const blurDataURL = rawImage && isCloudinaryUrl(rawImage) ? getPlaceholderUrl(rawImage) : undefined;
  const priceLabel = formatServicePrice(listing.pricingType, listing.price);
  const now = useNowAfterMount();
  const timeColorClass = freshnessClass(now, listing.createdAt);
  const showLocation = context !== 'store' && context !== 'owner';
  const showTime = context === 'public' || context === 'favorites' || context === 'featured';
  const showProvider = context === 'favorites';
  const showHeart = context !== 'owner';
  function warmDetail() { router.prefetch(detailHref); }

  return (
    <article className={cn('group relative h-full min-w-0', className)}>
      <Link href={detailHref} prefetch={false} onPointerEnter={warmDetail} onFocus={warmDetail} className={cn(CARD_SHELL, 'group/card flex flex-col transition-[transform,box-shadow,border-color] duration-200', 'hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md', 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', 'active:scale-[0.99]')}>
        <div className={CARD_IMAGE_43}>
          <SafeImage src={thumb} alt={listing.title} fill className="object-cover transition-transform duration-200 group-hover/card:scale-[1.02]" sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" priority={priority} loading={priority ? undefined : 'lazy'} {...(blurDataURL && { placeholder: 'blur' as const, blurDataURL })} />
          <CardOfflineBadge />
          <div className="absolute start-2 top-2 z-10 flex max-w-[68%] flex-col items-start gap-1">
            {showKind && <CardKindBadge kind="service" />}
            <Badge size="xs" variant="overlay">{AVAILABILITY_LABEL[listing.provider.availabilityStatus]}</Badge>
          </div>
          {showHeart && <FavoriteButton entityType="SERVICE_LISTING" entityId={listing.id} size="sm" className={`absolute end-2 top-2 z-20 !h-9 !w-9 bg-background/95 shadow-md backdrop-blur ${HIT_AREA}`} />}
        </div>
        <div className={compact ? CARD_BODY_COMPACT : CARD_BODY_DEFAULT}>
          <div className="flex min-h-6 flex-wrap items-baseline gap-1.5"><span dir="ltr" className={cn('font-mono font-bold tabular-nums tracking-tight text-primary', compact ? 'text-base' : 'text-lg')}>{priceLabel}</span>{listing.pricingType === 'NEGOTIABLE' && <Badge size="xs" variant="soft">قابل للتفاوض</Badge>}</div>
          <h3 className="line-clamp-2 min-h-[2.5em] text-sm font-semibold leading-snug text-foreground">{listing.title}</h3>
          <div className="mt-auto flex min-h-5 items-center gap-2 border-t border-border/40 pt-2 text-xs text-muted-foreground">
            {showLocation && (SERVICE_LOCATION_HINT[listing.serviceLocation] || listing.provider.serviceAreaCities?.[0]) && <span className="truncate">{SERVICE_LOCATION_HINT[listing.serviceLocation] || listing.provider.serviceAreaCities?.[0]}</span>}
            {showProvider && <span className="truncate">{listing.provider.businessName}</span>}
            {showTime && now !== null && <span className={cn('ms-auto shrink-0 whitespace-nowrap tabular-nums', timeColorClass)}>{formatRelativeTime(listing.createdAt, now)}</span>}
            {showTime && now === null && <span className="ms-auto shrink-0">{TIME_PLACEHOLDER}</span>}
          </div>
        </div>
      </Link>
    </article>
  );
}
