'use client';

import { useState, useCallback, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { BadgeCheck, MapPin, Clock, Eye, ChevronLeft, ChevronRight, X, Phone } from 'lucide-react';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Badge } from '@/components/shared/ui/Badge';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { ShareAdButton } from '@/components/ads/ShareAdButton';
import { ROUTES, APP_URL } from '@/lib/constants';
import { formatPrice, formatRelativeTime, formatPhone } from '@/lib/formatters';
import { getDetailImageUrl, getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import type {
  ServiceListingWithProvider,
  ServicePricingType,
  ServiceLocationType,
} from '@/types/service.types';

interface Props {
  listing: ServiceListingWithProvider;
  /** Optional CTA (e.g. ServiceRequestButton) rendered in sticky mobile bar + sidebar */
  action?: ReactNode;
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


function toWaPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('970')) return digits;
  if (digits.startsWith('0')) return `970${digits.slice(1)}`;
  return digits;
}

function ProviderContactRow({ phone }: { phone: string }) {
  const wa = toWaPhone(phone);
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={`tel:${phone}`}
        className="inline-flex flex-1 min-w-[7rem] items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium hover:bg-muted/50"
      >
        <Phone className="h-3.5 w-3.5" />
        {formatPhone(phone)}
      </a>
      {wa.length >= 9 && (
        <a
          href={`https://wa.me/${wa}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex flex-1 min-w-[7rem] items-center justify-center rounded-full border border-[#25D366]/40 bg-[#25D366]/10 px-3 py-2 text-sm font-medium text-[#128C7E] dark:text-[#25D366]"
        >
          واتساب
        </a>
      )}
    </div>
  );
}

export function ServiceListingDetail({ listing, action }: Props) {
  const images = listing.images.length > 0 ? listing.images : [PLACEHOLDER_SVG];
  const [imgIdx, setImgIdx] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const currentImg = getDetailImageUrl(images[imgIdx] ?? PLACEHOLDER_SVG);
  const shareUrl = `${APP_URL}${ROUTES.serviceDetail(listing.id)}`;

  const goPrev = useCallback(() => setImgIdx((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(
    () => setImgIdx((i) => Math.min(images.length - 1, i + 1)),
    [images.length],
  );

  return (
    <>
      <div className="flex flex-col gap-6 pb-sticky-contact-tall lg:flex-row lg:gap-8">
        <div className="min-w-0 flex-1 space-y-6">
          {/* Gallery */}
          <div className="overflow-hidden rounded-2xl bg-card shadow-sm">
            <div
              className="relative aspect-[4/3] bg-muted sm:aspect-[16/9]"
              onTouchStart={(e) => {
                touchStartX.current = e.changedTouches[0]?.clientX ?? null;
              }}
              onTouchEnd={(e) => {
                if (touchStartX.current == null || images.length <= 1) return;
                const dx =
                  (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
                touchStartX.current = null;
                if (Math.abs(dx) < 40) return;
                if (dx > 0) goPrev();
                else goNext();
              }}
            >
              <button
                type="button"
                className="absolute inset-0 cursor-zoom-in"
                onClick={() => setLightbox(true)}
                aria-label="تكبير الصورة"
              >
                <SafeImage
                  src={currentImg}
                  alt={listing.title}
                  fill
                  className="pointer-events-none object-contain"
                  sizes="(max-width:1024px) 100vw, 66vw"
                  priority
                />
              </button>
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={goPrev}
                    disabled={imgIdx === 0}
                    className="absolute start-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 shadow disabled:opacity-40"
                    aria-label="السابق"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={imgIdx === images.length - 1}
                    className="absolute end-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 shadow disabled:opacity-40"
                    aria-label="التالي"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <span className="absolute bottom-3 start-1/2 -translate-x-1/2 rounded-full bg-background/80 px-2.5 py-0.5 text-xs tabular-nums">
                    {imgIdx + 1} / {images.length}
                  </span>
                </>
              )}
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto p-3">
                {images.map((src, i) => (
                  <button
                    key={`${src}-${i}`}
                    type="button"
                    onClick={() => setImgIdx(i)}
                    className={cn(
                      'relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2',
                      i === imgIdx ? 'border-primary' : 'border-transparent opacity-70',
                    )}
                  >
                    <SafeImage
                      src={src === PLACEHOLDER_SVG ? src : getThumbnailUrl(src, 112, 112)}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="56px"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Mobile title block */}
          <div className="space-y-2 lg:hidden">
            <p className="font-mono text-2xl font-bold tabular-nums text-primary">
              {formatServicePrice(listing.pricingType, listing.price)}
            </p>
            <h1 className="text-xl font-bold leading-snug">{listing.title}</h1>
            <Meta listing={listing} />
            <div className="flex flex-wrap gap-2">
              <FavoriteButton entityType="SERVICE_LISTING" entityId={listing.id} warm />
              <ShareAdButton title={listing.title} url={shareUrl} variant="button" />
            </div>
          </div>

          <section className="space-y-2 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
            <h2 className="text-sm font-semibold">الوصف</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {listing.description?.trim() || 'لا يوجد وصف إضافي.'}
            </p>
          </section>

          <ProviderLink listing={listing} />
        </div>

        {/* Desktop sidebar */}
        <aside className="hidden w-full shrink-0 space-y-4 lg:block lg:w-[320px]">
          <div className="sticky top-20 space-y-4">
            <div className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
              <p className="font-mono text-2xl font-bold tabular-nums text-primary">
                {formatServicePrice(listing.pricingType, listing.price)}
              </p>
              <h1 className="text-xl font-bold leading-snug">{listing.title}</h1>
              <Meta listing={listing} />
              <div className="flex flex-wrap gap-2">
                <FavoriteButton entityType="SERVICE_LISTING" entityId={listing.id} warm />
                <ShareAdButton title={listing.title} url={shareUrl} variant="button" />
              </div>
              {action && <div className="pt-1 space-y-2">{action}</div>}
              {listing.provider.contactPhone && (
                <ProviderContactRow phone={listing.provider.contactPhone} />
              )}
            </div>
            <ProviderLink listing={listing} />
          </div>
        </aside>
      </div>

      {/* Mobile sticky CTA — above BottomNav; tall padding for dual buttons */}
      {action && (
        <div className="sticky-contact-bar border-t border-border/80 bg-background/95 p-3 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur supports-[backdrop-filter]:bg-background/90 lg:hidden">
          <div className="mx-auto max-w-lg space-y-2">
            {action}
            {listing.provider.contactPhone && (
              <ProviderContactRow phone={listing.provider.contactPhone} />
            )}
          </div>
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal
        >
          <button
            type="button"
            className="absolute top-4 end-4 rounded-full bg-white/10 p-2 text-white"
            onClick={() => setLightbox(false)}
            aria-label="إغلاق"
          >
            <X className="h-6 w-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={currentImg} alt={listing.title} className="max-h-[90vh] max-w-full object-contain" />
        </div>
      )}
    </>
  );
}

function Meta({ listing }: { listing: ServiceListingWithProvider }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <MapPin className="h-3.5 w-3.5" aria-hidden />
        {LOCATION_LABELS[listing.serviceLocation]}
      </span>
      {listing.durationEstimate && (
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          {listing.durationEstimate}
        </span>
      )}
      <span className="inline-flex items-center gap-1">
        <Eye className="h-3.5 w-3.5" aria-hidden />
        {listing.views} مشاهدة
      </span>
      <span>{formatRelativeTime(listing.createdAt)}</span>
    </div>
  );
}

function ProviderLink({ listing }: { listing: ServiceListingWithProvider }) {
  return (
    <Link
      href={ROUTES.userProfile(listing.provider.sellerProfile.userId)}
      className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-colors hover:bg-muted/40"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold">{listing.provider.businessName}</span>
          {listing.provider.sellerProfile.verified && (
            <Badge className="gap-1 text-[10px]">
              <BadgeCheck className="h-3 w-3" /> موثّق
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">عرض ملف مقدم الخدمة وخدماته</p>
      </div>
      <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
