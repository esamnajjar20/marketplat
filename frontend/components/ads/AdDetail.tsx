'use client';

import { signalNavigationStart } from '@/components/shared/NavigationProgress';
import { useStickyCtaVisible } from '@/hooks/useStickyCtaVisible';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { ProgressiveDetailImage } from '@/components/shared/detail/ProgressiveDetailImage';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import { getDetailImageUrl, getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import dynamic from 'next/dynamic';
// BUNDLE-OPT-02: Lazy-load Lightbox (Dialog + ZoomableDetailImage + icons)
// Only loads when user opens image gallery
const AdDetailLightbox = dynamic(
  () => import('@/components/ads/AdDetailLightbox').then((m) => m.AdDetailLightbox),
  { ssr: false, loading: () => null },
);
// BUNDLE-OPT-03: Lazy-load below-fold sections (metadata, description, sidebar, sticky CTA)
// These are loaded after initial render to reduce First Load JS
const AdDetailMetadata = dynamic(
  () => import('@/components/ads/AdDetailMetadata').then((m) => m.AdDetailMetadata),
  { loading: () => <Skeleton className="h-64 w-full" /> },
);
const AdDetailDescription = dynamic(
  () => import('@/components/ads/AdDetailDescription').then((m) => m.AdDetailDescription),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);
const AdDetailSidebar = dynamic(
  () => import('@/components/ads/AdDetailSidebar').then((m) => m.AdDetailSidebar),
  { loading: () => <Skeleton className="h-48 w-full" /> },
);
const AdDetailStickyCta = dynamic(
  () => import('@/components/ads/AdDetailStickyCta').then((m) => m.AdDetailStickyCta),
  { loading: () => null },
);
import { useToggleFavorite } from '@/hooks/mutations/useFavoriteMutations';
import { useIsFavorited } from '@/hooks/queries/useFavorites';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore, selectIsAuthenticated, selectUser } from '@/store/auth.store';
import { useCategories } from '@/hooks/queries/useCategories';
import { autoSaveVisitedAd } from '@/lib/offlineAutoRead';
import { useStartConversation } from '@/hooks/mutations/useConversationMutations';
import { track } from '@/lib/analytics';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { Ad } from '@/types/ad.types';
import { cn } from '@/lib/utils';
import { DETAIL_GALLERY_SHELL } from '@/components/shared/detail/detailTokens';

/**
 * FIX BUG-05: ROUTES.category() builds a /categories/:slug URL, but the
 * ad's embedded category (AdCategory in ad.types.ts) only carries
 * id/name/nameAr — the backend never selects `slug` on that relation
 * (see ads.repository.ts), and AdCategory has no slug field to read in
 * the first place. Linking with ad.category.id produced a route the
 * [slug] page's useCategoryBySlug() could never resolve — a permanent
 * 404 dressed up as a link that would appear to work.
 *
 * Full categories (with slug) are already fetched and cached elsewhere
 * via useCategories() — reuse that cache to resolve id → slug instead of
 * adding a new request. If the category can't be found in the list for
 * any reason, fall back to the working, filter-equivalent /search?categoryId=
 * route rather than linking to something broken.
 */
export function useCategoryHref(categoryId: string | undefined) {
  const { data: categories } = useCategories();
  if (!categoryId) return undefined;
  const flat = (categories ?? []).flatMap((c) => [c, ...(c.children ?? [])]);
  const match = flat.find((c) => c.id === categoryId);
  return match ? ROUTES.category(match.slug) : `${ROUTES.search}?categoryId=${categoryId}`;
}

interface Props { ad: Ad; isFavorited?: boolean; }

export function AdDetail({ ad, isFavorited = false }: Props) {
  const stickyCta = useStickyCtaVisible();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  const router = useRouter();
  const isAuth = useAuthStore(selectIsAuthenticated);
  const currentUser = useAuthStore(selectUser);
  const startConversation = useStartConversation();
  const isOwnAd = currentUser?.id === ad.user.id;
  const [imgIdx, setImgIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const thumbnailRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleStickyMessage() {
    if (!isAuth) {
      toast.error('سجّل الدخول لمراسلة البائع');
      const destination = `${ROUTES.login}?from=${encodeURIComponent(ROUTES.adDetail(ad.id))}`;
      signalNavigationStart(destination);
      router.push(destination);
      return;
    }
    track('CONTACT_CLICK', { adId: ad.id, sellerId: ad.user.id });
    startConversation.mutate(
      { adId: ad.id },
      { onSuccess: (conversation) => {
        const destination = ROUTES.conversationDetail(conversation!.id);
        signalNavigationStart(destination);
        router.push(destination);
      } }
    );
  }

  const imageCount = ad.images.length > 0 ? ad.images.length : 1;

  const goPrev = useCallback(() => {
    setImgIdx((i) => Math.max(0, i - 1));
  }, []);
  const goNext = useCallback(() => {
    setImgIdx((i) => Math.min(imageCount - 1, i + 1));
  }, [imageCount]);

  // Keyboard arrows remain available while the Dialog is open; Radix Dialog
  // owns Escape handling, focus trapping, and body scroll locking.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!lightboxOpen || imageCount <= 1) return;
      if (e.key === 'ArrowLeft') goNext();
      if (e.key === 'ArrowRight') goPrev();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [imageCount, goPrev, goNext, lightboxOpen]);

  const toggleFavorite = useToggleFavorite();
  const queryClient = useQueryClient();

  // UX-FIX P1-3: previously this component tracked its own local
  // `favorited` useState, toggled synchronously on every click and
  // independently from useToggleFavorite's own optimistic update to the
  // shared favorites.ids() cache. Two sources of truth updating on their
  // own schedules meant rapid clicks (unguarded — no `disabled` existed
  // here at all, unlike AdCard/FavoritesList using the same hook) could
  // fire overlapping requests whose responses resolved out of order,
  // leaving the heart's displayed state diverged from the server.
  //
  // Fix: drop the local state and read from the same shared cache AdCard
  // and FavoritesList already use (useIsFavorited), so there is exactly
  // one source of truth. Server-rendered pages still pass `isFavorited`
  // as an initial prop (the client favorites-ids Set may not be
  // populated yet on a fresh detail-page load, e.g. direct navigation
  // before any favorites list has been fetched) — seed the shared cache
  // from that prop once on mount so useIsFavorited has a correct value
  // immediately instead of momentarily reporting "not favorited".
  useEffect(() => {
    if (!isFavorited) return;
    queryClient.setQueryData<Set<string>>(queryKeys.favorites.ids(), (prev: Set<string> | undefined) => {
      const next = new Set(prev ?? []);
      next.add(ad.id);
      return next;
    });
    // Only seed once per ad on mount — after that, useToggleFavorite's
    // own optimistic updates and onError rollback are the source of truth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad.id]);

  const favorited = useIsFavorited(ad.id);

  const images = ad.images.length > 0 ? ad.images : [PLACEHOLDER_SVG];
  const currentImg = getDetailImageUrl(images[imgIdx] ?? PLACEHOLDER_SVG);

  // Keep the active thumbnail visible when users navigate with arrows,
  // keyboard shortcuts, swipe gestures, or direct thumbnail selection.
  // Respect reduced-motion preferences and avoid any work during SSR.
  useEffect(() => {
    const activeThumbnail = thumbnailRefs.current[imgIdx];
    if (!activeThumbnail) return;
    activeThumbnail.scrollIntoView({ inline: 'center', behavior: 'smooth' });
  }, [imgIdx]);

  const handleFavorite = useCallback(async () => {
    if (!isAuth) {
      toast.error('سجّل الدخول لحفظ الإعلان');
      const destination = `${ROUTES.login}?from=${encodeURIComponent(ROUTES.adDetail(ad.id))}`;
      signalNavigationStart(destination);
      router.push(destination);
      return;
    }
    toggleFavorite.mutate(ad.id);
  }, [ad.id, isAuth, toggleFavorite, router, signalNavigationStart, toast]);

  const handleStartConversation = useCallback(() => {
    if (!isAuth) {
      toast.error('سجّل الدخول لمراسلة البائع');
      const destination = `${ROUTES.login}?from=${encodeURIComponent(ROUTES.adDetail(ad.id))}`;
      signalNavigationStart(destination);
      router.push(destination);
      return;
    }
    track('CONTACT_CLICK', { adId: ad.id, sellerId: ad.user.id });
    startConversation.mutate(
      { adId: ad.id },
      { onSuccess: (conversation) => {
        const destination = ROUTES.conversationDetail(conversation!.id);
        signalNavigationStart(destination);
        router.push(destination);
      } }
    );
  }, [ad.id, ad.user.id, isAuth, startConversation, router, signalNavigationStart, toast, track]);

  // Auto-save visited ad for offline reading (fire-and-forget)
  useEffect(() => {
    autoSaveVisitedAd(ad);
  }, [ad]);

  const handleLightboxOpen = useCallback(() => {
    setLightboxOpen(true);
  }, []);

  return (
    <>
      <div className="flex min-h-screen flex-col">
        {/* Gallery + Description + Sidebar layout */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* LEFT: Gallery + Description (2/3 on desktop) */}
            <div className="space-y-6 lg:col-span-2">
              {/* Main image gallery - KEEP EAGER (LCP critical) */}
              <div className={DETAIL_GALLERY_SHELL}>
                <div
                  className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-muted/30"
                  onTouchStart={(e) => {
                    touchStartX.current = e.changedTouches[0]?.clientX ?? null;
                  }}
                  onTouchEnd={(e) => {
                    if (touchStartX.current == null || images.length <= 1) return;
                    const dx = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
                    touchStartX.current = null;
                    if (Math.abs(dx) < 40) return;
                    // RTL: swipe right (positive dx) → previous; swipe left → next
                    if (dx > 0) goPrev();
                    else goNext();
                  }}
                >
                  <button
                    type="button"
                    className="absolute inset-0 cursor-zoom-in"
                    onClick={handleLightboxOpen}
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
                        {/* FIX PERF-07: was rendering the raw, full-resolution
                            Cloudinary URL at a 64x48 display size — every
                            thumbnail downloaded the same multi-MB original as
                            the main image, just CSS-scaled down visually. A
                            real Cloudinary-transformed thumbnail costs a
                            fraction of the bytes for a strip that never
                            displays larger than 64px wide. */}
                        <SafeImage src={getThumbnailUrl(img, 128, 128)} alt={`صورة ${i + 1}`} fill className="object-cover" sizes="80px" loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Description + Metadata - LAZY LOADED */}
              <AdDetailDescription
                ad={ad}
                imgIdx={imgIdx}
                setImgIdx={setImgIdx}
                images={images}
                goPrev={goPrev}
                goNext={goNext}
                onLightboxOpen={handleLightboxOpen}
              />

              {/* Metadata (title, actions, specs) - LAZY LOADED */}
              <AdDetailMetadata
                ad={ad}
                favorited={favorited}
                onFavorite={handleFavorite}
                toggleFavoritePending={toggleFavorite.isPending}
                now={now}
                isOwnAd={isOwnAd}
                onStartConversation={handleStartConversation}
                startConversationPending={startConversation.isPending}
              />
            </div>

            {/* RIGHT: Sidebar (price + seller + safety) - LAZY LOADED */}
            <AdDetailSidebar ad={ad} isOwnAd={isOwnAd} />
          </div>
        </main>

        {/* Mobile sticky contact CTA - LAZY LOADED */}
        <AdDetailStickyCta
          ad={ad}
          isOwnAd={isOwnAd}
          transitionClass={stickyCta.transitionClass}
          hiddenClass={stickyCta.hiddenClass}
          onMessageClick={handleStickyMessage}
          isMessaging={startConversation.isPending}
        />

        {/* Fullscreen lightbox — lazy loaded */}
        {lightboxOpen && (
          <AdDetailLightbox
            images={images}
            currentIdx={imgIdx}
            adTitle={ad.title}
            onClose={() => setLightboxOpen(false)}
            onNext={goNext}
            onPrev={goPrev}
          />
        )}
      </div>
    </>
  );
}
