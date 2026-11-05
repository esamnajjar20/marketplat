'use client';

import { signalNavigationStart } from '@/components/shared/NavigationProgress';
import { useStickyCtaVisible } from '@/hooks/useStickyCtaVisible';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { AdDetailGallery } from '@/components/ads/AdDetailGallery';
import { ROUTES } from '@/lib/constants';
import dynamic from 'next/dynamic';
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
import { useStartConversation } from '@/hooks/mutations/useStartConversation';
import { track } from '@/lib/analytics';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { Ad } from '@/types/ad.types';
import { cn } from '@/lib/utils';

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
  const [authMounted, setAuthMounted] = useState(false);
  useEffect(() => setAuthMounted(true), []);
  const startConversation = useStartConversation();
  // Persisted Zustand state is unavailable during SSR. Delay owner-only
  // presentation until mount so server and first client render agree.
  const isOwnAd = authMounted && currentUser?.id === ad.user.id;
  const validImages = useMemo(
    () => (Array.isArray(ad.images) ? ad.images : []).filter(
      (image) => typeof image === 'string' && image.trim().length > 0,
    ),
    [ad.images],
  );

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

  return (
    <>
      {/* Layout aligned with ProductDetail: no nested container (page already provides it). */}
      <div className={cn('flex flex-col gap-6 md:flex-row md:gap-8', isOwnAd && 'pb-8')}>
        <div className="min-w-0 flex-1 space-y-6 lg:w-2/3">
              {/* Isolated gallery: image navigation does not re-render the detail page. */}
              <AdDetailGallery images={validImages} title={ad.title} isFeatured={ad.isFeatured} />

              {/* Metadata (single title, status, location, price actions) */}
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

              {/* Description, mobile seller card and report action */}
              <AdDetailDescription ad={ad} />
        </div>

        {/* RIGHT: Sidebar (price + seller + safety) - LAZY LOADED */}
        <AdDetailSidebar ad={ad} isOwnAd={isOwnAd} />
      </div>

      {/* Mobile sticky contact CTA - LAZY LOADED */}
      <AdDetailStickyCta
        ad={ad}
        isOwnAd={isOwnAd}
        transitionClass={stickyCta.transitionClass}
        hiddenClass={stickyCta.hiddenClass}
        onMessageClick={handleStartConversation}
        isMessaging={startConversation.isPending}
      />

    </>
  );
}
