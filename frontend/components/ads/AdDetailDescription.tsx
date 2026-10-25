'use client';

import { ChevronRight, ChevronLeft, MapPin, Calendar, Eye, Hash } from 'lucide-react';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/formatters';
import { getDetailImageUrl, getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { ProgressiveDetailImage } from '@/components/shared/detail/ProgressiveDetailImage';
import { Skeleton } from '@/components/ui/skeleton';
import dynamic from 'next/dynamic';
import { ReportAdButton } from '@/components/ads/ReportAdButton';
import type { Ad } from '@/types/ad.types';
import { DETAIL_GALLERY_SHELL, DETAIL_PANEL_PADDED, DETAIL_SECTION_TITLE } from '@/components/shared/detail/detailTokens';

// Lazy-load SellerCard for mobile inline view
const SellerCard = dynamic(
  () => import('@/components/ads/SellerCard').then((m) => m.SellerCard),
  { loading: () => <Skeleton className="h-24 w-full" /> },
);

interface AdDetailDescriptionProps {
  ad: Ad;
  imgIdx: number;
  setImgIdx: (idx: number) => void;
  images: string[];
  goPrev: () => void;
  goNext: () => void;
  onLightboxOpen: () => void;
}

export function AdDetailDescription({
  ad,
  imgIdx,
  setImgIdx,
  images,
  goPrev,
  goNext,
  onLightboxOpen,
}: AdDetailDescriptionProps) {
  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const touchStartX = useRef<number | null>(null);
  const [now] = useState(() => Date.now());

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

  const currentImg = getDetailImageUrl(images[imgIdx] ?? PLACEHOLDER_SVG);

  return (
    <div className="space-y-6 md:col-span-2">
      {/* Main image gallery */}
      <div className={DETAIL_GALLERY_SHELL}>
        <div
          className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-muted/30"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <button
            type="button"
            className="absolute inset-0 cursor-zoom-in"
            onClick={onLightboxOpen}
            aria-label="تكبير الصورة"
          >
            <ProgressiveDetailImage
              src={currentImg}
              alt={ad.title}
              className="object-contain select-none pointer-events-none"
              sizes="(max-width:1024px) 100vw, 66vw"
              priority={imgIdx === 0}
              draggable={false}
            />
          </button>
          {ad.isFeatured && (
            <span className="absolute top-4 start-4 bg-accent text-accent-foreground px-3 py-1 rounded-full text-xs font-bold shadow-sm">
              مميز
            </span>
          )}
          {images.length > 1 && (
            <>
              <button onClick={goPrev}
                disabled={imgIdx === 0}
                aria-label="الصورة السابقة"
                className="absolute start-2 top-1/2 -translate-y-1/2 flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-black/50 text-white disabled:opacity-30">
                <ChevronRight className="h-5 w-5" />
              </button>
              <button onClick={goNext}
                disabled={imgIdx === images.length - 1}
                aria-label="الصورة التالية"
                className="absolute end-2 top-1/2 -translate-y-1/2 flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-black/50 text-white disabled:opacity-30">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="absolute bottom-4 end-4 bg-black/60 backdrop-blur-md text-white text-xs px-3 py-1.5 rounded-full">
                {imgIdx + 1} / {images.length}
              </span>
            </>
          )}
        </div>
        {images.length > 1 && (
          <div className="flex gap-3 p-3 overflow-x-auto overscroll-x-contain">
            {images.map((img, i) => (
              <button key={i} ref={(node) => { thumbnailRefs.current[i] = node; }} onClick={() => setImgIdx(i)}
                aria-label={`عرض الصورة ${i + 1} من ${images.length}`}
                aria-current={i === imgIdx ? 'true' : undefined}
                className={cn('relative w-16 h-16 sm:w-20 sm:h-20 min-h-[44px] min-w-[44px] rounded-lg shrink-0 overflow-hidden border-2 transition-colors',
                  i === imgIdx ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100')}>
                <SafeImage src={getThumbnailUrl(img, 128, 128)} alt={`صورة ${i + 1}`} fill className="object-cover" sizes="80px" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Title + meta + specs + description */}
      <div className="rounded-2xl bg-card shadow-sm p-5 sm:p-7 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-xl sm:text-2xl font-bold leading-snug">{ad.title}</h1>
            <div className="flex flex-wrap items-center gap-y-1.5 gap-x-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{ad.city}</span>
              <span className="text-border">|</span>
              <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" />{formatRelativeTime(ad.createdAt, now)}</span>
              <span className="text-border">|</span>
              <span className="flex items-center gap-1.5"><Eye className="h-4 w-4" />{ad.views} مشاهدة</span>
              <span className="text-border">|</span>
              <span className="flex items-center gap-1.5 font-mono text-xs"><Hash className="h-3.5 w-3.5" />{ad.id.slice(-8)}</span>
            </div>
          </div>
        </div>

        {/* Description */}
        <section className={cn(DETAIL_PANEL_PADDED, 'space-y-3')}>          <h3 className={DETAIL_SECTION_TITLE}>التفاصيل</h3>
          <p className="rounded-xl border border-border/50 bg-muted/20 p-4 text-sm leading-7 whitespace-pre-line text-muted-foreground">{ad.description?.trim() || 'لا توجد تفاصيل إضافية لهذا الإعلان.'}</p>
        </section>

        {/* Mobile-only seller card */}
        <div className="md:hidden">
          <SellerCard seller={ad.user} adId={ad.id} sellerProfileId={ad.sellerProfileId} store={ad.store} />
        </div>

        {/* Report link */}
        <div className="flex justify-end">
          <ReportAdButton adId={ad.id} />
        </div>
      </div>
    </div>
  );
}
