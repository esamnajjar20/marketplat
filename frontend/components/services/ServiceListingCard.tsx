'use client';

import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Star } from 'lucide-react';
import { CardKindBadge, CardOfflineBadge, type CardContext, useNowAfterMount } from '@/components/shared/cards/cardParts';
import { CARD_BODY_COMPACT, CARD_BODY_DEFAULT, CARD_HEART_POSITION, CARD_IMAGE_43, CARD_PRESS, CARD_SHELL, HIT_AREA, TIME_PLACEHOLDER, freshnessClass } from '@/components/shared/cards/cardTokens';
import { Badge } from '@/components/ui/badge';
import { ROUTES } from '@/lib/constants';
import { formatRelativeTime, formatServicePrice } from '@/lib/formatters';
import { getListThumbnailUrl, getPlaceholderUrl, isCloudinaryUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import type { ServiceListingWithProvider, ServiceAvailability, ServiceTypeField } from '@/types/service.types';

interface Props { listing: ServiceListingWithProvider; context?: CardContext; className?: string; priority?: boolean; density?: 'default' | 'compact'; layout?: 'grid' | 'list'; showKind?: boolean; }
const AVAILABILITY_LABEL: Record<ServiceAvailability, string> = { AVAILABLE: 'متاح الآن', BUSY: 'مشغول', UNAVAILABLE: 'غير متاح' };
const AVAILABILITY_VARIANT: Record<ServiceAvailability, 'overlay-success' | 'warning' | 'secondary'> = { AVAILABLE: 'overlay-success', BUSY: 'warning', UNAVAILABLE: 'secondary' };
const SERVICE_LOCATION_HINT: Record<string, string> = { AT_CUSTOMER: 'عند العميل', AT_PROVIDER: 'عند مقدم الخدمة', REMOTE: 'عن بُعد' };

function fieldValue(field: ServiceTypeField, value: unknown): string {
  if (field.type === 'BOOLEAN') return value === true ? 'نعم' : 'لا';
  if (field.type === 'MULTI_SELECT' && Array.isArray(value)) {
    const labels = new Map((field.options ?? []).map((option) => [option.value, option.labelAr]));
    return value.map((item) => labels.get(String(item)) ?? String(item)).join('، ');
  }
  if (field.type === 'SELECT') return field.options?.find((option) => option.value === value)?.labelAr ?? String(value);
  return String(value);
}

export function ServiceListingCard({ listing, context = 'public', className, priority = false, density = 'default', layout = 'grid', showKind = false }: Props) {
  const compact = density === 'compact' || layout === 'list';
  const detailHref = ROUTES.serviceDetail(listing.id);
  const rawImage = listing.images[0];
  const thumb = rawImage ? getListThumbnailUrl(rawImage, 320, 240) : PLACEHOLDER_SVG;
  const blurDataURL = rawImage && isCloudinaryUrl(rawImage) ? getPlaceholderUrl(rawImage) : undefined;
  const priceLabel = formatServicePrice(listing.pricingType, listing.price);
  const now = useNowAfterMount();
  const timeColorClass = freshnessClass(now, listing.createdAt);
  const showLocation = context !== 'store' && context !== 'owner';
  const showTime = context === 'public' || context === 'favorites' || context === 'featured' || context === 'owner';
  const showProvider = context === 'favorites' || context === 'catalog';
  const showHeart = context !== 'owner';
  const cardFields = (listing.serviceType?.fields ?? []).filter((field) => field.scope === 'LISTING' && field.isActive && field.showOnCard && listing.attributes?.[field.key] !== undefined && listing.attributes?.[field.key] !== null && listing.attributes?.[field.key] !== '').slice(0, compact ? 1 : 2);

  return (
    <article className={cn('group relative h-full min-w-0', className)}>
      <Link href={detailHref} prefetch={false} className={cn(CARD_SHELL, 'group/card flex transition-[transform,box-shadow,border-color] duration-200', layout === 'list' ? 'flex-row' : 'flex-col', 'hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md active:scale-[0.995]', 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', CARD_PRESS)}>
        <div className={cn(CARD_IMAGE_43, layout === 'list' && 'aspect-auto h-28 w-28 shrink-0 sm:h-36 sm:w-44')}>
          <SafeImage src={thumb} alt={listing.title} fill className="object-cover transition-transform duration-200 group-hover/card:scale-[1.02]" sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" priority={priority} loading={priority ? undefined : 'lazy'} {...(blurDataURL && { placeholder: 'blur' as const, blurDataURL })} />
          <CardOfflineBadge />
          <div className="absolute start-2 top-2 z-10 flex max-w-[68%] flex-col items-start gap-1">
            {showKind && <CardKindBadge kind="service" />}
            <Badge size="xs" variant={AVAILABILITY_VARIANT[listing.provider.availabilityStatus]}>{AVAILABILITY_LABEL[listing.provider.availabilityStatus]}</Badge>
          </div>
        </div>
        <div className={compact ? CARD_BODY_COMPACT : CARD_BODY_DEFAULT}>
          <div className="flex min-h-6 flex-wrap items-center gap-1.5">
            <span dir="ltr" className={cn('font-mono font-bold tabular-nums tracking-tight text-primary', compact ? 'text-base' : 'text-lg')}>{priceLabel}</span>
            {listing.pricingType === 'NEGOTIABLE' && <Badge size="xs" variant="soft">قابل للتفاوض</Badge>}
            {listing.serviceType?.nameAr && <Badge size="xs" variant="outline">{listing.serviceType.nameAr}</Badge>}
          </div>
          <h3 className="line-clamp-2 min-h-[2.5em] text-sm font-semibold leading-snug text-foreground">{listing.title}</h3>
          {listing.provider.sellerProfile.averageRating != null ? (
            <div className="flex min-h-4 items-center gap-1 text-xs text-muted-foreground" aria-label={`التقييم ${Number(listing.provider.sellerProfile.averageRating).toFixed(1)} من 5`}>
              <Star className="h-3.5 w-3.5 fill-current text-amber-500" aria-hidden />
              <span className="font-medium text-foreground">{Number(listing.provider.sellerProfile.averageRating).toFixed(1)}</span>
              <span>تقييم مقدم الخدمة</span>
            </div>
          ) : null}
          {cardFields.length > 0 && (
            <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {cardFields.map((field) => (
                <span key={field.id} className="min-w-0 truncate">{field.cardLabelAr || field.labelAr}: {fieldValue(field, listing.attributes?.[field.key])}</span>
              ))}
            </div>
          )}
          <div className="mt-auto flex min-h-5 items-center gap-2 border-t border-border/40 pt-2 text-xs text-muted-foreground">
            {showLocation && (SERVICE_LOCATION_HINT[listing.serviceLocation] || listing.provider.serviceAreaCities?.[0]) && <span className="min-w-0 truncate">{SERVICE_LOCATION_HINT[listing.serviceLocation] || listing.provider.serviceAreaCities?.[0]}</span>}
            {showProvider && <span className="min-w-0 truncate">{listing.provider.businessName}</span>}
            {showTime && now !== null && <span className={cn('ms-auto shrink-0 whitespace-nowrap tabular-nums', timeColorClass)}>{formatRelativeTime(listing.createdAt, now)}</span>}
            {showTime && now === null && <span className="ms-auto shrink-0">{TIME_PLACEHOLDER}</span>}
          </div>
        </div>
      </Link>
      {showHeart && <FavoriteButton entityType="SERVICE_LISTING" entityId={listing.id} variant="card" className={`${CARD_HEART_POSITION} ${HIT_AREA}`} />}
    </article>
  );
}
