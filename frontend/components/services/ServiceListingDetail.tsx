'use client';

import { useStickyCtaVisible } from '@/hooks/useStickyCtaVisible';
import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { MapPin, Clock, Eye, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { ZoomableDetailImage } from '@/components/shared/detail/ZoomableDetailImage';
import { ProgressiveDetailImage } from '@/components/shared/detail/ProgressiveDetailImage';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { ShareAdButton } from '@/components/ads/ShareAdButton';
import { ReportServiceButton } from '@/components/services/ReportServiceButton';
import { SaveOfflineButton } from '@/components/shared/SaveOfflineButton';
import { ProviderContactCard } from '@/components/services/ProviderContactCard';
import { MessageUserButtonGate } from '@/components/profile/MessageUserButtonGate';
import { DetailSafetyTips } from '@/components/shared/DetailSafetyTips';
import { ServiceTypeAttributesDisplay } from '@/components/services/ServiceTypeAttributesDisplay';
import { ServiceListingMatches } from '@/components/services/ServiceListingMatches';
import { ROUTES, APP_URL } from '@/lib/constants';
import { formatRelativeTime, formatServicePrice } from '@/lib/formatters';
import { getDetailImageUrl, getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import { DETAIL_GALLERY_SHELL, DETAIL_PANEL_PADDED, DETAIL_SECTION_TITLE, DETAIL_THUMBNAIL_RAIL } from '@/components/shared/detail/detailTokens';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { ServiceListingWithProvider, ServiceLocationType } from '@/types/service.types';

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

export function ServiceListingDetail({ listing, action }: Props) {
  const stickyCta = useStickyCtaVisible();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  const images = listing.images.length > 0 ? listing.images : [PLACEHOLDER_SVG];
  const [imgIdx, setImgIdx] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const thumbnailRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const currentImg = getDetailImageUrl(images[imgIdx] ?? PLACEHOLDER_SVG);

  // Keep the active thumbnail visible when users navigate with arrows,
  // keyboard shortcuts, swipe gestures, or direct thumbnail selection.
  // Respect reduced-motion preferences and avoid any work during SSR.
  useEffect(() => {
    const activeThumbnail = thumbnailRefs.current[imgIdx];
    if (!activeThumbnail) return;
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    activeThumbnail.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  }, [imgIdx, images.length]);
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

  useEffect(() => {
    if (!lightbox || images.length <= 1) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') goNext();
      if (event.key === 'ArrowRight') goPrev();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightbox, images.length, goNext, goPrev]);

  const providerUserId = listing.provider.sellerProfile?.userId;

  return (
    <>
      <div className={cn('flex flex-col gap-5 md:flex-row md:gap-8 md:pb-8', providerUserId ? 'pb-sticky-contact' : 'pb-28')}>
        {/* ── Main column ── */}
        <div className="min-w-0 flex-1 space-y-5">
          {/* Gallery */}
          <div className={DETAIL_GALLERY_SHELL}>
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
                <ProgressiveDetailImage
                  src={currentImg}
                  alt={listing.title}
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
              <div className={DETAIL_THUMBNAIL_RAIL}>
                {thumbnailImages.map((src, i) => (
                  <button
                    key={`${src}-${i}`}
                    ref={(node) => { thumbnailRefs.current[i] = node; }}
                    type="button"
                    onClick={() => setImgIdx(i)}
                    aria-label={`الصورة ${i + 1} من ${thumbnailImages.length}`}
                    aria-current={i === imgIdx ? 'true' : undefined}
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
                {/* SAVE-ENTITY-SERVICE-01: icon variant fits in this tight
                    action row next to FavoriteButton. Saves the API
                    response + every image so the service page opens
                    offline. */}
                <SaveOfflineButton
                  type="service"
                  id={listing.id}
                  title={listing.title}
                  subtitle={listing.price != null ? String(listing.price) : null}
                  city={null}
                  thumbnail={listing.images?.[0] ?? null}
                  imageUrls={listing.images ?? []}
                  variant="icon"
                />
                {/* SHARE-QR-WIRE-SERVICE: extra carries the service
                    location type (منزلي / عند مقدم الخدمة / عن بُعد). */}
                <ShareAdButton
                  title={listing.title}
                  url={shareUrl}
                  variant="button"
                  qrPayload={{
                    kind: 'service',
                    title: listing.title,
                    price: listing.price ?? null,
                    city: '',
                    extra: LOCATION_LABELS[listing.serviceLocation] ?? '',
                    desc: listing.description ?? '',
                  }}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-semibold text-primary">
                {formatServicePrice(listing.pricingType, listing.price)}
              </p>
              {listing.provider.availabilityStatus === 'UNAVAILABLE' && (
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">غير متاح حاليًا</span>
              )}
              {listing.provider.sellerProfile?.verified && (
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">مقدم موثّق</span>
              )}
            </div>
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
              <span>{now === null ? '—' : formatRelativeTime(listing.createdAt, now)}</span>
            </div>
          </header>

          <ServiceTypeAttributesDisplay listing={listing} />
          <ServiceListingMatches listingId={listing.id} />

          {/* Description */}
          {listing.description && (
            <div className={DETAIL_PANEL_PADDED}>
              <h2 className={cn(DETAIL_SECTION_TITLE, 'mb-2')}>التفاصيل</h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {listing.description}
              </p>
            </div>
          )}

          <DetailSafetyTips />

          {/* CTA + Provider — mobile (desktop has sidebar) */}
          <div className="space-y-3 md:hidden">
            {action ? (
              <div className={DETAIL_PANEL_PADDED}>
                {action}
              </div>
            ) : null}
            <div>
              <h2 className={cn(DETAIL_SECTION_TITLE, 'mb-2')}>مقدم الخدمة</h2>
              <ProviderContactCard listing={listing} />
            </div>
          </div>

          <div className="flex justify-end">
            <ReportServiceButton serviceListingId={listing.id} />
          </div>
        </div>

        {/* ── Desktop sidebar ── */}
        <aside className="hidden w-full shrink-0 space-y-4 md:block md:w-[300px]">
          <div className="space-y-4">
            {action && (
              <div className={DETAIL_PANEL_PADDED}>
                {action}
              </div>
            )}
            <ProviderContactCard listing={listing} />
          </div>
        </aside>
      </div>


      {/* Mobile sticky contact CTA — price + message above BottomNav */}
      {providerUserId && (
        <div className={cn('sticky-contact-bar md:hidden border-t border-border bg-card/95 px-4 py-3 shadow-[0_-4px_16px_-8px_hsl(var(--shadow-color)/0.12)] backdrop-blur supports-[backdrop-filter]:bg-card/90', stickyCta.transitionClass, stickyCta.hiddenClass)}>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-primary truncate">
                {formatServicePrice(listing.pricingType, listing.price)}
              </p>
            </div>
            <MessageUserButtonGate
              targetUserId={providerUserId}
              size="lg"
              variant="default"
              label="مراسلة"
              context={{ type: 'service', id: listing.id }}
              className="shrink-0 gap-2 rounded-xl"
            />
          </div>
        </div>
      )}

      <Dialog open={lightbox} onOpenChange={setLightbox}>
        <DialogContent
          className="flex h-[100dvh] w-screen max-w-none flex-col rounded-none border-0 bg-black/95 p-0 text-white shadow-none [&>button]:hidden"
        >
          <DialogTitle className="sr-only">معرض صور الخدمة</DialogTitle>
          <div className="flex shrink-0 items-center justify-between px-4 py-3">
            <span className="rounded-full bg-white/10 px-3 py-1 text-sm tabular-nums" aria-live="polite">
              {imgIdx + 1} / {images.length}
            </span>
            <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              onClick={() => setLightbox(false)} aria-label="إغلاق المعرض">
              <X className="h-6 w-6" />
            </button>
          </div>
          <div className="relative min-h-0 flex-1"
            onTouchStart={(e) => { touchStartX.current = e.changedTouches[0]?.clientX ?? null; }}
            onTouchEnd={(e) => {
              if (touchStartX.current == null || images.length <= 1) return;
              const dx = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
              touchStartX.current = null;
              if (Math.abs(dx) < 40) return;
              if (dx > 0) goPrev(); else goNext();
            }}>
            <ZoomableDetailImage key={imgIdx} src={currentImg} alt={listing.title} onSwipeNext={goNext} onSwipePrevious={goPrev} priority={imgIdx === 0} previousSrc={imgIdx > 0 ? getDetailImageUrl(images[imgIdx - 1] ?? PLACEHOLDER_SVG) : undefined} nextSrc={imgIdx < images.length - 1 ? getDetailImageUrl(images[imgIdx + 1] ?? PLACEHOLDER_SVG) : undefined} />
            {images.length > 1 && (
              <>
                <button type="button" onClick={goPrev} disabled={imgIdx === 0} aria-label="الصورة السابقة"
                  className="absolute start-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                  <ChevronRight className="h-6 w-6" />
                </button>
                <button type="button" onClick={goNext} disabled={imgIdx === images.length - 1} aria-label="الصورة التالية"
                  className="absolute end-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                  <ChevronLeft className="h-6 w-6" />
                </button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
