'use client';

import Image from 'next/image';
import { BadgeCheck, Star, Phone, MapPin, Sparkles, UserPlus, UserMinus } from 'lucide-react';
import { Badge } from '@/components/shared/ui/Badge';
import { Button } from '@/components/shared/ui/Button';
import { getAvatarUrl, getDetailImageUrl } from '@/lib/cloudinary';
import { formatPhone } from '@/lib/formatters';
import { useAuthStore, selectIsAuthenticated, selectUser } from '@/store/auth.store';
import { useToggleStoreFollow } from '@/hooks/mutations/useStoreMutations';
import { useIsFollowingStore } from '@/hooks/queries/useStores';
import { ReportStoreButton } from '@/components/stores/ReportStoreButton';
import type { StoreWithSellerAndCounts } from '@/types/store.types';

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
        {cover && <Image src={cover} alt="" fill className="object-cover opacity-90" sizes="100vw" priority />}
        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 flex justify-center w-full">
          <div className="relative w-24 h-24 rounded-full bg-background p-1 shadow-md">
            <div className="relative w-full h-full rounded-full overflow-hidden">
              <Image src={avatar} alt={store.name} fill className="object-cover" sizes="96px" />
            </div>
            {store.sellerProfile.verified && (
              <div className="absolute bottom-0 right-0 w-6 h-6 bg-primary rounded-full flex items-center justify-center border-2 border-background shadow-sm">
                <BadgeCheck className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
            )}
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

        {store.description && (
          <p className="mt-6 text-sm text-muted-foreground text-center max-w-[280px]">
            {store.description}
          </p>
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
