'use client';

import { useState } from 'react';
import Image from 'next/image';
import { BadgeCheck, Star, Calendar, ShoppingBag } from 'lucide-react';
import { Badge } from '@/components/shared/ui/Badge';
import { Button } from '@/components/shared/ui/Button';
import { getAvatarUrl } from '@/lib/cloudinary';
import { formatDate } from '@/lib/formatters';
import { useAuthStore, selectUser, selectIsAuthenticated } from '@/store/auth.store';
import { RateSellerDialog } from './RateSellerDialog';
import type { SellerProfile } from '@/types/seller.types';

interface Props {
  seller: SellerProfile;
}

export function SellerProfileHeader({ seller }: Props) {
  const [rateOpen, setRateOpen] = useState(false);
  const avatar = getAvatarUrl(seller.avatarUrl ?? '', 96);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const currentUser = useAuthStore(selectUser);
  const isOwnProfile = currentUser?.id === seller.userId;
  const rating = parseFloat(seller.averageRating);

  return (
    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-4 rounded-lg border bg-card">
      <div className="relative w-20 h-20 rounded-full overflow-hidden bg-muted shrink-0">
        <Image src={avatar} alt={seller.displayName} fill className="object-cover" sizes="80px" />
      </div>

      <div className="flex-1 space-y-1.5 text-center sm:text-start">
        <div className="flex items-center justify-center sm:justify-start gap-2">
          <h1 className="text-xl font-bold">{seller.displayName}</h1>
          {seller.verified && (
            <Badge className="gap-1">
              <BadgeCheck className="h-3.5 w-3.5" /> بائع موثّق
            </Badge>
          )}
        </div>

        <div className="flex items-center justify-center sm:justify-start gap-3 text-sm text-muted-foreground flex-wrap">
          {seller.totalRatings > 0 && (
            <span className="flex items-center gap-1">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              {rating.toFixed(1)} ({seller.totalRatings} تقييم)
            </span>
          )}
          <span className="flex items-center gap-1">
            <ShoppingBag className="h-4 w-4" /> {seller.activeAds} إعلان نشط
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="h-4 w-4" /> يبيع منذ {formatDate(seller.joinedSellingAt)}
          </span>
        </div>

        {seller.bio && <p className="text-sm mt-2 max-w-md">{seller.bio}</p>}

        {!isOwnProfile && (
          <div className="pt-2">
            <Button
              size="sm"
              variant="outline"
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
      </div>

      <RateSellerDialog sellerProfileId={seller.id} open={rateOpen} onOpenChange={setRateOpen} />
    </div>
  );
}
