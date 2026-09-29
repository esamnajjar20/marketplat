import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Badge } from '@/components/ui/badge';
import { BadgeCheck, Star, MapPin, Sparkles } from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import { getAvatarUrl } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import type { StoreWithSeller } from '@/types/store.types';

interface Props {
  store: StoreWithSeller;
  className?: string;
}

/** Directory card for /stores — aligned with design system. */
export function StoreCard({ store, className }: Props) {
  const avatar = getAvatarUrl(store.logoUrl ?? '', 96);
  const rating = parseFloat(store.sellerProfile.averageRating);

  return (
    <div className="relative">
      <Link
        href={ROUTES.storeDetail(store.id)}
        prefetch={false}
        className={cn(
          'group flex gap-3 rounded-xl border border-border/80 bg-card p-3 pe-11 shadow-sm',
          'transition-all duration-200 active:scale-[0.98]',
          'hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
          className,
        )}
      >
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border/50">
          <SafeImage
            variant="avatar"
            src={avatar}
            alt={store.name}
            fill
            className="object-cover"
            sizes="64px"
          />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold sm:text-card-title">{store.name}</h3>
            {store.plan === 'FEATURED' && (
              <Badge size="sm" variant="soft-accent" className="gap-0.5">
                <Sparkles className="h-3 w-3" aria-hidden />
                مميز
              </Badge>
            )}
            {store.sellerProfile.verified && (
              <BadgeCheck
                className="h-3.5 w-3.5 shrink-0 text-primary"
                aria-label="بائع موثّق"
              />
            )}
          </div>
          <p className="line-clamp-1 text-sm text-muted-foreground">{store.description}</p>
          <div className="flex flex-wrap items-center gap-3 text-2xs text-muted-foreground sm:text-xs">
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {store.city}
            </span>
            {store.sellerProfile.totalRatings > 0 && (
              <span className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-rating text-rating" aria-hidden />
                {rating.toFixed(1)} ({store.sellerProfile.totalRatings})
              </span>
            )}
          </div>
        </div>
      </Link>

      <FavoriteButton
        entityType="STORE"
        entityId={store.id}
        size="sm"
        className="absolute top-2 end-2"
      />
    </div>
  );
}
