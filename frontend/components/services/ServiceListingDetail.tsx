import Image from 'next/image';
import Link from 'next/link';
import { BadgeCheck, MapPin, Clock, Eye } from 'lucide-react';
import { Badge } from '@/components/shared/ui/Badge';
import { ROUTES } from '@/lib/constants';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import type { ServiceListingWithProvider, ServicePricingType, ServiceLocationType } from '@/types/service.types';

interface Props {
  listing: ServiceListingWithProvider;
}

const LOCATION_LABELS: Record<ServiceLocationType, string> = {
  AT_CUSTOMER: 'لدى العميل',
  AT_PROVIDER: 'لدى مقدم الخدمة',
  REMOTE: 'عن بُعد',
};

function formatServicePrice(pricingType: ServicePricingType, price: string | null): string {
  if (pricingType === 'NEGOTIABLE' || !price) return 'حسب الاتفاق';
  const formatted = formatPrice(price);
  return pricingType === 'STARTING_FROM' ? `يبدأ من ${formatted}` : formatted;
}

export function ServiceListingDetail({ listing }: Props) {
  const images = listing.images.length > 0 ? listing.images : [PLACEHOLDER_SVG];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {images.slice(0, 4).map((img, i) => (
          <div key={i} className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted">
            <Image
              src={img === PLACEHOLDER_SVG ? img : getThumbnailUrl(img, 600, 450)}
              alt={`${listing.title} — صورة ${i + 1}`}
              fill
              className="object-cover"
              sizes="(max-width:640px) 100vw, 50vw"
            />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <h1 className="text-xl font-bold">{listing.title}</h1>
        <p className="text-lg font-bold text-primary">
          {formatServicePrice(listing.pricingType, listing.price)}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="h-4 w-4" /> {LOCATION_LABELS[listing.serviceLocation]}
          </span>
          {listing.durationEstimate && (
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" /> {listing.durationEstimate}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Eye className="h-4 w-4" /> {listing.views}
          </span>
          <span>{formatRelativeTime(listing.createdAt)}</span>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold">الوصف</h2>
        <p className="text-sm whitespace-pre-line">{listing.description}</p>
      </div>

      <Link
        href={ROUTES.serviceProvider(listing.provider.id)}
        className="flex items-center gap-2 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-medium">{listing.provider.businessName}</span>
            {listing.provider.sellerProfile.verified && (
              <Badge className="gap-1">
                <BadgeCheck className="h-3.5 w-3.5" /> موثّق
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">عرض كل خدمات {listing.provider.businessName}</p>
        </div>
      </Link>
    </div>
  );
}
