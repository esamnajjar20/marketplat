'use client';

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { MapPin, Clock, Eye, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { ShareAdButton } from '@/components/ads/ShareAdButton';
import { ReportServiceButton } from '@/components/services/ReportServiceButton';
import { ProviderContactCard } from '@/components/services/ProviderContactCard';
import { ROUTES, APP_URL } from '@/lib/constants';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { getDetailImageUrl, getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import type {
  ServiceListingWithProvider,
  ServicePricingType,
  ServiceLocationType,
} from '@/types/service.types';

interface Props {
  listing: ServiceListingWithProvider;
  /** Primary CTA only (e.g. طلب خدمة) — messaging lives on ProviderContactCard */
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

export function ServiceListingDetail({ listing, action }: Props) {
  const images = listing.images.length > 0 ? listing.images : [PLACEHOLDER_SVG];
  const [imgIdx, setImgIdx] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const currentImg = getDetailImageUrl(images[imgIdx] ?? PLACEHOLDER_SVG);
  const shareUrl = `${APP_URL}${ROUTES.serviceDetail(listing.id)}`;
  // FIX LIGHTBOX-THUMBNAILS-CLIP: was `images.slice(0, 3)` — only the
  // first three thumbnails ever rendered, so navigating to image 4+
  // via the arrows left no thumbnail highlighted (the `i === imgIdx`
  // check could never match a thumbnail that didn't exist). Users on
  // a listing with more than three photos had no visual indication
  // of which image they were viewing beyond the “n / total” counter.
  // The thumbnail container already has overflow-x-auto, so the full
  // strip fits and scrolls on narrow screens.
  const thumbnailImages = images;

  const goPrev = useCallback(() => setImgIdx((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(
    () => setImgIdx((i) => Math.min(images.length - 1, i + 1)),
    [images.length],
  );

  // FIX LIGHTBOX-A11Y: the lightbox only had an explicit close
  // button before. Three small gaps, all closed by one effect:
  //
  //   1. Escape did nothing — a keyboard user could open the
  //      viewer but not dismiss it without a mouse (WAI-ARIA's
  //      dialog pattern requires Escape).
  //   2. The page behind the overlay kept scrolling on touch,
  //      which both looked wrong and made the page position after
  //      closing unpredictable on a phone.
  //   3. Backdrop clicks did nothing (handled on the wrapper's
  //      own onClick below).
  //
  // prevOverflow is captured/restored rather than set to '' —
  // another library or a parent effect could legitimately own
  // that style at unmount time, and clobbering it here would
  // leave the page scroll-locked permanently.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [lightbox]);

  return (
    <>
      <div className="flex flex-col gap-5 pb-28 md:flex-row md:gap-8 md:pb-8">
        {/* ── Main column ── */}
        <div className="min-w-0 flex-1 space-y-5">
          {/* Gallery */}
          <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
            <div
              className="relative aspect-[4/3] bg-muted sm:aspect-[16/10]"
              onTouchStart={(e) => {
                touchStartX.current = e.changedTouches[0]?.clientX ?? null;
              }}
              onTouchEnd={(e) => {
                if (touchStartX.current == null || images.length <= 1) return;
                const dx =
                  (e.changedTouches[0]?.clientX ?? touchStartX.current) -
                  touchStartX.current;
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
                  priority={imgIdx === 0}
                />
              </button>
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={goPrev}
                    disabled={imgIdx === 0}
                    className="absolute start-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white disabled:opacity-30"
                    aria-label="السابق"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={imgIdx === images.length - 1}
                    className="absolute end-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white disabled:opacity-30"
                    aria-label="التالي"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <span className="absolute bottom-2 start-1/2 -translate-x-1/2 rounded-full bg-black/50 px-2.5 py-0.5 text-xs text-white">
                    {imgIdx + 1} / {images.length}
                  </span>
                </>
              )}
            </div>
            {thumbnailImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto border-t border-border/60 p-2">
                {thumbnailImages.map((src, i) => (
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
                      src={getThumbnailUrl(src)}
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

          {/* Title + price */}
          <header className="space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h1 className="text-xl font-bold leading-snug tracking-tight sm:text-2xl">
                {listing.title}
              </h1>
              <div className="flex items-center gap-1">
                <FavoriteButton entityType="SERVICE_LISTING" entityId={listing.id} warm />
                <ShareAdButton title={listing.title} url={shareUrl} variant="button" />
              </div>
            </div>
            <p className="text-lg font-semibold text-primary">
              {formatServicePrice(listing.pricingType, listing.price)}
            </p>
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
          </header>

          {/* Description */}
          {listing.description && (
            <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
              <h2 className="mb-2 text-sm font-semibold">التفاصيل</h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {listing.description}
              </p>
            </div>
          )}

          {/* Provider — mobile (desktop has sidebar) */}
          <div className="md:hidden">
            <h2 className="mb-2 text-sm font-semibold">مقدم الخدمة</h2>
            <ProviderContactCard listing={listing} />
          </div>

          <div className="flex justify-end">
            <ReportServiceButton serviceListingId={listing.id} />
          </div>
        </div>

        {/* ── Desktop sidebar ── */}
        <aside className="hidden w-full shrink-0 space-y-4 md:block md:w-[300px]">
          <div className="sticky top-20 space-y-4">
            {action && (
              <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
                {action}
              </div>
            )}
            <ProviderContactCard listing={listing} />
          </div>
        </aside>
      </div>

      {/* Mobile sticky: request only (message is on provider card above) */}
      {action && (
        <div
          className="fixed inset-x-0 bottom-16 z-30 border-t border-border/80 bg-card/95 p-3 backdrop-blur md:hidden"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          {action}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal
          // FIX LIGHTBOX-A11Y: e.target !== e.currentTarget keeps
          // clicks on the image or the close button from bubbling
          // up and dismissing the lightbox unexpectedly — the
          // pattern matches every other dismiss-on-backdrop modal
          // in the app.
          onClick={(e) => {
            if (e.target === e.currentTarget) setLightbox(false);
          }}
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
          <img
            src={currentImg}
            alt={listing.title}
            className="max-h-[90vh] max-w-full object-contain"
          />
        </div>
      )}
    </>
  );
}
