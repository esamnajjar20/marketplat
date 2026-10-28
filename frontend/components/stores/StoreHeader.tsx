'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { safeBack } from '@/lib/navigation';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Star, Phone, MapPin, Plus, UserMinus, ChevronRight, PackagePlus, Package, Settings2, BarChart3 } from 'lucide-react';
import { VerifiedBadge } from '@/components/shared/VerifiedBadge';
import { Button } from '@/components/shared/ui/Button';
import { StoreBadges } from '@/components/stores/StoreBadges';
import { getAvatarUrl, getDetailImageUrl } from '@/lib/cloudinary';
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
 * REDESIGN v2 — matches the approved "صفحة المتجر" mockup 1:1 on mobile:
 * rounded cover with back/share/favorite circles, 92px logo + verified
 * badge, type label, name, plan tag + rating, location, open chip, bio,
 * 3-tile stats card, [follow | call | message-icon] row. Desktop (lg+)
 * puts the logo and identity side by side. All data/behavior is unchanged
 * (follow / own-store / report / payments / catalog / hours).
 */
const CIRCLE_BTN =
  'flex h-11 w-11 items-center justify-center rounded-full border-0 bg-white/90 p-0 text-foreground shadow-md backdrop-blur hover:bg-white';
const OUTLINE_BTN =
  'flex h-[46px] items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-primary/25 bg-card text-[15px] font-bold text-primary-strong transition hover:bg-primary-soft active:scale-[0.98]';

export function StoreHeader({ store, isFollowing: isFollowingProp }: Props) {
  const router = useRouter();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const currentUser = useAuthStore(selectUser);
  const toggleFollow = useToggleStoreFollow();
  const derivedIsFollowing = useIsFollowingStore(store.id);
  const isFollowing = isFollowingProp ?? derivedIsFollowing;
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
  const totalRatings = store.sellerProfile?.totalRatings ?? 0;
  const storeLabels = getStoreTypeLabels(store.storeType);
  const presentation = getStoreTypePresentation(store.storeType);
  const showFollow = isAuthenticated && !isOwnStore;
  const place = [store.city, store.address].filter(Boolean).join(' — ');

  return (
    <section className="mx-auto w-full max-w-6xl overflow-hidden rounded-3xl border border-border/70 bg-background shadow-sm">
      {/* الغلاف */}
      <div className="relative h-[168px] w-full overflow-hidden rounded-b-[28px] bg-muted sm:h-52 md:h-60 lg:h-72">
        {cover ? (
          <SafeImage src={cover} alt="" fill className="object-cover" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1024px" priority />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary-strong via-primary to-primary-muted" aria-hidden>
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 390 168" preserveAspectRatio="xMidYMid slice" fill="none" stroke="white" strokeOpacity={0.12} strokeWidth={1.5} aria-hidden="true">
              <circle cx="330" cy="40" r="70" /><circle cx="330" cy="40" r="110" /><circle cx="40" cy="170" r="60" />
              <path d="M0 120l60-40 60 40M120 120l60-40 60 40" />
            </svg>
          </div>
        )}
        <div className="absolute inset-x-3.5 top-3.5 z-10 flex items-center justify-between">
          <button type="button" onClick={() => safeBack(router as any)} aria-label="رجوع" className={CIRCLE_BTN}>
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
          <div className="flex items-center gap-2">
            <ShareAdButton
              title={store.name}
              url={shareUrl}
              variant="icon"
              className={CIRCLE_BTN}
              qrPayload={{
                kind: 'store',
                title: store.name,
                price: null,
                city: store.city ?? '',
                extra: store.plan === 'FEATURED' ? 'متجر مميز' : 'متجر',
                desc: store.description ?? '',
              }}
            />
            <FavoriteButton entityType="STORE" entityId={store.id} warm className={`${CIRCLE_BTN} text-accent`} />
          </div>
        </div>
      </div>

      {/* الهوية */}
      <div className="relative z-10 -mt-[46px] flex flex-col items-center px-4 lg:-mt-14 lg:flex-row lg:items-start lg:gap-6 lg:px-10">
        <div className="relative shrink-0">
          <div className="relative h-[92px] w-[92px] overflow-hidden rounded-full border-4 border-background bg-primary-soft shadow-lg lg:h-28 lg:w-28">
            <SafeImage variant="avatar" src={avatar} alt={store.name} fill className="object-cover" sizes="112px" />
          </div>
          {store.sellerProfile?.verified && (
            <div className="absolute -bottom-0.5 -end-0.5 z-10">
              <VerifiedBadge className="h-[26px] w-[26px] border-[3px]" />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col items-center text-center lg:flex-1 lg:items-start lg:pt-16 lg:text-start">
          <span className="mt-2 text-[13px] font-semibold text-primary lg:mt-0">{presentation.page.title}</span>
          <h1 className="mt-0.5 text-[23px] font-extrabold leading-snug text-foreground">{store.name}</h1>
          {presentation.page.subtitle && <p className="max-w-2xl text-xs leading-5 text-muted-foreground sm:text-sm">{presentation.page.subtitle}</p>}

          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
            {store.plan === 'FEATURED' && (
              <span className="inline-flex h-[26px] items-center rounded-full bg-accent-soft px-2.5 text-xs font-bold text-accent">متجر مميز</span>
            )}
            {totalRatings > 0 && (
              <span className="inline-flex items-center gap-1 text-sm font-bold text-foreground">
                <Star className="h-[15px] w-[15px] fill-rating text-rating" />
                {rating.toFixed(1)}
                <span className="font-normal text-muted-foreground">({totalRatings} تقييم)</span>
              </span>
            )}
          </div>

          {place && (
            <span className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0" aria-hidden />
              <span className="max-w-[28rem] truncate">{place}</span>
            </span>
          )}

          {store.isOpen !== null && (
            <span className={`mt-2.5 inline-flex h-[26px] items-center gap-1.5 rounded-full px-2.5 text-xs font-bold ${store.isOpen ? 'bg-primary-soft text-primary-strong' : 'bg-muted text-muted-foreground'}`}>
              <span className={`h-2 w-2 rounded-full ${store.isOpen ? 'bg-primary' : 'bg-muted-foreground/60'}`} />
              {store.isOpen ? 'مفتوح الآن' : 'مغلق الآن'}
            </span>
          )}

          <StoreBadges storeId={store.id} className="mt-2 lg:justify-start" />

          {store.description && (
            <p className="mx-1.5 mt-3 line-clamp-3 max-w-2xl text-sm leading-[1.8] text-foreground/75">{store.description}</p>
          )}
        </div>
      </div>

      <div className="px-4 pb-6 lg:px-10 lg:pb-10">
        <StoreAttributesSummary storeTypeId={store.storeTypeId} fields={store.storeType?.fields} attributes={store.attributes} presentation={store.storeType?.presentation} />

        {/* بطاقة الإحصائيات */}
        <div className="mt-4 flex gap-2 rounded-[20px] border border-border bg-card p-2.5 shadow-sm">
          {[
            { v: store._count.products, l: storeLabels.product },
            { v: store._count.followers, l: 'متابع' },
            { v: rating > 0 ? rating.toFixed(1) : '—', l: 'التقييم' },
          ].map((t) => (
            <div key={t.l} className="flex flex-1 flex-col items-center gap-0.5 rounded-[14px] bg-surface-2 px-1 py-3">
              <span className="text-[19px] font-extrabold leading-tight tabular-nums text-foreground">{t.v}</span>
              <span className="text-xs text-muted-foreground">{t.l}</span>
            </div>
          ))}
        </div>

        {/* متابعة | اتصال | مراسلة */}
        <div className="mt-3.5 flex gap-2 lg:max-w-2xl">
          {showFollow && (
            <Button
              variant={isFollowing ? 'outline' : 'default'}
              disabled={toggleFollow.isPending}
              onClick={() => toggleFollow.mutate(store.id)}
              className="h-[46px] flex-[1.4] gap-2 rounded-[14px] text-[15px] font-bold"
            >
              {isFollowing ? <UserMinus className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              {isFollowing ? 'إلغاء المتابعة' : 'متابعة'}
            </Button>
          )}
          <a href={`tel:${store.phone}`} className={`${OUTLINE_BTN} ${showFollow ? 'flex-1' : 'flex-[1.4]'}`}>
            <Phone className="h-5 w-5" /> اتصال
          </a>
          {!isOwnStore && (
            <MessageUserButtonGate
              targetUserId={store.sellerProfile?.userId ?? ''}
              size="icon"
              variant="outline"
              label=""
              ariaLabel="مراسلة المتجر"
              className={`${OUTLINE_BTN} w-[46px] shrink-0 gap-0 p-0`}
            />
          )}
        </div>

        {/* أدوات إضافية */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!isOwnStore && waPhone.length >= 9 && (
            <a
              href={`https://wa.me/${waPhone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center justify-center rounded-[14px] border border-success/25 bg-success-soft px-4 text-sm font-bold text-success transition-colors hover:bg-success/15"
            >
              واتساب
            </a>
          )}
          <SaveOfflineButton
            type="store"
            id={store.id}
            title={store.name}
            subtitle={store.city}
            city={store.city}
            thumbnail={store.logoUrl ?? null}
            imageUrls={[store.logoUrl, store.coverImageUrl].filter(Boolean) as string[]}
            variant="icon"
          />
          <DownloadStoreCatalogButton
            storeId={store.id}
            storeName={store.name}
            variant="outline"
            className="h-10 gap-2 rounded-[14px] text-sm font-medium"
          />
        </div>

        <StorePaymentMethods
          paymentMethods={store.sellerProfile?.paymentMethods}
          entityName={store.name}
          storeName={store.name}
          fallbackName={store.name}
          fallbackPhone={store.phone}
          className="mt-3 w-full"
        />

        {isOwnStore && (
          <div className="mt-4 space-y-3 rounded-[20px] border border-primary/15 bg-primary/[0.035] p-3 sm:p-4">
            {store.status === 'ACTIVE' && (
              <Button asChild className="h-auto w-full gap-2 rounded-[14px] py-3 font-bold">
                <Link href={ROUTES.myStoreProductCreate}>
                  <PackagePlus className="h-4 w-4" aria-hidden />
                  {storeLabels.addProduct}
                </Link>
              </Button>
            )}
            <div className="grid grid-cols-3 gap-2">
              <Button asChild variant="outline" size="sm" className="h-auto flex-col gap-1 rounded-[14px] py-2.5 text-2xs-tight">
                <Link href={ROUTES.myStoreProducts}><Package className="h-4 w-4" aria-hidden />{storeLabels.products}</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-auto flex-col gap-1 rounded-[14px] py-2.5 text-2xs-tight">
                <Link href={ROUTES.myStoreAnalytics}><BarChart3 className="h-4 w-4" aria-hidden />الإحصائيات</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-auto flex-col gap-1 rounded-[14px] py-2.5 text-2xs-tight">
                <Link href={ROUTES.myStore}><Settings2 className="h-4 w-4" aria-hidden />تعديل المتجر</Link>
              </Button>
            </div>
          </div>
        )}

        {store.latitude && store.longitude && (
          <a
            href={`https://www.openstreetmap.org/?mlat=${store.latitude}&mlon=${store.longitude}#map=16/${store.latitude}/${store.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 rounded-[14px] border border-border bg-card px-4 py-2 text-sm font-medium text-primary shadow-sm hover:bg-muted/50"
          >
            <MapPin className="h-3.5 w-3.5" />
            {presentation.page.location}
          </a>
        )}

        {store.workingHours && (
          <details className="mt-3 w-full rounded-[20px] border border-border bg-card p-4 text-start text-sm shadow-sm lg:max-w-2xl">
            <summary className="cursor-pointer select-none font-semibold text-foreground">ساعات العمل</summary>
            <ul className="mt-3 space-y-1 rounded-xl bg-surface-2 p-3">
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
            <ReportStoreButton storeId={store.id} />
          </div>
        )}
      </div>
    </section>
  );
}
