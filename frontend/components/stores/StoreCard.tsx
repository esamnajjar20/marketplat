import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Badge } from '@/components/ui/badge';
import { BadgeCheck, Star, MapPin, Sparkles } from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import { getAvatarUrl } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import { HIT_AREA } from '@/components/shared/cards/cardTokens';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import type { StoreWithSeller } from '@/types/store.types';

interface Props {
  store: StoreWithSeller;
  className?: string;
  density?: 'default' | 'compact';
}

/** Directory card for /stores — aligned with design system. */
export function StoreCard({ store, className, density = 'default' }: Props) {
  const compact = density === 'compact';
  const avatar = getAvatarUrl(store.logoUrl ?? '', 96);
  const rating = parseFloat(store.sellerProfile.averageRating);
  const hasRating = store.sellerProfile.totalRatings > 0 && Number.isFinite(rating);
  const description = store.description?.trim();

  return (
    <div className="relative h-full">
      <Link
        href={ROUTES.storeDetail(store.id)}
        prefetch={false}
        className={cn(
          'group flex h-full rounded-2xl border border-border/80 bg-card shadow-sm pe-11',
          compact ? 'gap-2.5 p-2.5' : 'gap-3.5 p-3.5',
          'transition-all duration-200 active:scale-[0.98]',
          'hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
          className,
        )}
      >
        <div className="relative h-[4.25rem] w-[4.25rem] shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border/50 sm:h-[4.5rem] sm:w-[4.5rem]">
          <SafeImage
            variant="avatar"
            src={avatar}
            alt={store.name}
            fill
            className="object-cover"
            sizes="72px"
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
          {description ? (
            <p className="line-clamp-1 text-xs text-muted-foreground sm:text-sm">{description}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground sm:text-xs">
            {store.city ? (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {store.city}
              </span>
            ) : null}
            {hasRating && (
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
        className={`absolute top-2 end-2 ${HIT_AREA}`}
      />
    </div>
  );
}
