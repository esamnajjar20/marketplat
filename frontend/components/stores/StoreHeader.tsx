'use client';

import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Star, Phone, MapPin, Sparkles, UserPlus, UserMinus, PlusCircle } from 'lucide-react';
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
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { ROUTES } from '@/lib/constants';
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
  const avatar = getAvatarUrl(store.logoUrl ?? store.sellerProfile.avatarUrl ?? '', 128);
  const cover = store.coverImageUrl ? getDetailImageUrl(store.coverImageUrl, 1200) : null;
  const rating = parseFloat(store.sellerProfile.averageRating);

  return (
    <div className="flex flex-col w-full -mx-4 sm:mx-0">
      {/* Cover + overlapping avatar */}
      <div className="relative w-full h-48 bg-muted flex items-end justify-center sm:rounded-b-xl overflow-hidden shadow-sm">
        {cover && <SafeImage src={cover} alt="" fill className="object-cover opacity-90" sizes="100vw" priority />}
        {/* STORE Favorite — distinct entity from StoreFollower (the
            "متابعة" button below); both stay independently available.
            warm=true: this is the single-store detail view, same
            reasoning as AdDetailSection's useFavoriteCheck(id). */}
        <FavoriteButton
          entityType="STORE"
          entityId={store.id}
          warm
          className="absolute top-3 end-3 z-10"
        />
        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 flex justify-center w-full">
          <div className="relative w-24 h-24 rounded-full bg-background p-1 shadow-md">
            <div className="relative w-full h-full rounded-full overflow-hidden">
              <SafeImage variant="avatar" src={avatar} alt={store.name} fill className="object-cover" sizes="96px" />
            </div>
            {store.sellerProfile.verified && <VerifiedBadge />}
          </div>
        </div>
      </div>

      {/* Store info */}
      <div className="pt-14 px-4 text-center flex flex-col items-center">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2 justify-center flex-wrap">
          {store.name}
          {store.plan === 'FEATURED' && (
            <Badge className="gap-1 bg-accent hover:bg-accent text-accent-foreground">
              <Sparkles className="h-3.5 w-3.5" /> مميز
            </Badge>
          )}
        </h1>

        {store.sellerProfile.totalRatings > 0 && (
          <span className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
            <Star className="h-4 w-4 fill-rating text-rating" />
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
            <span className={`h-1.5 w-1.5 rounded-full ${store.isOpen ? 'bg-success' : 'bg-muted-foreground'}`} />
            {store.isOpen ? 'مفتوح الآن' : 'مغلق الآن'}
          </span>
        )}

        {/* BADGES: computed trust signals (verified/highly-rated/
            popular/new) — placed right under the open/closed line so
            they read as part of the store's identity summary, before
            the stats card. */}
        <StoreBadges storeId={store.id} className="mt-2" />

        {/* Stats card */}
        <div className="mt-4 w-full max-w-sm bg-card border rounded-xl p-4 shadow-sm">
          <div className="flex justify-around items-center">
            <div className="flex flex-col items-center">
              <span className="text-xl font-semibold text-foreground">{store._count.followers}</span>
              <span className="text-xs text-muted-foreground">متابع</span>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="flex flex-col items-center">
              <span className="text-xl font-semibold text-foreground">{store._count.products}</span>
              <span className="text-xs text-muted-foreground">منتج</span>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="flex flex-col items-center">
              <MapPin className="h-5 w-5 text-primary mb-1" />
              <span className="text-xs text-muted-foreground">{store.city}</span>
            </div>
          </div>
        </div>

        {/* Call + follow row */}
        <div className="mt-4 flex gap-3 w-full max-w-sm justify-center">
          <a
            href={`tel:${store.phone}`}
            className="flex-1 bg-primary text-primary-foreground rounded-full py-3 px-4 flex items-center justify-center gap-2 text-sm font-medium shadow-md transition-transform active:scale-95"
          >
            <Phone className="h-4 w-4" /> {formatPhone(store.phone)}
          </a>
          {isAuthenticated && !isOwnStore && (
            <Button
              variant={isFollowing ? 'outline' : 'default'}
              disabled={toggleFollow.isPending}
              onClick={() => toggleFollow.mutate(store.id)}
              className="flex-1 rounded-full py-3 h-auto gap-2"
            >
              {isFollowing ? <UserMinus className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {isFollowing ? 'إلغاء المتابعة' : 'متابعة'}
            </Button>
          )}
        </div>

        {/*
          FEAT-STORE-PUBLISH-AD: entry point only — the ad itself stays
          Ad.sellerProfileId (SellerProfile), never Ad.storeId. There is
          no such column; this button is a UX shortcut into the same
          /ads/create route + CreateAdGate every seller already uses,
          not a new ownership model. Gated on:
            - isOwnStore: only the store's own seller sees this here
            - store.status === 'ACTIVE': a PENDING/BLOCKED store hides
              the button, but this is a UI convenience only — the real
              gate remains CreateAdGate's SellerProfile check on the
              /ads/create page itself, which is intentionally
              independent of store status (closing/blocking a store
              must not affect the seller's existing or future ads).
        */}
        {isOwnStore && store.status === 'ACTIVE' && (
          <div className="mt-3 w-full max-w-sm">
            <Button asChild variant="outline" className="w-full rounded-full py-3 h-auto gap-2">
              <Link href={ROUTES.adCreate}>
                <PlusCircle className="h-4 w-4" />
                نشر إعلان
              </Link>
            </Button>
          </div>
        )}

        {store.description && (
          <p className="mt-6 text-sm text-muted-foreground text-center max-w-[280px]">
            {store.description}
          </p>
        )}

        {/* STORE-HOURS (Foundation v1): full weekly schedule, shown only
            when the owner has set at least one day — same trigger as
            the isOpen badge above. Collapsed under a <details> so it
            doesn't compete with the description/follow row for space
            on first paint; a buyer who wants the full week can expand
            it. */}
        {store.workingHours && (
          <details className="mt-4 w-full max-w-sm text-sm">
            <summary className="cursor-pointer text-center text-primary select-none">
              ساعات العمل
            </summary>
            <ul className="mt-2 space-y-1 rounded-md border p-3">
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
