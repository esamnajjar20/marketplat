import { memo } from 'react';
import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { getDetailImageUrl } from '@/lib/cloudinary';
import { StoreDynamicFieldChips } from '@/components/stores/StoreDynamicFields';
import { Badge } from '@/components/ui/badge';
import { BadgeCheck, Star, MapPin, Sparkles } from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import { getAvatarUrl } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import { CARD_HEART_POSITION, CARD_PRESS, CARD_FOCUS, CARD_HOVER, HIT_AREA } from '@/components/shared/cards/cardTokens';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { getStoreTypePresentation, type StoreWithSeller } from '@/types/store.types';
import { CardOfflineBadge, type CardContext } from '@/components/shared/cards/cardParts';

interface Props {
  store: StoreWithSeller;
  className?: string;
  density?: 'default' | 'compact';
  context?: CardContext;
  layout?: 'grid' | 'list';
}

/** Directory card for /stores — aligned with design system. */
export const StoreCard = memo(function StoreCard({ store, className, density = 'default', context = 'public', layout = 'grid' }: Props) {
  const compact = density === 'compact' || layout === 'list';
  const avatar = getAvatarUrl(store.logoUrl ?? '', 96);
  const cover = store.coverImageUrl ? getDetailImageUrl(store.coverImageUrl, 720) : null;
  const rating = parseFloat(store.sellerProfile.averageRating);
  const hasRating = store.sellerProfile.totalRatings > 0 && Number.isFinite(rating);
  const presentation = getStoreTypePresentation(store.storeType);
  const storeTypeLabel = store.storeType?.nameAr || presentation.card.title;
  const fields = (store.storeType?.fields ?? []).filter((field) => field.scope !== 'PRODUCT');
  const showHeart = context !== 'owner';

  return (
    <article className={cn('group relative [content-visibility:auto] [contain-intrinsic-size:auto_320px] h-full w-full min-w-0', className)}>
      <Link
        href={ROUTES.storeDetail(store.id)}
        prefetch={false}
        className={cn(
          'flex h-full min-w-0 overflow-hidden rounded-card border border-border/70 bg-card shadow-card',
          layout === 'list' ? 'flex-row' : 'flex-col',
          CARD_HOVER,
          CARD_FOCUS,
          CARD_PRESS,
        )}
      >
        <div className={cn('relative overflow-hidden bg-muted', layout === 'list' ? 'aspect-auto h-32 w-32 shrink-0 sm:h-36 sm:w-44' : 'aspect-[3/1]') }>
          {cover ? (
            <SafeImage src={cover} alt="" fill className="object-cover transition-transform duration-normal ease-standard group-hover:scale-[1.02]" sizes="(max-width: 640px) 100vw, 360px" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-muted to-accent/10" aria-hidden />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" aria-hidden />
          <CardOfflineBadge />
          {store.plan === 'FEATURED' && (
            <Badge size="sm" variant="soft-accent" className="absolute start-2 top-2 gap-1 bg-background/85 backdrop-blur">
              <Sparkles className="h-3 w-3" aria-hidden />
              مميز
            </Badge>
          )}
        </div>

        <div className={cn('relative flex flex-1 flex-col', compact ? 'px-3 pb-3' : 'px-3.5 pb-3.5')}>
          <div className="-mt-7 mb-2 flex items-end justify-between gap-2">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl border-[3px] border-card bg-muted shadow-md">
              <SafeImage variant="avatar" src={avatar} alt={store.name} fill className="object-cover" sizes="56px" />
            </div>
            <div className="flex items-center gap-1.5 pb-1 text-xs text-muted-foreground">
              {store.sellerProfile.verified && <BadgeCheck className="h-4 w-4 text-primary" aria-label="بائع موثّق" />}
              {hasRating && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted/70 px-2 py-1">
                  <Star className="h-3.5 w-3.5 fill-rating text-rating" aria-hidden />
                  {rating.toFixed(1)}
                </span>
              )}
            </div>
          </div>

          <div className="min-w-0">
            <p className="text-xs font-semibold text-primary">{storeTypeLabel}</p>
            <h3 className="mt-0.5 truncate text-base font-bold text-foreground">{store.name}</h3>
            {presentation.card.subtitle ? <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{presentation.card.subtitle}</p> : null}
            {store.description?.trim() ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{store.description}</p> : null}
          </div>

          <div className="mt-3">
            <StoreDynamicFieldChips fields={fields} attributes={store.attributes} />
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-3 text-xs text-muted-foreground">
            {store.city ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {store.city}
              </span>
            ) : null}
            {store.sellerProfile.totalRatings > 0 ? <span>{store.sellerProfile.totalRatings} تقييم</span> : null}
          </div>
        </div>
      </Link>

      {showHeart && <FavoriteButton entityType="STORE" entityId={store.id} variant="card" className={`${CARD_HEART_POSITION} ${HIT_AREA}`} />}
    </article>
  );
});
