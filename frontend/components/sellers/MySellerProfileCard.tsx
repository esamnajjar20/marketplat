import Link from 'next/link';
import { BadgeCheck, Star, ShoppingBag, TrendingUp, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/shared/ui/Badge';
import { Button } from '@/components/shared/ui/Button';
import { ROUTES } from '@/lib/constants';
import { formatDate } from '@/lib/formatters';
import type { SellerProfile } from '@/types/seller.types';

interface Props {
  profile: SellerProfile;
}

export function MySellerProfileCard({ profile }: Props) {
  const rating = parseFloat(profile.averageRating);

  return (
    <div className="space-y-4 max-w-lg">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">{profile.displayName}</h2>
        {profile.verified ? (
          <Badge className="gap-1">
            <BadgeCheck className="h-3.5 w-3.5" /> بائع موثّق
          </Badge>
        ) : (
          <Badge variant="secondary">غير موثّق</Badge>
        )}
      </div>

      {profile.bio && <p className="text-sm text-muted-foreground">{profile.bio}</p>}

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2 rounded-md border p-3">
          <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="font-medium">{profile.activeAds}</p>
            <p className="text-xs text-muted-foreground">إعلان نشط</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-md border p-3">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="font-medium">{profile.totalSales}</p>
            <p className="text-xs text-muted-foreground">صفقة مكتملة</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-md border p-3">
          <Star className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="font-medium">
              {profile.totalRatings > 0 ? rating.toFixed(1) : '—'}
            </p>
            <p className="text-xs text-muted-foreground">{profile.totalRatings} تقييم</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-md border p-3">
          <div>
            <p className="font-medium">{formatDate(profile.joinedSellingAt)}</p>
            <p className="text-xs text-muted-foreground">تاريخ الانضمام كبائع</p>
          </div>
        </div>
      </div>

      <Button variant="outline" size="sm" asChild className="gap-1.5">
        <Link href={ROUTES.sellerProfile(profile.id)}>
          عرض صفحتي العامة كبائع <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}
