'use client';

import { useState } from 'react';
import Image from 'next/image';
import { BadgeCheck, Star, Calendar, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { getAvatarUrl } from '@/lib/cloudinary';
import { formatDate } from '@/lib/formatters';
import { useAuthStore, selectUser, selectIsAuthenticated } from '@/store/auth.store';
import { RateSellerDialog } from './RateSellerDialog';
import type { SellerProfile } from '@/types/seller.types';

interface Props {
  seller: SellerProfile;
}

/**
 * REDESIGN: same mock StoreHeader.tsx / PublicProfileHeader.tsx were
 * rebuilt against — centered avatar, name, stats card, centered bio.
 * A seller profile has no cover photo or follow relationship (that's a
 * store concept), so those are omitted; the stats card uses what a
 * seller actually has (active ads / rating / selling-since) instead of
 * a store's (followers/products/city). Same rate-seller flow and
 * own-profile guard as before — only the layout changed.
 */
export function SellerProfileHeader({ seller }: Props) {
  const [rateOpen, setRateOpen] = useState(false);
  const avatar = getAvatarUrl(seller.avatarUrl ?? '', 128);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const currentUser = useAuthStore(selectUser);
  const isOwnProfile = currentUser?.id === seller.userId;
  const rating = parseFloat(seller.averageRating);

  return (
    <div className="flex flex-col w-full items-center text-center pt-6">
      <div className="relative w-24 h-24 rounded-full bg-background p-1 shadow-md">
        <div className="relative w-full h-full rounded-full overflow-hidden bg-muted">
          <Image src={avatar} alt={seller.displayName} fill className="object-cover" sizes="96px" />
        </div>
        {seller.verified && (
          <div className="absolute bottom-0 right-0 w-6 h-6 bg-primary rounded-full flex items-center justify-center border-2 border-background shadow-sm">
            <BadgeCheck className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
        )}
      </div>

      <h1 className="mt-4 text-xl font-bold text-foreground">{seller.displayName}</h1>

      {seller.totalRatings > 0 && (
        <span className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
          <Star className="h-4 w-4 fill-rating text-rating" />
          {rating.toFixed(1)} ({seller.totalRatings} تقييم)
        </span>
      )}

      {/* Stats card */}
      <div className="mt-4 w-full max-w-sm bg-card border rounded-xl p-4 shadow-sm">
        <div className="flex justify-around items-center">
          <div className="flex flex-col items-center">
            <ShoppingBag className="h-5 w-5 text-primary mb-1" />
            <span className="text-xl font-semibold text-foreground">{seller.activeAds}</span>
            <span className="text-xs text-muted-foreground">إعلان نشط</span>
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="flex flex-col items-center">
            <Calendar className="h-5 w-5 text-primary mb-1" />
            <span className="text-xs text-muted-foreground">يبيع منذ {formatDate(seller.joinedSellingAt)}</span>
          </div>
        </div>
      </div>

      {!isOwnProfile && (
        <div className="mt-4">
          <Button
            variant="outline"
            className="rounded-full px-6"
            disabled={!isAuthenticated}
            onClick={() => setRateOpen(true)}
          >
            قيّم هذا البائع
          </Button>
          {!isAuthenticated && (
            <p className="text-xs text-muted-foreground mt-1">سجّل الدخول لتتمكن من التقييم</p>
          )}
        </div>
      )}

      {seller.bio && (
        <p className="mt-6 text-sm text-muted-foreground text-center max-w-[280px]">{seller.bio}</p>
      )}

      <RateSellerDialog sellerProfileId={seller.id} open={rateOpen} onOpenChange={setRateOpen} />
    </div>
  );
}
