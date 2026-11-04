'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { ProgressiveDetailImage } from '@/components/shared/detail/ProgressiveDetailImage';
import { DETAIL_GALLERY_SHELL } from '@/components/shared/detail/detailTokens';
import { getDetailImageUrl, getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';

const AdDetailLightbox = dynamic(
  () => import('@/components/ads/AdDetailLightbox').then((module) => module.AdDetailLightbox),
  { ssr: false, loading: () => null },
);

interface Props {
  images: string[];
  title: string;
  isFeatured: boolean;
}

/**
 * Isolated gallery state: changing the selected photo must not re-render
 * the ad's metadata, description, seller sidebar, or sticky contact CTA.
 */
export const AdDetailGallery = memo(function AdDetailGallery({ images, title, isFeatured }: Props) {
  const [imageIndex, setImageIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const thumbnailRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const hasImages = images.length > 0;
  const displayImages = hasImages ? images : [PLACEHOLDER_SVG];
  const imageCount = displayImages.length;

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
    activeThumbnail?.scrollIntoView({ inline: 'center', behavior: 'smooth' });
  }, [imageIndex]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!lightboxOpen || imageCount <= 1) return;
      // In RTL galleries, left advances and right moves backwards.
      if (event.key === 'ArrowLeft') goNext();
      if (event.key === 'ArrowRight') goPrevious();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrevious, imageCount, lightboxOpen]);

  const currentImage = getDetailImageUrl(displayImages[imageIndex] ?? PLACEHOLDER_SVG);

  return (
    <>
      <div className={cn(DETAIL_GALLERY_SHELL, 'lg:shadow-md')}>
        <div
          className="relative aspect-[4/3] overflow-hidden bg-muted sm:aspect-[16/9]"
          onTouchStart={(event) => {
            touchStartX.current = event.changedTouches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            if (touchStartX.current === null || imageCount <= 1) return;
            const deltaX = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
            touchStartX.current = null;
            if (Math.abs(deltaX) < 40) return;
            // RTL: swipe right → previous; swipe left → next.
            if (deltaX > 0) goPrevious();
            else goNext();
          }}
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
                className="object-contain select-none pointer-events-none"
                sizes="(max-width:1024px) 100vw, 66vw"
                priority={imageIndex === 0}
                draggable={false}
              />
            </button>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/50 text-muted-foreground">
              <ImageOff className="h-10 w-10 opacity-70" aria-hidden="true" />
              <span className="text-sm font-medium">لا توجد صور لهذا الإعلان</span>
            </div>
          )}

          {isFeatured && (
            <span className="absolute top-4 start-4 rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground shadow-sm">
              مميز
            </span>
          )}

          {imageCount > 1 && (
            <>
              <button
                type="button"
                onClick={goPrevious}
                disabled={imageIndex === 0}
                aria-label="الصورة السابقة"
                className="absolute start-2 top-1/2 flex h-11 w-11 min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white disabled:opacity-30"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={imageIndex === imageCount - 1}
                aria-label="الصورة التالية"
                className="absolute end-2 top-1/2 flex h-11 w-11 min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white disabled:opacity-30"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="absolute bottom-4 end-4 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white backdrop-blur-md">
                {imageIndex + 1} / {imageCount}
              </span>
            </>
          )}
        </div>

        {imageCount > 1 && (
          <div className="flex gap-3 overflow-x-auto overscroll-x-contain p-3">
            {displayImages.map((image, index) => (
              <button
                key={`${image}-${index}`}
                ref={(node) => { thumbnailRefs.current[index] = node; }}
                type="button"
                onClick={() => setImageIndex(index)}
                aria-label={`عرض الصورة ${index + 1} من ${imageCount}`}
                aria-current={index === imageIndex ? 'true' : undefined}
                className={cn(
                  'relative h-16 w-16 min-h-[44px] min-w-[44px] shrink-0 overflow-hidden rounded-lg border-2 transition-colors sm:h-20 sm:w-20',
                  index === imageIndex ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100',
                )}
              >
                <SafeImage
                  src={getThumbnailUrl(image, 128, 128)}
                  alt={`صورة ${index + 1}`}
                  fill
                  className="object-cover"
                  sizes="80px"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {lightboxOpen && hasImages && (
        <AdDetailLightbox
          images={displayImages}
          currentIdx={imageIndex}
          adTitle={title}
          onClose={() => setLightboxOpen(false)}
          onNext={goNext}
          onPrev={goPrevious}
        />
      )}
    </>
  );
});
