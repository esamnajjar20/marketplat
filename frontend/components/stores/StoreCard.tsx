import Link from 'next/link';
import Image from 'next/image';
import { BadgeCheck, Star, MapPin, Sparkles } from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import { getAvatarUrl } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import type { StoreWithSeller } from '@/types/store.types';

interface Props {
  store: StoreWithSeller;
  className?: string;
}

/** Directory card for /stores. Mirrors ServiceProviderCard's layout. */
export function StoreCard({ store, className }: Props) {
  const avatar = getAvatarUrl(store.logoUrl ?? '', 96);
  const rating = parseFloat(store.sellerProfile.averageRating);

  return (
    <Link
      href={ROUTES.storeDetail(store.id)}
      className={cn(
        'group flex gap-3 rounded-xl border bg-card p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg',
        className
      )}
    >
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
        <Image src={avatar} alt={store.name} fill className="object-cover" sizes="64px" />
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-medium">{store.name}</h3>
          {store.plan === 'FEATURED' && (
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="متجر مميز" />
          )}
          {store.sellerProfile.verified && (
            <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="بائع موثّق" />
          )}
        </div>
        <p className="line-clamp-1 text-sm text-muted-foreground">{store.description}</p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {store.city}
          </span>
          {store.sellerProfile.totalRatings > 0 && (
            <span className="flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              {rating.toFixed(1)} ({store.sellerProfile.totalRatings})
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
