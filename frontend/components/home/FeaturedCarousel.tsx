'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Pause, Play, Sparkles } from 'lucide-react';
import { useHomeFeed } from '@/hooks/queries/useHomeFeed';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Skeleton } from '@/components/shared/ui/Skeleton';
import { ROUTES } from '@/lib/constants';
import { formatPrice } from '@/lib/formatters';
import { getListThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import { SectionHeader } from '@/components/home/SectionHeader';

/**
 * Featured carousel sources:
 * - Ads: isFeatured=true
 * - Products: active promotions
 * - Stores: plan=FEATURED
 *
 * The public /home payload is the primary source. If /home fails,
 * only featured ads may fall back to their dedicated endpoint.
 * No latest-ad, generic-store, or popular-service fallback is allowed.
 */

const DISPLAY_PER_SOURCE = 2;
const AUTO_ADVANCE_MS = 5000;
/** Tailwind `gap-3` between slides (px). */
const SLIDE_GAP_PX = 12;

/**
 * Slide index from the track's scroll offset. `scrollLeft` is negative in RTL
 * (and the gap between slides is part of each step), so the naive
 * `scrollLeft / clientWidth` pinned the index to 0 for RTL users.
 */
export function slideIndexFromScroll(
  scrollLeft: number,
  clientWidth: number,
  count: number,
  gap: number = SLIDE_GAP_PX,
): number {
  if (clientWidth <= 0 || count <= 0) return 0;
  const step = clientWidth + gap;
  const next = Math.round(Math.abs(scrollLeft) / step);
  return Math.max(0, Math.min(next, count - 1));
}

/** Horizontal scroll target for a slide index (sign follows direction). */
export function scrollLeftForSlide(
  index: number,
  clientWidth: number,
  isRtl: boolean,
  gap: number = SLIDE_GAP_PX,
): number {
  const offset = index * (clientWidth + gap);
  return isRtl ? -offset : offset;
}

type SlideType = 'ad' | 'store' | 'product';

interface Slide {
  key: string;
  type: SlideType;
  href: string;
  title: string;
  subtitle: string;
  imageUrl: string;
}

const BADGE: Record<SlideType, { emoji: string; label: string; className: string }> = {
  ad: { emoji: '🏷️', label: 'إعلان', className: 'bg-accent text-accent-foreground' },
  product: { emoji: '🛒', label: 'منتج', className: 'bg-cat-product text-white' },
  store: { emoji: '🏪', label: 'متجر', className: 'bg-primary text-primary-foreground' },
};

/** Shorter on phones so featured does not own the whole fold; wider on desktop. */
export const CAROUSEL_ASPECT = 'aspect-[16/10] sm:aspect-[2/1] md:aspect-[21/9] lg:aspect-[3/1]';

export function FeaturedCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const lastInteractionRef = useRef(0);
  // scroll events fired by our own scrollTo() must not be read as user swipes.
  const programmaticUntilRef = useRef(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  const feed = useHomeFeed();
  const fromFeed = feed.data?.featured.carousel;
  const ads = fromFeed?.ads?.items ?? [];
  const stores = fromFeed?.stores?.items ?? [];
  const productItems = fromFeed?.products?.items ?? [];
  const isLoading = feed.isPending;

  const adSlides: Slide[] = ads.map((ad) => ({
    key: `ad-${ad.id}`,
    type: 'ad' as const,
    href: ROUTES.adDetail(ad.id),
    title: ad.title,
    subtitle: `${formatPrice(ad.price)} · ${ad.city}`,
    // Phase D LCP: carousel is above-the-fold — deliver a sharper still
    // (960×540) instead of the list-card 640×360 thumbnail.
    imageUrl: ad.images[0] ? getListThumbnailUrl(ad.images[0], 960, 540) : PLACEHOLDER_SVG,
  }));
  const storeSlides: Slide[] = stores.map((store) => ({
    key: `store-${store.id}`,
    type: 'store' as const,
    href: ROUTES.storeDetail(store.id),
    title: store.name,
    subtitle: store.city,
    imageUrl: store.coverImageUrl
      ? getListThumbnailUrl(store.coverImageUrl, 960, 540)
      : PLACEHOLDER_SVG,
  }));
  // Products come from the featured carousel payload (promoted products),
  // not from the recent-products section.
  const productItemsForSlides = productItems.slice(0, DISPLAY_PER_SOURCE);
  const productSlides: Slide[] = productItemsForSlides.map((p) => ({
    key: `product-${p.id}`,
    type: 'product' as const,
    href: ROUTES.productDetail(p.id),
    title: p.name,
    subtitle: p.store?.name ? `${p.store.name}${p.price != null ? ` · ${formatPrice(p.price)}` : ''}` : (p.price != null ? formatPrice(p.price) : ''),
    imageUrl: p.images?.[0] ? getListThumbnailUrl(p.images[0], 960, 540) : PLACEHOLDER_SVG,
  }));

  // Round-robin across the available featured sources.
  const slides: Slide[] = isLoading ? [] : (() => {
    const groups = [adSlides, productSlides, storeSlides].filter((g) => g.length > 0);
    if (groups.length === 0) return [];
    const maxLen = Math.max(...groups.map((g) => g.length));
    const out: Slide[] = [];
    for (let i = 0; i < maxLen; i++) {
      for (const g of groups) {
        const slide = g[i];
        if (slide) out.push(slide);
      }
    }
    return out;
  })();

  // إعادة ضبط الفهرس عند تغيّر عدد الشرائح (تحميل/إعادة جلب)
  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(slides.length - 1, 0)));
  }, [slides.length]);

  // تقدّم تلقائي كل 5 ثوانٍ، متوقف مؤقتًا 3 ثوانٍ بعد أي تفاعل يدوي.
  // Phase D/a11y: respect prefers-reduced-motion (no auto-advance).
  // يُقرأ بعد الـ mount لتفادي اختلاف الـ hydration مع HTML القادم من السيرفر.
  useEffect(() => {
    setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);
  const autoPlaying = slides.length > 1 && !paused && !reduceMotion;

  useEffect(() => {
    if (!autoPlaying) return;
    const timer = setInterval(() => {
      if (Date.now() - lastInteractionRef.current < 3000) return;
      setIndex((i) => (i + 1) % slides.length);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [autoPlaying, slides.length]);

  // مزامنة التمرير مع الفهرس الحالي أفقيًا فقط.
  // لا نستخدم scrollIntoView لأنه قد يغيّر vertical page scroll.
  // RTL: قيمة scrollLeft سالبة، لذا نحسب الهدف بحسب اتجاه العنصر.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const isRtl = getComputedStyle(el).direction === 'rtl';
    const target = scrollLeftForSlide(index, el.clientWidth, isRtl);
    // لا نُعيد التمرير إن كان المستخدم قد وصل للشريحة بنفسه (تفادي الصراع مع السحب).
    if (slideIndexFromScroll(el.scrollLeft, el.clientWidth, slides.length) === index &&
        Math.abs(Math.abs(el.scrollLeft) - Math.abs(target)) < 2) {
      return;
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    programmaticUntilRef.current = Date.now() + (reduce ? 50 : 700);
    el.scrollTo({ left: target, behavior: reduce ? 'auto' : 'smooth' });
  }, [index, slides.length]);

  function handleScroll() {
    const el = trackRef.current;
    if (!el || slides.length === 0) return;
    if (Date.now() < programmaticUntilRef.current) return;
    lastInteractionRef.current = Date.now();
    setIndex(slideIndexFromScroll(el.scrollLeft, el.clientWidth, slides.length));
  }

  if (isLoading) {
    return (
      <div className="space-y-2.5">
        <SectionHeader
          tone="featured"
          eyebrow="مدفوع"
          title="مميز"
          icon={<Sparkles className="h-3.5 w-3.5" />}
        />
        <Skeleton className={cn(CAROUSEL_ASPECT, 'w-full rounded-2xl')} />
      </div>
    );
  }

  // لا محتوى مميز: لا نعرض بطاقة فارغة في أعلى الصفحة.
  if (slides.length === 0) return null;

  const go = (next: number) => {
    lastInteractionRef.current = Date.now();
    setIndex(((next % slides.length) + slides.length) % slides.length);
  };

  return (
    <div className="space-y-2.5">
      <SectionHeader
        tone="featured"
        eyebrow="مدفوع"
        title="مميز"
        icon={<Sparkles className="h-3.5 w-3.5" />}
      />
    <div
      className="relative space-y-2"
      role="region"
      aria-roledescription="carousel"
      aria-label="محتوى مميز"
      onMouseEnter={() => {
        lastInteractionRef.current = Date.now() + 60_000;
      }}
      onMouseLeave={() => {
        lastInteractionRef.current = Date.now();
      }}
      onFocusCapture={() => {
        lastInteractionRef.current = Date.now() + 60_000;
      }}
      onBlurCapture={() => {
        lastInteractionRef.current = Date.now();
      }}
      onKeyDown={(e) => {
        if (slides.length < 2) return;
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          go(index + 1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          go(index - 1);
        }
      }}
    >
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain rounded-2xl [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-3"
        tabIndex={0}
        aria-live={autoPlaying ? 'off' : 'polite'}
      >
        {slides.map((slide, i) => (
          <Link
            key={slide.key}
            href={slide.href}
            // FIX RSC-PREFETCH-STORM-02: each slide links to a dynamic detail
            // page; prefetching all of them on load cost a request per slide.
            prefetch={false}
            onPointerDown={() => {
              lastInteractionRef.current = Date.now();
            }}
            className={cn(
              'group relative w-full shrink-0 snap-center overflow-hidden rounded-2xl bg-muted ring-1 ring-border/40 shadow-md',
              'transition-transform duration-300 hover:shadow-lg',
              CAROUSEL_ASPECT,
            )}
            aria-roledescription="slide"
            aria-label={`${i + 1} من ${slides.length}: ${slide.title}`}
          >
            <SafeImage
              src={slide.imageUrl}
              alt={slide.title}
              fill
              sizes="(max-width: 1280px) 100vw, 1280px"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              priority={i === 0}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/5" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-transparent" />
            <span
              className={cn(
                'absolute top-3 start-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs-tight font-bold shadow-md backdrop-blur-sm',
                BADGE[slide.type].className,
              )}
            >
              <span aria-hidden>{BADGE[slide.type].emoji}</span>
              {BADGE[slide.type].label}
            </span>
            <div className="absolute inset-x-0 bottom-0 space-y-1 p-3.5 sm:p-4 text-white">
              <p className="truncate text-base font-bold leading-snug drop-shadow-sm sm:text-lg">{slide.title}</p>
              <p className="truncate text-xs opacity-95 sm:text-sm">{slide.subtitle}</p>
            </div>
          </Link>
        ))}
      </div>

      {slides.length > 1 && (
        <>
          <div className="pointer-events-none absolute inset-y-0 start-0 end-0 flex items-center justify-between px-1 sm:px-2">
            <button
              type="button"
              className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-border/80 bg-background/90 text-foreground shadow-sm backdrop-blur hover:bg-background active:scale-95 sm:h-9 sm:w-9"
              aria-label="الشريحة السابقة"
              onClick={() => go(index - 1)}
            >
              <span aria-hidden className="text-lg leading-none">
                ‹
              </span>
            </button>
            <button
              type="button"
              className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-border/80 bg-background/90 text-foreground shadow-sm backdrop-blur hover:bg-background active:scale-95 sm:h-9 sm:w-9"
              aria-label="الشريحة التالية"
              onClick={() => go(index + 1)}
            >
              <span aria-hidden className="text-lg leading-none">
                ›
              </span>
            </button>
          </div>
          <div className="flex items-center justify-center gap-1" role="group" aria-label="شرائح مميزة">
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-pressed={paused}
              aria-label={paused ? 'تشغيل التقدّم التلقائي' : 'إيقاف التقدّم التلقائي مؤقتًا'}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {paused ? (
                <Play className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Pause className="h-3.5 w-3.5" aria-hidden />
              )}
            </button>
            {slides.map((slide, i) => (
              <button
                key={slide.key}
                type="button"
                aria-current={i === index ? 'true' : undefined}
                aria-label={`الشريحة ${i + 1}`}
                onClick={() => go(i)}
                className="flex h-10 w-8 items-center justify-center sm:h-8 sm:w-6"
              >
                <span
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === index ? 'w-5 bg-primary' : 'w-1.5 bg-border',
                  )}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
    </div>
  );
}
