import Link from 'next/link';
import Image from 'next/image';
import { BadgeCheck } from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import { formatPrice } from '@/lib/formatters';
import { getThumbnailUrl, getPlaceholderUrl, isCloudinaryUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import type { ServiceListingWithProvider, ServiceAvailability, ServicePricingType } from '@/types/service.types';

interface Props {
  listing: ServiceListingWithProvider;
  className?: string;
}

const AVAILABILITY_DOT: Record<ServiceAvailability, string> = {
  AVAILABLE: 'bg-emerald-500',
  BUSY: 'bg-amber-500',
  UNAVAILABLE: 'bg-muted-foreground',
};

const AVAILABILITY_LABEL: Record<ServiceAvailability, string> = {
  AVAILABLE: 'متاح الآن',
  BUSY: 'مشغول',
  UNAVAILABLE: 'غير متاح',
};

/** "يبدأ من 50₪" | "حسب الاتفاق" | "50₪" — pricingType-aware price label. */
function formatServicePrice(pricingType: ServicePricingType, price: string | null): string {
  if (pricingType === 'NEGOTIABLE' || !price) return 'حسب الاتفاق';
  const formatted = formatPrice(price);
  return pricingType === 'STARTING_FROM' ? `يبدأ من ${formatted}` : formatted;
}

export function ServiceListingCard({ listing, className }: Props) {
  const rawImage = listing.images[0];
  const thumb = rawImage ? getThumbnailUrl(rawImage, 400, 280) : PLACEHOLDER_SVG;
  const blurDataURL = rawImage && isCloudinaryUrl(rawImage) ? getPlaceholderUrl(rawImage) : undefined;
  const priceLabel = formatServicePrice(listing.pricingType, listing.price);

  return (
    <Link
      href={ROUTES.serviceDetail(listing.id)}
      className={cn(
        'group block overflow-hidden rounded-xl border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg',
        className
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <Image
          src={thumb}
          alt={listing.title}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
          loading="lazy"
          {...(blurDataURL && { placeholder: 'blur' as const, blurDataURL })}
        />
        <span className="absolute top-2 end-2 flex items-center gap-1 rounded-full bg-foreground/70 px-2.5 py-0.5 text-xs text-background backdrop-blur-sm">
          <span className={cn('h-1.5 w-1.5 rounded-full', AVAILABILITY_DOT[listing.provider.availabilityStatus])} />
          {AVAILABILITY_LABEL[listing.provider.availabilityStatus]}
        </span>
      </div>

      <div className="space-y-1.5 p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{listing.title}</h3>
        <p className="font-mono text-base font-bold text-primary">{priceLabel}</p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{listing.provider.businessName}</span>
          {listing.provider.sellerProfile.verified && (
            <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="مقدم خدمة موثّق" />
          )}
        </div>
      </div>
    </Link>
  );
}
