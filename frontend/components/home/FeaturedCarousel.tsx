'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAds } from '@/hooks/queries/useAds';
import { useStores } from '@/hooks/queries/useStores';
import { useServiceListings } from '@/hooks/queries/useServiceListings';
import { useHomepage } from '@/hooks/queries/useHomepage';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Skeleton } from '@/components/shared/ui/Skeleton';
import { ROUTES } from '@/lib/constants';
import { formatPrice } from '@/lib/formatters';
import { getListThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';

/**
 * PLAN Phase 1 (القسم 3، "Featured Carousel"): كاروسيل مختلط
 * (إعلان/متجر/خدمة)، يعيد استخدام نمط fallback الموجود فعليًا في
 * FeaturedAds.tsx لمصدر الإعلانات، ويعتمد على ترتيب الباكند الموثّق في
 * store.types.ts (GET /stores يُرجع خطة FEATURED أولًا افتراضيًا) بدل
 * فلترة plan يدويًا على العميل — لا حاجة لمنطق fallback إضافي للمتاجر.
 * الخدمات لا تملك مفهوم "مميز" في هذا الكود؛ تُستخدم views desc كبديل
 * معقول، كما في الخطة الأصلية.
 *
 * ذاتية الإخفاء بالكامل عند فشل/فراغ المصادر الثلاثة (نفس اصطلاح
 * RecommendedAds/NearbyProvidersSection) بدل رسالة خطأ فوق الطية.
 */

const DISPLAY_PER_SOURCE = 2;
const AUTO_ADVANCE_MS = 5000;

type SlideType = 'ad' | 'store' | 'service' | 'product';

interface Slide {
  key: string;
  type: SlideType;
  href: string;
  title: string;
  subtitle: string;
  imageUrl: string;
}

const BADGE: Record<SlideType, { label: string; className: string }> = {
  ad: { label: '🏷️ إعلان', className: 'bg-accent text-accent-foreground' },
  product: { label: '🛒 منتج', className: 'bg-emerald-600 text-white' },
  store: { label: '🏪 متجر', className: 'bg-primary text-primary-foreground' },
  service: { label: '🛠️ خدمة', className: 'bg-blue-600 text-white' },
};

export function FeaturedCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const lastInteractionRef = useRef(0);

  // Prefer GET /home featuredCarousel — only fall back to list endpoints
  // when /home failed or omitted this slice (never race /home while pending).
  const home = useHomepage();
  const fromHome = home.data?.featuredCarousel;
  const hasHomeCarousel = Boolean(fromHome);
  const allowFetch = home.isError || (home.isSuccess && !hasHomeCarousel);

  const adsFeatured = useAds(
    { isFeatured: true, limit: DISPLAY_PER_SOURCE },
    { enabled: allowFetch },
  );
  const adsFeaturedItems = fromHome?.ads?.items ?? adsFeatured.data?.items ?? [];
  const adsNeedFallback =
    allowFetch &&
    !adsFeatured.isLoading &&
    !adsFeatured.isError &&
    adsFeaturedItems.length === 0;
  const adsFallback = useAds(
    { limit: DISPLAY_PER_SOURCE, sortBy: 'createdAt', sortOrder: 'desc' },
    { enabled: adsNeedFallback },
  );
  const ads = fromHome
    ? (fromHome.ads?.items?.length
        ? fromHome.ads.items
        : (fromHome.adsFallback?.items ?? []))
    : adsNeedFallback
      ? (adsFallback.data?.items ?? [])
      : adsFeaturedItems;
  const adsLoading = !fromHome && (adsFeatured.isLoading || (adsNeedFallback && adsFallback.isLoading));

  const storesQ = useStores(
    { limit: DISPLAY_PER_SOURCE },
    { enabled: allowFetch },
  );
  const stores = fromHome?.stores?.items ?? storesQ.data?.items ?? [];

  const servicesQ = useServiceListings(
    { sortBy: 'views', limit: DISPLAY_PER_SOURCE },
    { enabled: allowFetch },
  );
  const services = fromHome?.services?.items ?? servicesQ.data?.items ?? [];

  const isLoading =
    home.isPending || adsLoading || (!fromHome && (storesQ.isLoading || servicesQ.isLoading));

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
  const serviceSlides: Slide[] = services.map((svc) => ({
    key: `service-${svc.id}`,
    type: 'service' as const,
    href: ROUTES.serviceDetail(svc.id),
    title: svc.title,
    subtitle: svc.provider.businessName,
    imageUrl: svc.images[0] ? getListThumbnailUrl(svc.images[0], 960, 540) : PLACEHOLDER_SVG,
  }));

  // منتجات من حمولة /home (belowFold) — بدون طلب إضافي
  const productItems = (home.data?.belowFold?.recentProducts?.items ?? []).slice(0, DISPLAY_PER_SOURCE);
  const productSlides: Slide[] = productItems.map((p) => ({
    key: `product-${p.id}`,
    type: 'product' as const,
    href: ROUTES.productDetail(p.id),
    title: p.name,
    subtitle: p.store?.name ? `${p.store.name}${p.price != null ? ` · ${formatPrice(p.price)}` : ''}` : (p.price != null ? formatPrice(p.price) : ''),
    imageUrl: p.images?.[0] ? getListThumbnailUrl(p.images[0], 960, 540) : PLACEHOLDER_SVG,
  }));

  // خلط ذكي بالتناوب بين الأنواع الأربعة حتى لا يطغى نوع واحد
  const slides: Slide[] = isLoading ? [] : (() => {
    const groups = [adSlides, productSlides, storeSlides, serviceSlides].filter((g) => g.length > 0);
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
  useEffect(() => {
    if (slides.length < 2) return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    const timer = setInterval(() => {
      if (Date.now() - lastInteractionRef.current < 3000) return;
      setIndex((i) => (i + 1) % slides.length);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [slides.length]);

  // مزامنة التمرير مع الفهرس الحالي أفقيًا فقط.
  // لا نستخدم scrollIntoView لأنه قد يغيّر vertical page scroll
  // ويعيد المستخدم للأعلى عند الانتقال التلقائي بين الشرائح.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const child = el.children[index] as HTMLElement | undefined;
    if (!child) return;

    const left = child.offsetLeft - el.offsetLeft;
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({
      left,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }, [index]);

  function handleScroll() {
    const el = trackRef.current;
    if (!el || slides.length === 0) return;
    lastInteractionRef.current = Date.now();
    const slideWidth = el.clientWidth;
    if (slideWidth === 0) return;
    const next = Math.round(el.scrollLeft / slideWidth);
    setIndex(Math.max(0, Math.min(next, slides.length - 1)));
  }

  if (isLoading) {
    return <Skeleton className="aspect-video w-full rounded-2xl" />;
  }

  if (slides.length === 0) return null;

  const go = (next: number) => {
    lastInteractionRef.current = Date.now();
    setIndex(((next % slides.length) + slides.length) % slides.length);
  };

  return (
    <div
      className="relative space-y-2"
      role="region"
      aria-roledescription="carousel"
      aria-label="محتوى مميز"
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
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto rounded-2xl [&::-webkit-scrollbar]:hidden"
        tabIndex={0}
        aria-live="polite"
      >
        {slides.map((slide, i) => (
          <Link
            key={slide.key}
            href={slide.href}
            onPointerDown={() => {
              lastInteractionRef.current = Date.now();
            }}
            className="relative aspect-video w-full shrink-0 snap-center overflow-hidden rounded-2xl bg-muted"
            aria-roledescription="slide"
            aria-label={`${i + 1} من ${slides.length}: ${slide.title}`}
          >
            <SafeImage
              src={slide.imageUrl}
              alt={slide.title}
              fill
              sizes="(max-width: 1280px) 100vw, 1280px"
              className="object-cover"
              priority={i === 0}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <span
              className={cn(
                'absolute top-3 start-3 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm',
                BADGE[slide.type].className,
              )}
            >
              {BADGE[slide.type].label}
            </span>
            <div className="absolute inset-x-0 bottom-0 space-y-0.5 p-3 text-white">
              <p className="truncate text-sm font-bold">{slide.title}</p>
              <p className="truncate text-xs opacity-90">{slide.subtitle}</p>
            </div>
          </Link>
        ))}
      </div>

      {slides.length > 1 && (
        <>
          <div className="pointer-events-none absolute inset-y-0 start-0 end-0 flex items-center justify-between px-1 sm:px-2">
            <button
              type="button"
              className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-border/80 bg-background/90 text-foreground shadow-sm backdrop-blur hover:bg-background"
              aria-label="الشريحة السابقة"
              onClick={() => go(index - 1)}
            >
              <span aria-hidden className="text-lg leading-none">
                ‹
              </span>
            </button>
            <button
              type="button"
              className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-border/80 bg-background/90 text-foreground shadow-sm backdrop-blur hover:bg-background"
              aria-label="الشريحة التالية"
              onClick={() => go(index + 1)}
            >
              <span aria-hidden className="text-lg leading-none">
                ›
              </span>
            </button>
          </div>
          <div className="flex justify-center gap-1.5" role="tablist" aria-label="شرائح مميزة">
            {slides.map((slide, i) => (
              <button
                key={slide.key}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`الشريحة ${i + 1}`}
                onClick={() => go(i)}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === index ? 'w-5 bg-primary' : 'w-1.5 bg-border',
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
