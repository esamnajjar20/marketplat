'use client';

import { useEffect, useState } from 'react';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { MapPin, Eye, Calendar, Tag, ChevronRight, ChevronLeft, Heart } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button }     from '@/components/shared/ui/Button';
import { Badge }      from '@/components/shared/ui/Badge';
import { SellerCard } from '@/components/ads/SellerCard';
import { ReportAdButton } from '@/components/ads/ReportAdButton';
import { ShareAdButton } from '@/components/ads/ShareAdButton';
import { ROUTES, CONDITION_LABELS, STATUS_LABELS } from '@/lib/constants';
import { AD_STATUS_VARIANT } from '@/lib/adStatus';
import { formatPrice, formatDate } from '@/lib/formatters';
import { getDetailImageUrl, getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { useToggleFavorite } from '@/hooks/mutations/useFavoriteMutations';
import { useIsFavorited } from '@/hooks/queries/useFavorites';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { useCategories } from '@/hooks/queries/useCategories';
import { toast } from 'sonner';
import Link from 'next/link';
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
  const [imgIdx, setImgIdx] = useState(0);
  const isAuth = useAuthStore(selectIsAuthenticated);
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
    queryClient.setQueryData<Set<string>>(queryKeys.favorites.ids(), (prev) => {
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
  const categoryHref = useCategoryHref(ad.category?.id);

  function handleFavorite() {
    if (!isAuth) { toast.error('يرجى تسجيل الدخول أولاً'); return; }
    toggleFavorite.mutate(ad.id);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* LEFT: images + details */}
      <div className="lg:col-span-2 space-y-4">

        {/* Gallery */}
        <div className="space-y-2">
          <div className="relative aspect-[4/3] rounded-lg overflow-hidden bg-muted">
            <SafeImage src={currentImg} alt={ad.title} fill className="object-contain" sizes="(max-width:1024px) 100vw, 66vw" priority />
            {images.length > 1 && (
              <>
                <button onClick={() => setImgIdx((i) => Math.max(0, i - 1))}
                  disabled={imgIdx === 0}
                  aria-label="الصورة السابقة"
                  className="absolute start-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white disabled:opacity-30">
                  <ChevronRight className="h-5 w-5" />
                </button>
                <button onClick={() => setImgIdx((i) => Math.min(images.length - 1, i + 1))}
                  disabled={imgIdx === images.length - 1}
                  aria-label="الصورة التالية"
                  className="absolute end-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white disabled:opacity-30">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="absolute bottom-2 end-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                  {imgIdx + 1} / {images.length}
                </span>
              </>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {images.map((img, i) => (
                <button key={i} onClick={() => setImgIdx(i)}
                  aria-label={`عرض الصورة ${i + 1} من ${images.length}`}
                  aria-current={i === imgIdx ? 'true' : undefined}
                  className={cn('relative w-16 h-12 rounded shrink-0 overflow-hidden border-2 transition-colors',
                    i === imgIdx ? 'border-primary' : 'border-transparent')}>
                  {/* FIX PERF-07: was rendering the raw, full-resolution
                      Cloudinary URL at a 64x48 display size — every
                      thumbnail downloaded the same multi-MB original as
                      the main image, just CSS-scaled down visually. A
                      real Cloudinary-transformed thumbnail costs a
                      fraction of the bytes for a strip that never
                      displays larger than 64px wide. */}
                  <SafeImage src={getThumbnailUrl(img, 128, 96)} alt={`صورة ${i + 1}`} fill className="object-cover" sizes="64px" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Title + price */}
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-xl font-bold leading-snug">{ad.title}</h1>
            <div className="flex gap-1 shrink-0">
              {/* FIX BUG-XX: aria-label was static ("حفظ") regardless of
                  toggled state — AdCard's equivalent button already
                  does this correctly (isFavorited ? 'إزالة...' :
                  'إضافة...' + aria-pressed); mirrored here. */}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleFavorite}
                disabled={toggleFavorite.isPending}
                aria-label={favorited ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
                aria-pressed={favorited}
              >
                <Heart className={cn('h-5 w-5', favorited && 'fill-destructive text-destructive')} />
              </Button>
              <ShareAdButton title={ad.title} />
            </div>
          </div>

          <p className="text-2xl font-bold text-primary">
            {formatPrice(ad.price)}
            {ad.isNegotiable && <span className="text-sm font-normal text-muted-foreground ms-2">قابل للتفاوض</span>}
          </p>

          {/* P1 FIX (layout audit §2): SellerCard — the page's most
              important CTA (مراسلة البائع) — used to sit in the RIGHT
              column, which stacks *below* gallery+price+description+
              report on mobile (grid-cols-1). A buyer had to scroll past
              all of that before reaching it. Rendered here, right after
              price, and hidden on `lg:` where the RIGHT-column copy
              below takes over — so desktop's two-column layout is
              pixel-identical to before. */}
          <div className="lg:hidden">
            <SellerCard seller={ad.user} adId={ad.id} sellerProfileId={ad.sellerProfileId} />
          </div>

          <div className="flex flex-wrap gap-2">
            {ad.status !== 'ACTIVE' && (
              <Badge variant={AD_STATUS_VARIANT[ad.status]}>
                {STATUS_LABELS[ad.status] ?? ad.status}
              </Badge>
            )}
            {ad.isFeatured && <Badge variant="outline" className="border-warning text-warning">مميز</Badge>}
            {ad.condition && <Badge variant="outline">{CONDITION_LABELS[ad.condition] ?? ad.condition}</Badge>}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{ad.city}</span>
            <span className="flex items-center gap-1.5"><Eye className="h-4 w-4" />{ad.views} مشاهدة</span>
            <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" />{formatDate(ad.createdAt)}</span>
            {ad.category && categoryHref && (
              <Link href={categoryHref} className="flex items-center gap-1.5 hover:text-primary">
                <Tag className="h-4 w-4" />{ad.category.nameAr}
              </Link>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <h2 className="font-semibold">تفاصيل الإعلان</h2>
          <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{ad.description}</p>
        </div>

        {/* Report link */}
        <div className="flex justify-end">
          <ReportAdButton adId={ad.id} />
        </div>
      </div>

      {/* RIGHT: seller + action (desktop only — see the mobile copy
          rendered inline above, right after price) */}
      <div className="hidden lg:block space-y-4">
        <SellerCard seller={ad.user} adId={ad.id} sellerProfileId={ad.sellerProfileId} />
        <div className="rounded-lg border bg-card p-4 text-xs text-muted-foreground space-y-1">
          <p>رقم الإعلان: <span className="font-mono text-foreground">{ad.id.slice(-8)}</span></p>
          <p>تاريخ النشر: {formatDate(ad.createdAt)}</p>
          <p>آخر تحديث: {formatDate(ad.updatedAt)}</p>
        </div>
      </div>
    </div>
  );
}
