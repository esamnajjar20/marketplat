'use client';

import Image from 'next/image';
import { BadgeCheck, Star, Phone, MapPin, Sparkles, Users, Package } from 'lucide-react';
import { Badge } from '@/components/shared/ui/Badge';
import { Button } from '@/components/shared/ui/Button';
import { getAvatarUrl, getDetailImageUrl } from '@/lib/cloudinary';
import { formatPhone } from '@/lib/formatters';
import { useAuthStore, selectIsAuthenticated, selectUser } from '@/store/auth.store';
import { useToggleStoreFollow } from '@/hooks/mutations/useStoreMutations';
import { useIsFollowingStore } from '@/hooks/queries/useStores';
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

export function StoreHeader({ store, isFollowing: isFollowingProp }: Props) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const currentUser = useAuthStore(selectUser);
  const toggleFollow = useToggleStoreFollow();
  const derivedIsFollowing = useIsFollowingStore(store.id);
  const isFollowing = isFollowingProp ?? derivedIsFollowing;
  const isOwnStore = currentUser?.id === store.sellerProfile.userId;
  const avatar = getAvatarUrl(store.logoUrl ?? store.sellerProfile.avatarUrl ?? '', 96);
  const cover = store.coverImageUrl ? getDetailImageUrl(store.coverImageUrl, 1200) : null;
  const rating = parseFloat(store.sellerProfile.averageRating);

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {cover && (
        <div className="relative h-32 sm:h-44 w-full bg-muted">
          <Image src={cover} alt="" fill className="object-cover" sizes="100vw" />
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-4">
        <div className="relative w-20 h-20 rounded-full overflow-hidden bg-muted shrink-0 -mt-10 sm:mt-0 ring-4 ring-card">
          <Image src={avatar} alt={store.name} fill className="object-cover" sizes="80px" />
        </div>

        <div className="flex-1 space-y-1.5 text-center sm:text-start w-full">
          <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
            <h1 className="text-xl font-bold">{store.name}</h1>
            {store.plan === 'FEATURED' && (
              <Badge className="gap-1 bg-amber-500 hover:bg-amber-500 text-white">
                <Sparkles className="h-3.5 w-3.5" /> متجر مميز
              </Badge>
            )}
            {store.sellerProfile.verified && (
              <Badge className="gap-1">
                <BadgeCheck className="h-3.5 w-3.5" /> موثّق
              </Badge>
            )}
          </div>

          <div className="flex items-center justify-center sm:justify-start gap-3 text-sm text-muted-foreground flex-wrap">
            {store.sellerProfile.totalRatings > 0 && (
              <span className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                {rating.toFixed(1)} ({store.sellerProfile.totalRatings} تقييم)
              </span>
            )}
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" /> {store.city}
            </span>
            <span className="flex items-center gap-1">
              <Phone className="h-4 w-4" /> {formatPhone(store.phone)}
            </span>
            <span className="flex items-center gap-1">
              <Package className="h-4 w-4" /> {store._count.products} منتج
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" /> {store._count.followers} متابع
            </span>
          </div>

          <p className="text-sm mt-2 max-w-md">{store.description}</p>

          {isAuthenticated && !isOwnStore && (
            <div className="pt-1">
              <Button
                size="sm"
                variant={isFollowing ? 'outline' : 'default'}
                disabled={toggleFollow.isPending}
                onClick={() => toggleFollow.mutate(store.id)}
              >
                {isFollowing ? 'إلغاء المتابعة' : 'متابعة المتجر'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
