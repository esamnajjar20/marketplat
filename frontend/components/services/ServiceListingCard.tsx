import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { BadgeCheck, Clock, MapPin, Star } from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import {
  getListThumbnailUrl,
  getPlaceholderUrl,
  isCloudinaryUrl,
  PLACEHOLDER_SVG,
  getAvatarUrl,
} from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import type {
  ServiceListingWithProvider,
  ServiceAvailability,
  ServicePricingType,
} from '@/types/service.types';

interface Props {
  listing: ServiceListingWithProvider;
  className?: string;
  /** Same as AdCard: pass for above-the-fold cards to improve LCP. */
  priority?: boolean;
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

function formatServicePrice(pricingType: ServicePricingType, price: string | null): string {
  if (pricingType === 'NEGOTIABLE' || !price) return 'حسب الاتفاق';
  const formatted = formatPrice(price);
  return pricingType === 'STARTING_FROM' ? `يبدأ من ${formatted}` : formatted;
}

/**
 * Service listing card — aligned with AdCard hierarchy:
 * image + availability → price-first → title → area → provider footer
 * (logo / name / verified / rating / time).
 */
export function ServiceListingCard({ listing, className, priority = false }: Props) {
  const rawImage = listing.images[0];
  const thumb = rawImage ? getListThumbnailUrl(rawImage, 400, 280) : PLACEHOLDER_SVG;
  const blurDataURL = rawImage && isCloudinaryUrl(rawImage) ? getPlaceholderUrl(rawImage) : undefined;
  const priceLabel = formatServicePrice(listing.pricingType, listing.price);
  const isNegotiable = listing.pricingType === 'NEGOTIABLE' || !listing.price;

  const ageHours = (Date.now() - new Date(listing.createdAt).getTime()) / 3_600_000;
  const timeColorClass =
    ageHours < 24 ? 'text-success' : ageHours < 24 * 7 ? 'text-warning' : 'text-muted-foreground';

  const providerLogo = getAvatarUrl(listing.provider.logoUrl ?? '', 32);
  const rating = listing.provider.sellerProfile.averageRating
    ? parseFloat(listing.provider.sellerProfile.averageRating)
    : NaN;
  const hasRating = Number.isFinite(rating) && rating > 0;
  const cityHint =
    listing.serviceLocation === 'AT_CUSTOMER'
      ? 'عند العميل'
      : listing.serviceLocation === 'AT_PROVIDER'
        ? 'عند مقدم الخدمة'
        : listing.serviceLocation === 'REMOTE'
          ? 'عن بُعد'
          : null;

  return (
    <div className="relative">
      <Link
        href={ROUTES.serviceDetail(listing.id)}
        className={cn(
          'group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all duration-200',
          'active:scale-[0.98] hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
          className,
        )}
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          <SafeImage
            src={thumb}
            alt={listing.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
            priority={priority}
            loading={priority ? undefined : 'lazy'}
            {...(blurDataURL && { placeholder: 'blur' as const, blurDataURL })}
          />
          <span className="absolute top-2 end-2 flex items-center gap-1 rounded-full bg-foreground/70 px-2.5 py-0.5 text-[10px] font-medium text-background backdrop-blur-sm">
            <span
              className={cn('h-1.5 w-1.5 rounded-full', AVAILABILITY_DOT[listing.provider.availabilityStatus])}
            />
            {AVAILABILITY_LABEL[listing.provider.availabilityStatus]}
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-1.5 p-4">
          {/* Price first — same hierarchy as AdCard */}
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="font-mono text-xl font-bold tabular-nums text-primary">{priceLabel}</p>
            {isNegotiable && listing.pricingType === 'NEGOTIABLE' && (
              <span className="rounded-full border border-primary/30 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                قابل للتفاوض
              </span>
            )}
          </div>

          <h3 className="line-clamp-2 min-h-0 flex-1 text-lg leading-snug text-foreground">
            {listing.title}
          </h3>

          <div className="mt-auto flex flex-col gap-1.5 pt-2">
            {(cityHint || listing.durationEstimate) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {cityHint && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{cityHint}</span>
                  </span>
                )}
                {listing.durationEstimate && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3 shrink-0" aria-hidden />
                    {listing.durationEstimate}
                  </span>
                )}
              </div>
            )}

            <div className="flex min-w-0 items-center gap-1.5">
              <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full bg-muted">
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
              {listing.provider.sellerProfile.verified && (
                <BadgeCheck
                  className="h-3.5 w-3.5 shrink-0 text-primary"
                  aria-label="مقدم خدمة موثّق"
                />
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                {hasRating ? (
                  <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Star className="h-3 w-3 fill-rating text-rating" aria-hidden />
                    {rating.toFixed(1)}
                  </span>
                ) : (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
                    مقدم خدمة
                  </span>
                )}
              </div>
              <span className={cn('shrink-0 whitespace-nowrap text-[10px] tabular-nums', timeColorClass)}>
                {formatRelativeTime(listing.createdAt)}
              </span>
            </div>
          </div>
        </div>
      </Link>

      <FavoriteButton
        entityType="SERVICE_LISTING"
        entityId={listing.id}
        size="sm"
        className="absolute top-2 end-2"
      />
    </div>
  );
}
