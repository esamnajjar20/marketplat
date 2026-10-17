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
import { SaveOfflineButton } from '@/components/shared/SaveOfflineButton';
import { MessageUserButtonGate } from '@/components/profile/MessageUserButtonGate';
import { DownloadStoreCatalogButton } from '@/components/stores/DownloadStoreCatalogButton';
import { StorePaymentMethods } from '@/components/payment/StorePaymentMethods';
import { StoreAttributesSummary } from '@/components/stores/StoreAttributesSummary';
import { ROUTES, APP_URL } from '@/lib/constants';
import { getStoreTypeLabels, getStoreTypePresentation, type StoreWithSellerAndCounts, type StoreWeekday } from '@/types/store.types';

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
   * this used to be required-in-spirit-but-never-passed —
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
  // sellerProfile is typed non-optional but can
  // be null for stores whose owner never finished seller onboarding
  // (see ProductDetail.tsx's ) — every access is guarded.
  const isOwnStore = currentUser?.id === store.sellerProfile?.userId;
  const shareUrl = `${APP_URL}${ROUTES.storeDetail(store.id)}`;
  const waDigits = store.phone.replace(/\D/g, '');
  const waPhone = waDigits.startsWith('970')
    ? waDigits
    : waDigits.startsWith('0')
      ? `970${waDigits.slice(1)}`
      : waDigits;
  const avatar = getAvatarUrl(store.logoUrl ?? '', 128);
  const cover = store.coverImageUrl ? getDetailImageUrl(store.coverImageUrl, 1200) : null;
  const rating = parseFloat(store.sellerProfile?.averageRating ?? '0');
  const storeLabels = getStoreTypeLabels(store.storeType);
  const presentation = getStoreTypePresentation(store.storeType);

  return (
    <section className="mx-auto w-full max-w-6xl overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
      {/* الغلاف — الصورة فقط داخل القص؛ الشعار خارجها */}
      <div className="relative">
        <div className="relative h-40 w-full overflow-hidden rounded-b-[1.75rem] bg-muted sm:h-52 md:h-60 lg:h-72">
          {cover ? (
            <SafeImage src={cover} alt="" fill className="object-cover" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1024px" priority />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary-muted to-primary/80" aria-hidden>
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 390 168" preserveAspectRatio="xMidYMid slice" fill="none" stroke="white" strokeOpacity={0.12} strokeWidth={1.5} aria-hidden="true">
                <circle cx="330" cy="40" r="70" /><circle cx="330" cy="40" r="110" /><circle cx="40" cy="170" r="60" />
                <path d="M0 120l60-40 60 40M120 120l60-40 60 40" />
              </svg>
            </div>
          )}
          <FavoriteButton
            entityType="STORE"
            entityId={store.id}
            warm
            className="absolute top-3 end-3 z-10 rounded-full bg-background/80 shadow-sm backdrop-blur-sm"
          />
          {/* SAVE-ENTITY-01-STORE: save the store's API response + its
              logo and cover into Cache Storage. icon variant so it sits
              next to FavoriteButton without crowding the cover. */}
          <SaveOfflineButton
            type="store"
            id={store.id}
            title={store.name}
            subtitle={store.city}
            city={store.city}
            thumbnail={store.logoUrl ?? null}
            imageUrls={[store.logoUrl, store.coverImageUrl].filter(Boolean) as string[]}
            variant="icon"
            className="absolute top-3 end-14 z-10"
          />
        </div>

        {/* الشعار خارج الغلاف — توسيط آمن لـ RTL/LTR */}
        <div className="relative z-10 -mt-14 flex justify-center lg:justify-start lg:px-10">
          <div className="relative shrink-0">
            <div className="relative h-24 w-24 overflow-hidden rounded-full border-4 border-card bg-primary-soft shadow-lg sm:h-28 sm:w-28">
              <SafeImage variant="avatar" src={avatar} alt={store.name} fill className="object-cover" sizes="112px" />
            </div>
            {store.sellerProfile?.verified && (
              <div className="absolute -bottom-0.5 -end-0.5 z-10">
                <VerifiedBadge />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* المحتوى — وسط الشاشة */}
      <div className="relative mt-0 flex flex-col items-center gap-1 px-3 pb-6 text-center sm:px-6 sm:pb-8 lg:items-stretch lg:px-10 lg:pb-10 lg:text-start">
        <div className="flex w-full flex-col items-center gap-1 lg:-mt-28 lg:items-start lg:pt-16 lg:ps-[8.5rem]">
        <p className="mt-3 text-xs font-semibold text-primary">{presentation.page.title}</p>
        <h1 className="flex flex-wrap items-center justify-center gap-2 lg:justify-start text-xl font-extrabold leading-snug text-foreground sm:text-2xl">
          {store.name}
          {store.plan === 'FEATURED' && (
            <Badge className="gap-1 border-0 bg-accent-soft text-accent hover:bg-accent-soft">
              <Sparkles className="h-3.5 w-3.5" /> مميز
            </Badge>
          )}
        </h1>
        {presentation.page.subtitle && <p className="max-w-2xl text-xs leading-5 text-muted-foreground sm:text-sm">{presentation.page.subtitle}</p>}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground lg:justify-start">
          {store.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{store.city}</span>}
          {store.address && <span className="max-w-[28rem] truncate">{store.address}</span>}
        </div>

        {/* STOREHEADER-NULL-GUARD-01: sellerProfile is documented as
            possibly null (see SW-FIX-STOREHEADER-SP at the top of this
            file) — every other access uses ?., this one didn't. A null
            profile crashed the whole header instead of just skipping
            the rating line. */}
        {store.sellerProfile?.totalRatings != null && store.sellerProfile.totalRatings > 0 && (
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-warning-soft px-3 py-1 text-sm font-semibold text-foreground">
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
          <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${store.isOpen ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground'}`}>
            <span className={`h-2 w-2 rounded-full ${store.isOpen ? 'bg-success' : 'bg-muted-foreground/60'}`} />
            {store.isOpen ? 'مفتوح الآن' : 'مغلق الآن'}
          </span>
        )}

        {/* BADGES: computed trust signals (verified/highly-rated/
            popular/new) — placed right under the open/closed line so
            they read as part of the store's identity summary, before
            the stats card. */}
        <StoreBadges storeId={store.id} className="mt-2 lg:justify-start" />
        </div>

        {/* Stats card */}
        <div className="mt-5 w-full max-w-4xl rounded-2xl border border-border/70 bg-background/90 p-3 shadow-sm sm:p-4 lg:max-w-none">
          <div className="grid grid-cols-3 items-stretch gap-2 sm:gap-3">
            <div className="flex min-h-[76px] flex-col items-center justify-center rounded-2xl bg-surface-2 px-2 py-3">
              <span className="text-xl font-extrabold tabular-nums text-foreground">{store._count.followers}</span>
              <span className="text-xs text-muted-foreground">متابع</span>
            </div>
            <div className="flex min-h-[76px] flex-col items-center justify-center rounded-2xl bg-surface-2 px-2 py-3">
              <span className="text-xl font-extrabold tabular-nums text-foreground">{store._count.products}</span>
              <span className="text-xs text-muted-foreground">{storeLabels.product}</span>
            </div>
            <div className="flex min-h-[76px] flex-col items-center justify-center rounded-2xl bg-surface-2 px-2 py-3">
              <span className="max-w-full truncate text-sm font-bold text-foreground">{store.city}</span>
              <span className="text-xs text-muted-foreground">الموقع</span>
            </div>
          </div>
        </div>

        <StoreAttributesSummary storeTypeId={store.storeTypeId} fields={store.storeType?.fields} attributes={store.attributes} presentation={store.storeType?.presentation} />

        {/* Call + follow row */}
        <div className="mt-5 flex w-full max-w-4xl flex-col gap-2 lg:max-w-none lg:flex-row">
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:flex-1">
          <a
            href={`tel:${store.phone}`}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-primary/90 active:scale-[0.98]"
          >
            <Phone className="h-4 w-4" /> {formatPhone(store.phone)}
          </a>
          {isAuthenticated && !isOwnStore && (
            <Button
              variant={isFollowing ? 'outline' : 'default'}
              disabled={toggleFollow.isPending}
              onClick={() => toggleFollow.mutate(store.id)}
              className="h-auto min-h-11 flex-1 gap-2 rounded-2xl py-2.5 font-bold"
            >
              {isFollowing ? <UserMinus className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {isFollowing ? 'إلغاء المتابعة' : 'متابعة'}
            </Button>
          )}
        </div>

        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:flex-1">
          {!isOwnStore && waPhone.length >= 9 && (
            <a
              href={`https://wa.me/${waPhone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-10 items-center justify-center rounded-2xl border border-success/25 bg-success-soft px-3 py-2 text-center text-sm font-medium text-success transition-colors hover:bg-success/15 dark:text-success"
            >
              واتساب
            </a>
          )}
          {/* SHARE-QR-WIRE-STORE: store has no price; extra shows
              plan status (مميز / عادي) so the receiver knows what
              they're looking at offline. */}
          <ShareAdButton
            title={store.name}
            url={shareUrl}
            variant="button"
            className="w-full"
            qrPayload={{
              kind: 'store',
              title: store.name,
              price: null,
              city: store.city ?? '',
              extra: store.plan === 'FEATURED' ? 'متجر مميز' : 'متجر',
              desc: store.description ?? '',
            }}
          />
        </div>

        </div>

        {/* تحميل كتالوج المنتجات كاملًا كملف HTML للمشاهدة بدون إنترنت */}
        <div className="mt-3 w-full max-w-4xl lg:max-w-none">
          <DownloadStoreCatalogButton
            storeId={store.id}
            storeName={store.name}
            variant="outline"
            className="w-full rounded-2xl py-2.5 h-auto gap-2 text-sm font-medium"
          />
        </div>

        {/* دفع فقط (بطاقات النت في الرئيسية) */}
        {/* UNIFY-PAYMENTS-STORES: read from sellerProfile — store no
            longer has its own paymentMethods column. */}
        <StorePaymentMethods
          paymentMethods={store.sellerProfile?.paymentMethods}
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
          <div className="mt-3 w-full max-w-4xl lg:max-w-none">
            <MessageUserButtonGate
              targetUserId={store.sellerProfile?.userId ?? ''}
              size="lg"
              variant="outline"
              label="مراسلة المتجر"
              className="w-full rounded-2xl py-3 h-auto gap-2 font-medium"
            />
          </div>
        )}

        {/* Owner tools — products + store management (NOT classified ads).
            Ads stay on /ads/create from dashboard/nav; the store surface
            is for catalog products. Shown for the owner regardless of
            ACTIVE so PENDING stores can still prepare products/settings. */}
        {isOwnStore && (
          <div className="mt-5 w-full max-w-4xl space-y-3 rounded-2xl lg:max-w-none border border-primary/15 bg-primary/[0.035] p-3 sm:p-4">
            {store.status === 'ACTIVE' && (
              <Button asChild className="w-full rounded-2xl py-3 h-auto gap-2 font-semibold">
                <Link href={ROUTES.myStoreProductCreate}>
                  <PackagePlus className="h-4 w-4" aria-hidden />
                  {storeLabels.addProduct}
                </Link>
              </Button>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button asChild variant="outline" size="sm" className="h-auto flex-col gap-1 rounded-2xl py-2.5 text-2xs-tight">
                <Link href={ROUTES.myStoreProducts}>
                  <Package className="h-4 w-4" aria-hidden />
                  {storeLabels.products}
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-auto flex-col gap-1 rounded-2xl py-2.5 text-2xs-tight">
                <Link href={ROUTES.myStoreAnalytics}>
                  <BarChart3 className="h-4 w-4" aria-hidden />
                  الإحصائيات
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-auto flex-col gap-1 rounded-2xl py-2.5 text-2xs-tight">
                <Link href={ROUTES.myStore}>
                  <Settings2 className="h-4 w-4" aria-hidden />
                  تعديل المتجر
                </Link>
              </Button>
            </div>
          </div>
        )}

        {store.description && (
          <section className="mt-5 w-full max-w-2xl rounded-2xl lg:max-w-none border border-border/70 bg-card p-4 text-start shadow-sm sm:p-5">
            <h2 className="text-sm font-semibold text-foreground">{presentation.page.details}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {store.description}
          </p>
          </section>
        )}

        {store.latitude && store.longitude && (
          <a
            href={`https://www.openstreetmap.org/?mlat=${store.latitude}&mlon=${store.longitude}#map=16/${store.latitude}/${store.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 self-center lg:self-start rounded-2xl border border-border/70 bg-card px-4 py-2 text-sm font-medium text-primary shadow-sm hover:bg-muted/50"
          >
            <MapPin className="h-3.5 w-3.5" />
            {presentation.page.location}
          </a>
        )}

        {/* STORE-HOURS (Foundation v1): full weekly schedule, shown only
            when the owner has set at least one day — same trigger as
            the isOpen badge above. Collapsed under a <details> so it
            doesn't compete with the description/follow row for space
            on first paint; a buyer who wants the full week can expand
            it. */}
        {store.workingHours && (
          <details className="mt-4 w-full max-w-2xl rounded-2xl lg:max-w-none border border-border/70 bg-card p-4 text-sm text-start shadow-sm">
            <summary className="cursor-pointer select-none font-semibold text-foreground">
              ساعات العمل
            </summary>
            <ul className="mt-3 space-y-1 rounded-xl bg-muted/35 p-3">
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
    </section>
  );
}
