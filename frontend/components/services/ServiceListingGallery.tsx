'use client';

import { memo, useCallback, useEffect, useRef, useState, type TouchEvent } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, X } from 'lucide-react';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import dynamic from 'next/dynamic';
import { ProgressiveDetailImage } from '@/components/shared/detail/ProgressiveDetailImage';
import { Dialog, DialogContent, DialogTitle } from '@/components/shared/ui/Dialog';
import { getDetailImageUrl, getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import {
  DETAIL_GALLERY_SHELL,
  DETAIL_THUMBNAIL_RAIL,
} from '@/components/shared/detail/detailTokens';

// PERF: only rendered inside the lightbox (opened by tap) — keep it out of the first load.
const ZoomableDetailImage = dynamic(
  () => import('@/components/shared/detail/ZoomableDetailImage').then((m) => m.ZoomableDetailImage),
  { ssr: false, loading: () => null },
);

interface Props {
  images: string[];
  title: string;
}

/** Keep photo navigation local to the gallery instead of re-rendering the
 * service description, provider panel, reviews and contact actions. */
export const ServiceListingGallery = memo(function ServiceListingGallery({ images, title }: Props) {
  const [imageIndex, setImageIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const thumbnailRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const hasImages = images.length > 0;
  const displayImages = hasImages ? images : [PLACEHOLDER_SVG];
  const imageCount = displayImages.length;
  const currentImage = getDetailImageUrl(displayImages[imageIndex] ?? PLACEHOLDER_SVG);

  const goPrevious = useCallback(() => {
    setImageIndex((current) => Math.max(0, current - 1));
  }, []);
  const goNext = useCallback(() => {
    setImageIndex((current) => Math.min(imageCount - 1, current + 1));
  }, [imageCount]);

  const previousImagesRef = useRef(images);
  useEffect(() => {
    if (previousImagesRef.current === images) return;
    previousImagesRef.current = images;
    setImageIndex(0);
    setLightboxOpen(false);
  }, [images]);

  useEffect(() => {
    const activeThumbnail = thumbnailRefs.current[imageIndex];
    if (!activeThumbnail) return;
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    activeThumbnail.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  }, [imageIndex, imageCount]);

  useEffect(() => {
    if (!lightboxOpen || imageCount <= 1) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') goNext();
      if (event.key === 'ArrowRight') goPrevious();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxOpen, imageCount, goNext, goPrevious]);

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null || imageCount <= 1) return;
    const deltaX = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(deltaX) < 40) return;
    if (deltaX > 0) goPrevious();
    else goNext();
  };

  return (
    <>
      <div className={cn(DETAIL_GALLERY_SHELL, 'lg:shadow-md')} data-testid="service-listing-gallery">
        <div
          className="relative aspect-[4/3] bg-muted sm:aspect-[16/9]"
          onTouchStart={(event) => { touchStartX.current = event.changedTouches[0]?.clientX ?? null; }}
          onTouchEnd={handleTouchEnd}
        >
          {hasImages ? (
            <button
              type="button"
              className="absolute inset-0 cursor-zoom-in"
              onClick={() => setLightboxOpen(true)}
              aria-label="تكبير الصورة"
            >
              <ProgressiveDetailImage
                src={currentImage}
                alt={title}
                className="pointer-events-none object-contain"
                sizes="(max-width:1024px) 100vw, 66vw"
                priority={imageIndex === 0}
              />
            </button>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/50 text-muted-foreground">
              <ImageOff className="h-10 w-10 opacity-70" aria-hidden="true" />
              <span className="text-sm font-medium">لا توجد صور لهذه الخدمة</span>
            </div>
          )}

          {imageCount > 1 && (
            <>
              <button
                type="button"
                onClick={goPrevious}
                disabled={imageIndex === 0}
                className="absolute start-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 shadow disabled:opacity-40"
                aria-label="الصورة السابقة"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={imageIndex === imageCount - 1}
                className="absolute end-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 shadow disabled:opacity-40"
                aria-label="الصورة التالية"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="absolute bottom-3 start-1/2 -translate-x-1/2 rounded-full bg-background/80 px-2.5 py-0.5 text-xs font-medium tabular-nums">
                {imageIndex + 1} / {imageCount}
              </span>
            </>
          )}
        </div>

        {imageCount > 1 && (
          <div className={DETAIL_THUMBNAIL_RAIL}>
            {displayImages.map((src, index) => (
              <button
                key={`${src}-${index}`}
                ref={(node) => { thumbnailRefs.current[index] = node; }}
                type="button"
                onClick={() => setImageIndex(index)}
                aria-label={`الصورة ${index + 1} من ${imageCount}`}
                aria-current={index === imageIndex ? 'true' : undefined}
                className={cn(
                  'relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2',
                  index === imageIndex ? 'border-primary' : 'border-transparent opacity-70',
                )}
              >
                <SafeImage src={getThumbnailUrl(src)} alt="" fill className="object-cover" sizes="56px" />
              </button>
            ))}
          </div>
        )}
      </div>

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="flex h-[100dvh] w-screen max-w-none flex-col rounded-none border-0 bg-black/95 p-0 text-white shadow-none [&>button]:hidden">
          <DialogTitle className="sr-only">معرض صور الخدمة</DialogTitle>
          <div className="flex shrink-0 items-center justify-between px-4 py-3">
            <span className="rounded-full bg-white/10 px-3 py-1 text-sm tabular-nums" aria-live="polite">
              {imageIndex + 1} / {imageCount}
            </span>
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              onClick={() => setLightboxOpen(false)}
              aria-label="إغلاق المعرض"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          <div
            className="relative min-h-0 flex-1"
            onTouchStart={(event) => { touchStartX.current = event.changedTouches[0]?.clientX ?? null; }}
            onTouchEnd={handleTouchEnd}
          >
            <ZoomableDetailImage
              key={imageIndex}
              src={currentImage}
              alt={title}
              onSwipeNext={goNext}
              onSwipePrevious={goPrevious}
              priority={imageIndex === 0}
              previousSrc={imageIndex > 0 ? getDetailImageUrl(displayImages[imageIndex - 1] ?? PLACEHOLDER_SVG) : undefined}
              nextSrc={imageIndex < imageCount - 1 ? getDetailImageUrl(displayImages[imageIndex + 1] ?? PLACEHOLDER_SVG) : undefined}
            />
            {imageCount > 1 && (
              <>
                <button
                  type="button"
                  onClick={goPrevious}
                  disabled={imageIndex === 0}
                  aria-label="الصورة السابقة"
                  className="absolute start-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={imageIndex === imageCount - 1}
                  aria-label="الصورة التالية"
                  className="absolute end-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});
