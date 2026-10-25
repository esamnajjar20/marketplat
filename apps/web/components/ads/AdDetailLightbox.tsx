'use client';

import { useEffect, useRef, useCallback } from 'react';
import { ChevronRight, ChevronLeft, X } from 'lucide-react';
import { ZoomableDetailImage } from '@/components/shared/detail/ZoomableDetailImage';
import { getDetailImageUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

interface AdDetailLightboxProps {
  images: string[];
  currentIdx: number;
  adTitle: string;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}

export function AdDetailLightbox({
  images,
  currentIdx,
  adTitle,
  onClose,
  onNext,
  onPrev,
}: AdDetailLightboxProps) {
  const touchStartX = useRef<number | null>(null);

  const goNext = useCallback(() => {
    if (currentIdx < images.length - 1) onNext();
  }, [currentIdx, images.length, onNext]);

  const goPrev = useCallback(() => {
    if (currentIdx > 0) onPrev();
  }, [currentIdx, onPrev]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null || images.length <= 1) return;
    const dx = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx > 0) goPrev();
    else goNext();
  };

  // Keyboard navigation
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrev, onClose]);

  const currentImg = images[currentIdx] ?? PLACEHOLDER_SVG;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        className="flex h-[100dvh] w-screen max-w-none flex-col rounded-none border-0 bg-black/95 p-0 text-white shadow-none [&>button]:hidden"
      >
        <DialogTitle className="sr-only">معرض الصور</DialogTitle>
        <div className="flex items-center justify-between p-3 text-white">
          <span className="text-sm tabular-nums">
            {currentIdx + 1} / {images.length}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div
          className="relative flex min-h-0 flex-1 items-center justify-center px-4"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <ZoomableDetailImage
            key={currentIdx}
            src={currentImg}
            alt={adTitle}
            onSwipeNext={goNext}
            onSwipePrevious={goPrev}
            priority={currentIdx === 0}
            previousSrc={currentIdx > 0 ? getDetailImageUrl(images[currentIdx - 1] ?? PLACEHOLDER_SVG) : undefined}
            nextSrc={currentIdx < images.length - 1 ? getDetailImageUrl(images[currentIdx + 1] ?? PLACEHOLDER_SVG) : undefined}
          />
          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={goPrev}
                disabled={currentIdx === 0}
                aria-label="الصورة السابقة"
                className="absolute start-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={currentIdx === images.length - 1}
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
  );
}