'use client';

import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Star, Phone, MapPin, Sparkles, UserPlus, UserMinus, PackagePlus, Package, Settings2, BarChart3 } from 'lucide-react';
import { VerifiedBadge } from '@/components/shared/VerifiedBadge';
import { Badge } from '@/components/shared/ui/Badge';
import { Button } from '@/components/shared/ui/Button';
import { StoreBadges } from '@/components/stores/StoreBadges';
import { getAvatarUrl, getDetailImageUrl } from '@/lib/cloudinary';
import { formatPhone } from '@/lib/formatters';
import { useAuthStore, selectIsAuthenticated, selectUser } from '@/store/auth.store';
import { useToggleStoreFollow } from '@/hooks/mutations/useStoreMutations';
import { useIsFollowingStore } from '@/hooks/queries/useStores';
import { ReportStoreButton } from '@/components/stores/ReportStoreButton';
import { ShareAdButton } from '@/components/ads/ShareAdButton';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { MessageUserButtonGate } from '@/components/profile/MessageUserButtonGate';
import { DownloadStoreCatalogButton } from '@/components/stores/DownloadStoreCatalogButton';
import { StorePaymentMethods } from '@/components/payment/StorePaymentMethods';
import { ROUTES, APP_URL } from '@/lib/constants';
import type { StoreWithSellerAndCounts, StoreWeekday } from '@/types/store.types';

// STORE-HOURS (Foundation v1): sat-first order, same as
// WorkingHoursEditor.tsx's DAYS array — kept as a separate literal
// here rather than importing that component's internal (unexported)
// array, since this is a read-only display, not an editor.
const STORE_HOURS_DAYS: { key: StoreWeekday; label: string }[] = [
  { key: 'sat', label: 'السبت' },
  { key: 'sun', label: 'الأحد' },
  { key: 'mon', label: 'الاثنين' },
  { key: 'tue', label: 'الثلاثاء' },
  { key: 'wed', label: 'الأربعاء' },
  { key: 'thu', label: 'الخميس' },
  { key: 'fri', label: 'الجمعة' },
];

interface Props {
  store: StoreWithSellerAndCounts;
  /**
   * FIX BUG-03: this used to be required-in-spirit-but-never-passed —
   * the public store endpoint doesn't include per-viewer follow state,
   * and no caller ever supplied it, so the button always rendered as
   * if logged out of any follow relationship. Now optional: if omitted,
   * this component derives it itself via useIsFollowingStore(). Still
   * accepted as an override for tests/Storybook or a future caller that
   * already has the answer some other way.
   */
  isFollowing?: boolean;
}

/**
 * REDESIGN: rebuilt to match the "متجر" mock (cover photo with rounded
 * bottom corners, overlapping circular avatar + verified badge, centered
 * name/stats card, full-width call + follow row, centered bio). All
 * data/behavior is unchanged from before — same store fields, same
 * follow/own-store/report logic — only the layout and visual treatment
 * moved to match the design. Kept scoped to this component rather than
 * the shared Button/Badge primitives or Tailwind theme, since only this
 * page was asked to match the mock.
 */
export function StoreHeader({ store, isFollowing: isFollowingProp }: Props) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const currentUser = useAuthStore(selectUser);
  const toggleFollow = useToggleStoreFollow();
  const derivedIsFollowing = useIsFollowingStore(store.id);
  const isFollowing = isFollowingProp ?? derivedIsFollowing;
  const isOwnStore = currentUser?.id === store.sellerProfile.userId;
  const shareUrl = `${APP_URL}${ROUTES.storeDetail(store.id)}`;
  const waDigits = store.phone.replace(/\D/g, '');
  const waPhone = waDigits.startsWith('970')
    ? waDigits
    : waDigits.startsWith('0')
      ? `970${waDigits.slice(1)}`
      : waDigits;
  const avatar = getAvatarUrl(store.logoUrl ?? store.sellerProfile.avatarUrl ?? '', 128);
  const cover = store.coverImageUrl ? getDetailImageUrl(store.coverImageUrl, 1200) : null;
  const rating = parseFloat(store.sellerProfile.averageRating);

  return (
    <div className="mx-auto w-full max-w-lg">
      {/* الغلاف — الصورة فقط داخل القص؛ الشعار خارجها */}
      <div className="relative">
        <div className="relative h-40 w-full overflow-hidden rounded-2xl bg-muted shadow-sm sm:h-48">
          {cover ? (
            <SafeImage src={cover} alt="" fill className="object-cover" sizes="(max-width: 640px) 100vw, 512px" priority />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-muted to-muted-foreground/15" aria-hidden />
          )}
          <FavoriteButton
            entityType="STORE"
            entityId={store.id}
            warm
            className="absolute top-3 end-3 z-10 rounded-full bg-background/80 shadow-sm backdrop-blur-sm"
          />
        </div>

        {/* الشعار خارج الغلاف — توسيط آمن لـ RTL/LTR */}
        <div className="relative z-10 -mt-12 flex justify-center">
          <div className="relative shrink-0">
            <div className="relative h-[5.5rem] w-[5.5rem] overflow-hidden rounded-full border-[3px] border-background bg-card shadow-md sm:h-24 sm:w-24">
              <SafeImage variant="avatar" src={avatar} alt={store.name} fill className="object-cover" sizes="96px" />
            </div>
            {store.sellerProfile.verified && (
              <div className="absolute -bottom-0.5 -end-0.5 z-10">
                <VerifiedBadge />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* المحتوى — وسط الشاشة */}
      <div className="mt-3.5 flex flex-col items-center gap-0.5 px-1 text-center sm:px-0">
        <h1 className="flex flex-wrap items-center justify-center gap-2 text-lg font-bold leading-snug text-foreground sm:text-xl">
          {store.name}
          {store.plan === 'FEATURED' && (
            <Badge className="gap-1 border border-amber-500/25 bg-amber-500/10 text-amber-900 hover:bg-amber-500/15 dark:text-amber-200">
              <Sparkles className="h-3.5 w-3.5" /> مميز
            </Badge>
          )}
        </h1>

        {store.sellerProfile.totalRatings > 0 && (
          <span className="mt-1.5 flex items-center gap-1 text-sm text-muted-foreground">
            <Star className="h-3.5 w-3.5 fill-rating text-rating" />
            {rating.toFixed(1)} ({store.sellerProfile.totalRatings} تقييم)
          </span>
        )}

        {/* STORE-HOURS (Foundation v1): isOpen is computed server-side
            from workingHours + the current time — null (nothing
            rendered) means the owner hasn't set hours at all, same
            "unknown, don't claim closed" reasoning as
            stores.service.ts's computeIsOpen doc comment. Same
            dot+label visual convention as ServiceProviderHeader's
            AVAILABILITY_DOT, just derived instead of a stored enum. */}
        {store.isOpen !== null && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
            <span className={`h-2 w-2 rounded-full ${store.isOpen ? 'bg-success' : 'bg-muted-foreground/60'}`} />
            {store.isOpen ? 'مفتوح الآن' : 'مغلق الآن'}
          </span>
        )}

        {/* BADGES: computed trust signals (verified/highly-rated/
            popular/new) — placed right under the open/closed line so
            they read as part of the store's identity summary, before
            the stats card. */}
        <StoreBadges storeId={store.id} className="mt-2" />

        {/* Stats card */}
        <div className="mt-4 w-full max-w-sm rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm">
          <div className="flex justify-around items-center">
            <div className="flex flex-col items-center">
              <span className="text-lg font-semibold tabular-nums text-foreground">{store._count.followers}</span>
              <span className="text-[11px] text-muted-foreground">متابع</span>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="flex flex-col items-center">
              <span className="text-lg font-semibold tabular-nums text-foreground">{store._count.products}</span>
              <span className="text-[11px] text-muted-foreground">منتج</span>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="flex flex-col items-center">
              <span className="mb-0.5 text-lg font-semibold tabular-nums text-foreground">{store.city}</span>
              <span className="text-[11px] text-muted-foreground">المدينة</span>
            </div>
          </div>
        </div>

        {/* Call + follow row */}
        <div className="mt-4 flex w-full max-w-sm gap-2 justify-center">
          <a
            href={`tel:${store.phone}`}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition active:scale-[0.98]"
          >
            <Phone className="h-4 w-4" /> {formatPhone(store.phone)}
          </a>
          {isAuthenticated && !isOwnStore && (
            <Button
              variant={isFollowing ? 'outline' : 'default'}
              disabled={toggleFollow.isPending}
              onClick={() => toggleFollow.mutate(store.id)}
              className="h-auto min-h-11 flex-1 gap-2 rounded-full py-2.5"
            >
              {isFollowing ? <UserMinus className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {isFollowing ? 'إلغاء المتابعة' : 'متابعة'}
            </Button>
          )}
        </div>

        <div className="mt-2 flex w-full max-w-sm items-center justify-center gap-2">
          {!isOwnStore && waPhone.length >= 9 && (
            <a
              href={`https://wa.me/${waPhone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-10 flex-1 items-center justify-center rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-center text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-500/15 dark:text-emerald-300"
            >
              واتساب
            </a>
          )}
          <ShareAdButton title={store.name} url={shareUrl} variant="button" className="flex-1" />
        </div>

        {/* تحميل كتالوج المنتجات كاملًا كملف HTML للمشاهدة بدون إنترنت */}
        <div className="mt-3 w-full max-w-sm">
          <DownloadStoreCatalogButton
            storeId={store.id}
            storeName={store.name}
            variant="outline"
            className="w-full rounded-full py-2.5 h-auto gap-2 text-sm font-medium"
          />
        </div>

        {/* دفع فقط (بطاقات النت في الرئيسية) */}
        {/* UNIFY-PAYMENTS-STORES: read from sellerProfile — store no
            longer has its own paymentMethods column. */}
        <StorePaymentMethods
          paymentMethods={store.sellerProfile.paymentMethods}
          entityName={store.name}
          storeName={store.name}
          fallbackName={store.name}
          fallbackPhone={store.phone}
          className="w-full"
        />

        {/* FEAT-MSG-UNIFY: "مراسلة المتجر" — unified messaging entry
            point (MessageUserButtonGate) targeting the store's owner
            user, exactly like SellerCard/ProductDetail's own "راسل
            المتجر" button. Reuses the same (buyerId, sellerId) thread
            as any other entry point for this owner — no store-specific
            conversation. The component already hides itself on the
            owner's own store and handles the unauthenticated case, so
            no extra isOwnStore/isAuthenticated guard is needed here. */}
        {!isOwnStore && (
          <div className="mt-3 w-full max-w-sm">
            <MessageUserButtonGate
              targetUserId={store.sellerProfile.userId}
              size="lg"
              variant="outline"
              label="مراسلة المتجر"
              className="w-full rounded-full py-3 h-auto gap-2 font-medium"
            />
          </div>
        )}

        {/* Owner tools — products + store management (NOT classified ads).
            Ads stay on /ads/create from dashboard/nav; the store surface
            is for catalog products. Shown for the owner regardless of
            ACTIVE so PENDING stores can still prepare products/settings. */}
        {isOwnStore && (
          <div className="mt-4 w-full max-w-sm space-y-2">
            {store.status === 'ACTIVE' && (
              <Button asChild className="w-full rounded-full py-3 h-auto gap-2 font-semibold">
                <Link href={ROUTES.myStoreProductCreate}>
                  <PackagePlus className="h-4 w-4" aria-hidden />
                  إضافة منتج
                </Link>
              </Button>
            )}
            <div className="grid grid-cols-3 gap-2">
              <Button asChild variant="outline" size="sm" className="h-auto flex-col gap-1 rounded-2xl py-2.5 text-[11px]">
                <Link href={ROUTES.myStoreProducts}>
                  <Package className="h-4 w-4" aria-hidden />
                  منتجاتي
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-auto flex-col gap-1 rounded-2xl py-2.5 text-[11px]">
                <Link href={ROUTES.myStoreAnalytics}>
                  <BarChart3 className="h-4 w-4" aria-hidden />
                  الإحصائيات
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-auto flex-col gap-1 rounded-2xl py-2.5 text-[11px]">
                <Link href={ROUTES.myStore}>
                  <Settings2 className="h-4 w-4" aria-hidden />
                  تعديل المتجر
                </Link>
              </Button>
            </div>
          </div>
        )}

        {store.description && (
          <p className="mt-5 max-w-sm text-center text-sm leading-relaxed text-muted-foreground">
            {store.description}
          </p>
        )}

        {store.latitude && store.longitude && (
          <a
            href={`https://www.openstreetmap.org/?mlat=${store.latitude}&mlon=${store.longitude}#map=16/${store.latitude}/${store.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <MapPin className="h-3.5 w-3.5" />
            عرض الموقع على الخريطة
          </a>
        )}

        {/* STORE-HOURS (Foundation v1): full weekly schedule, shown only
            when the owner has set at least one day — same trigger as
            the isOpen badge above. Collapsed under a <details> so it
            doesn't compete with the description/follow row for space
            on first paint; a buyer who wants the full week can expand
            it. */}
        {store.workingHours && (
          <details className="mt-4 w-full max-w-sm text-sm text-start">
            <summary className="cursor-pointer text-center text-primary select-none">
              ساعات العمل
            </summary>
            <ul className="mt-2 space-y-1 rounded-xl border border-border/80 bg-card/50 p-3">
              {STORE_HOURS_DAYS.map(({ key, label }) => {
                const schedule = store.workingHours![key];
                return (
                  <li key={key} className="flex items-center justify-between text-muted-foreground">
                    <span>{label}</span>
                    <span>{schedule ? `${schedule.open} - ${schedule.close}` : 'مغلق'}</span>
                  </li>
                );
              })}
            </ul>
          </details>
        )}

        {isAuthenticated && !isOwnStore && (
          <div className="mt-3">
            {/* FEAT-REPORT-USER-STORE: same isOwnStore/isAuthenticated
                guard the follow button above uses — a store's own
                seller shouldn't see (or submit) a report against their
                own store, matching the self-report check
                reports.service.ts already enforces server-side. */}
            <ReportStoreButton storeId={store.id} />
          </div>
        )}
      </div>
    </div>
  );
}
