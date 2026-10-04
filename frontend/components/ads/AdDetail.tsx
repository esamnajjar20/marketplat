'use client';

import { useStickyCtaVisible } from '@/hooks/useStickyCtaVisible';
import { useEffect, useState, useRef, useCallback } from 'react';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { MapPin, Eye, Calendar, Tag, ChevronRight, ChevronLeft, Heart, Hash, X, MessageSquare } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button }     from '@/components/shared/ui/Button';
import { Badge }      from '@/components/shared/ui/Badge';
import { SellerCard } from '@/components/ads/SellerCard';
import { ReportAdButton } from '@/components/ads/ReportAdButton';
import { ShareAdButton } from '@/components/ads/ShareAdButton';
import { ROUTES, CONDITION_LABELS, STATUS_LABELS } from '@/lib/constants';
import { AD_STATUS_VARIANT } from '@/lib/adStatus';
import { formatPrice, formatDate, formatRelativeTime } from '@/lib/formatters';
import { getDetailImageUrl, getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { useToggleFavorite } from '@/hooks/mutations/useFavoriteMutations';
import { useIsFavorited } from '@/hooks/queries/useFavorites';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore, selectIsAuthenticated, selectUser } from '@/store/auth.store';
import { useCategories } from '@/hooks/queries/useCategories';
import { autoSaveVisitedAd } from '@/lib/offlineAutoRead';
import { SaveOfflineButton } from '@/components/shared/SaveOfflineButton';
import { DetailSafetyTips } from '@/components/shared/DetailSafetyTips';
import { useStartConversation } from '@/hooks/mutations/useConversationMutations';
import { track } from '@/lib/analytics';
import { toast } from 'sonner';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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

  const searchParams = useSearchParams();
  const router = useRouter();
  const isAuth = useAuthStore(selectIsAuthenticated);
  const currentUser = useAuthStore(selectUser);
  const startConversation = useStartConversation();
  const isOwnAd = currentUser?.id === ad.user.id;
  const justPublished = searchParams.get('published') === '1';
  const [imgIdx, setImgIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);

  function handleStickyMessage() {
    if (!isAuth) {
      toast.error('سجّل الدخول لمراسلة البائع');
      router.push(`${ROUTES.login}?from=${encodeURIComponent(ROUTES.adDetail(ad.id))}`);
      return;
    }
    track('CONTACT_CLICK', { adId: ad.id, sellerId: ad.user.id });
    startConversation.mutate(
      { adId: ad.id },
      { onSuccess: (conversation) => router.push(ROUTES.conversationDetail(conversation!.id)) }
    );
  }

  const imageCount = ad.images.length > 0 ? ad.images.length : 1;

  const goPrev = useCallback(() => {
    setImgIdx((i) => Math.max(0, i - 1));
  }, []);
  const goNext = useCallback(() => {
    setImgIdx((i) => Math.min(imageCount - 1, i + 1));
  }, [imageCount]);

  // Keyboard: Escape always closes lightbox; arrows only when open and >1 image (RTL: Left = next, Right = previous)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setLightboxOpen(false);
        return;
      }
      if (!lightboxOpen || imageCount <= 1) return;
      if (e.key === 'ArrowLeft') goNext();
      if (e.key === 'ArrowRight') goPrev();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [imageCount, goPrev, goNext, lightboxOpen]);

  // SW-LIGHTBOX-SCROLL-LOCK-01: prevent the page behind the fullscreen
  // lightbox from scrolling. Without this, a swipe/scroll gesture on a
  // phone moved both the lightbox image AND the listing behind it —
  // when the user closed the lightbox, the page had jumped to a
  // different scroll position. Restoring the previous overflow value
  // (rather than unconditionally setting 'visible') keeps this correct
  // if another component is already holding a scroll lock when the
  // lightbox opens.
  useEffect(() => {
    if (!lightboxOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [lightboxOpen]);

  // FIX SAVED-ADS-USER-SCOPE: userId لتصفية محفوظات المستخدم.
  const userId = useAuthStore((s) => s.user?.id ?? null);
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

  // SAVE-ENTITY-01-AD: the manual 'save for offline' toggle now lives
  // inside <SaveOfflineButton>, which is shared with product / store /
  // seller pages and writes into the unified saved-entities index. The
  // previous ad-only state + handler + effect were removed; the button
  // owns its own isSaved derivation.

  // PHASE-2: auto offline snapshot for 24h (does not replace manual save)
  // T725 — pass userId so entries are scoped per-user, and re-run when
  // the signed-in user changes (was `[ad]` only: on a shared device,
  // logging in as a new user mid-session left the previous user's
  // entry indexed under their id and did not create one for the new
  // user until they navigated to a different ad).
  useEffect(() => {
    void autoSaveVisitedAd(ad, userId);
  }, [ad, userId]);

  return (
    <>
      {justPublished && (
        <div role="status" className="mb-4 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm">
          <p className="font-semibold text-foreground">تم نشر إعلانك بنجاح</p>
          <p className="mt-1 text-muted-foreground">
            شاركه الآن لزيادة المشاهدات، أو راجع{' '}
            <Link href={ROUTES.myAds} className="font-medium text-primary underline-offset-2 hover:underline">
              إعلاناتي
            </Link>
            {' '}للتعديل لاحقاً.
          </p>
        </div>
      )}
    <div className={cn('flex flex-col md:flex-row gap-6 md:gap-8', !isOwnAd ? 'pb-sticky-contact' : 'pb-8' /* FIX PB-STICKY-FALLBACK */)}>
      {/* LEFT: images + details */}
      <div className="flex-1 md:w-2/3 min-w-0 space-y-6">

        {/* Gallery */}
        <div className="rounded-2xl bg-card shadow-sm overflow-hidden">
          <div
            className="relative aspect-[4/3] max-h-[min(52vh,420px)] bg-muted touch-pan-y sm:aspect-[16/9] sm:max-h-none"
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
              onClick={() => setLightboxOpen(true)}
              aria-label="تكبير الصورة"
            >
              <SafeImage src={currentImg} alt={ad.title} fill className="object-contain select-none pointer-events-none" sizes="(max-width:1024px) 100vw, 66vw" priority={imgIdx === 0} draggable={false} />
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
            <div className="flex gap-3 p-3 overflow-x-auto">
              {images.map((img, i) => (
                <button key={i} onClick={() => setImgIdx(i)}
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

        {/* Title + meta + specs + description */}
        <div className="rounded-2xl bg-card shadow-sm p-5 sm:p-7 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-xl sm:text-2xl font-bold leading-snug">{ad.title}</h1>
              <div className="flex flex-wrap items-center gap-y-1.5 gap-x-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{ad.city}</span>
                <span className="text-border">|</span>
                <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" />{now === null ? '—' : formatRelativeTime(ad.createdAt, now)}</span>
                <span className="text-border">|</span>
                <span className="flex items-center gap-1.5"><Eye className="h-4 w-4" />{ad.views} مشاهدة</span>
                <span className="text-border">|</span>
                <span className="flex items-center gap-1.5 font-mono text-xs"><Hash className="h-3.5 w-3.5" />{ad.id.slice(-8)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* UX-FIX: was icon-only (Heart in a ghost icon button) —
                  reported as not a "clear" save action next to the
                  share button. Added a visible label + outline/filled
                  state so the save/unsave action reads on its own,
                  matching ShareAdButton's own labeled-button pattern
                  right next to it, not just an icon a buyer has to
                  guess at.
                  FIX BUG-XX (kept): aria-label/aria-pressed already
                  toggled correctly — AdCard's equivalent button does
                  the same. */}
              <Button
                variant={favorited ? 'default' : 'outline'}
                size="sm"
                onClick={handleFavorite}
                disabled={toggleFavorite.isPending}
                aria-label={favorited ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
                aria-pressed={favorited}
                className="gap-1.5"
              >
                <Heart className={cn('h-4 w-4', favorited && 'fill-current')} />
                {favorited ? 'محفوظ' : 'حفظ الإعلان'}
              </Button>
              {/* SAVE-ENTITY-01-AD: same shared button the product /
                  store / seller pages use — one index, one cache, one
                  consistent label. Behaves identically to the ad-only
                  button it replaced, but its state is derived from the
                  unified saved-entities store instead of local state. */}
              <SaveOfflineButton
                type="ad"
                id={ad.id}
                title={ad.title}
                subtitle={ad.price != null ? String(ad.price) : null}
                city={ad.city ?? null}
                thumbnail={ad.images?.[0] ?? null}
                imageUrls={ad.images ?? []}
              />
              {/* SHARE-QR-WIRE-01: the payload is built here rather
                  than inside ShareAdButton, since ShareAdButton is
                  shared with product / store / service headers that
                  don't (yet) pass a qrPayload. The menu gains a
                  'مشاركة QR (بدون نت)' entry only when one is given. */}
              <ShareAdButton
                title={ad.title}
                qrPayload={{
                  kind: 'ad',
                  title: ad.title,
                  price: ad.price ?? null,
                  city: ad.city ?? '',
                  extra: [
                    ad.condition ? CONDITION_LABELS[ad.condition] : '',
                    ad.isNegotiable ? 'قابل للتفاوض' : '',
                  ].filter(Boolean).join(' · '),
                  desc: ad.description ?? '',
                }}
              />
            </div>
          </div>

          {/* Mobile-only price, mirrors the sticky desktop price panel */}
          <div className="md:hidden">
            <p className="text-3xl font-bold text-primary">
              {formatPrice(ad.price)}
              {ad.isNegotiable && <span className="text-sm font-normal text-muted-foreground ms-2">قابل للتفاوض</span>}
            </p>
          </div>

          <div className="md:hidden">
            <DetailSafetyTips />
          </div>

          <div className="flex flex-wrap gap-2">
            {ad.status !== 'ACTIVE' && (
              <Badge variant={AD_STATUS_VARIANT[ad.status]}>
                {STATUS_LABELS[ad.status] ?? ad.status}
              </Badge>
            )}
            {ad.condition && <Badge variant="outline">{CONDITION_LABELS[ad.condition] ?? ad.condition}</Badge>}
            {ad.category && categoryHref && (
              <Link href={categoryHref}>
                <Badge variant="outline" className="gap-1 hover:border-primary hover:text-primary transition-colors">
                  <Tag className="h-3 w-3" />{ad.category.nameAr}
                </Badge>
              </Link>
            )}
          </div>

          {/* Specs grid — only fields that actually exist on Ad; no
              fabricated brand/model/storage attributes since this data
              model has no per-category custom fields. */}
          <div>
            <h3 className="font-semibold mb-3">المواصفات</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {ad.condition && (
                <div className="bg-muted/60 p-4 rounded-xl">
                  <div className="text-xs text-muted-foreground mb-1">الحالة</div>
                  <div className="font-semibold text-sm">{CONDITION_LABELS[ad.condition] ?? ad.condition}</div>
                </div>
              )}
              <div className="bg-muted/60 p-4 rounded-xl">
                <div className="text-xs text-muted-foreground mb-1">الموقع</div>
                <div className="font-semibold text-sm">{ad.city}</div>
              </div>
              {ad.category && (
                <div className="bg-muted/60 p-4 rounded-xl">
                  <div className="text-xs text-muted-foreground mb-1">القسم</div>
                  <div className="font-semibold text-sm">{ad.category.nameAr}</div>
                </div>
              )}
              <div className="bg-muted/60 p-4 rounded-xl">
                <div className="text-xs text-muted-foreground mb-1">تاريخ النشر</div>
                <div className="font-semibold text-sm">{formatDate(ad.createdAt)}</div>
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <h3 className="font-semibold mb-3">التفاصيل</h3>
            <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{ad.description}</p>
          </div>
        </div>

        {/* Mobile-only seller card, right after the main details block —
            desktop keeps it in the sticky right column below. */}
        <div className="md:hidden">
          <SellerCard seller={ad.user} adId={ad.id} sellerProfileId={ad.sellerProfileId} store={ad.store} />
        </div>

        {/* Report link */}
        <div className="flex justify-end">
          <ReportAdButton adId={ad.id} />
        </div>
      </div>

      {/* RIGHT: price + seller + safety tips (desktop only — mobile
          equivalents are rendered inline above, in reading order) */}
      <aside className="hidden md:flex md:w-1/3 flex-col gap-6">
        <div className="space-y-6">
          <div className="rounded-2xl bg-card shadow-md p-6 space-y-1">
            <div className="text-sm text-muted-foreground">السعر المطلوب</div>
            <div className="text-3xl font-bold text-primary">{formatPrice(ad.price)}</div>
            {ad.isNegotiable && (
              <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-3 mt-3">
                <span>قابل للتفاوض</span>
              </div>
            )}
          </div>

          <SellerCard seller={ad.user} adId={ad.id} sellerProfileId={ad.sellerProfileId} store={ad.store} />

          <DetailSafetyTips defaultOpen />
        </div>
      </aside>

      {/* UX: sticky contact CTA on mobile — price + message always reachable */}
      {!isOwnAd && (
        <div className={cn('sticky-contact-bar md:hidden border-t border-border bg-card/95 px-4 py-3 shadow-[0_-4px_16px_-8px_hsl(var(--shadow-color)/0.12)] backdrop-blur supports-[backdrop-filter]:bg-card/90', stickyCta.transitionClass, stickyCta.hiddenClass)}>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold text-primary truncate">{formatPrice(ad.price)}</p>
              {ad.isNegotiable && (
                <p className="text-xs text-muted-foreground">قابل للتفاوض</p>
              )}
            </div>
            <Button
              variant="default"
              size="lg"
              className="shrink-0 gap-2 rounded-xl"
              disabled={startConversation.isPending}
              onClick={handleStickyMessage}
            >
              <MessageSquare className="h-4 w-4" />
              {startConversation.isPending ? 'جارٍ…' : 'مراسلة'}
            </Button>
          </div>
        </div>
      )}

      {/* Fullscreen lightbox */}
      {lightboxOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="معرض الصور"
          className="fixed inset-0 z-[100] flex flex-col bg-black/95"
        >
          <div className="flex items-center justify-between p-3 text-white">
            <span className="text-sm tabular-nums">
              {imgIdx + 1} / {images.length}
            </span>
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
              aria-label="إغلاق"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div
            className="relative flex flex-1 items-center justify-center px-4"
            onTouchStart={(e) => {
              touchStartX.current = e.changedTouches[0]?.clientX ?? null;
            }}
            onTouchEnd={(e) => {
              if (touchStartX.current == null || images.length <= 1) return;
              const dx = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
              touchStartX.current = null;
              if (Math.abs(dx) < 40) return;
              if (dx > 0) goPrev();
              else goNext();
            }}
          >
            <SafeImage
              src={currentImg}
              alt={ad.title}
              fill
              className="object-contain"
              sizes="100vw"
              priority={imgIdx === 0}
            />
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={imgIdx === 0}
                  aria-label="الصورة السابقة"
                  className="absolute start-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white disabled:opacity-30"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={imgIdx === images.length - 1}
                  aria-label="الصورة التالية"
                  className="absolute end-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white disabled:opacity-30"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  );
}
