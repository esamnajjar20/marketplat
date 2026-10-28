import { memo } from 'react';
import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { getDetailImageUrl, getAvatarUrl } from '@/lib/cloudinary';
import { BadgeCheck, Star, Package, Users, Store as StoreIcon } from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { CARD_SHELL_SOFT, CARD_PRESS, CARD_FOCUS, CARD_HOVER, HIT_AREA } from '@/components/shared/cards/cardTokens';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { getStoreTypePresentation, type StoreWithSeller } from '@/types/store.types';
import { CardOfflineBadge, type CardContext } from '@/components/shared/cards/cardParts';
import { Button } from '@/components/ui/button';

interface Props {
  store: StoreWithSeller;
  className?: string;
  density?: 'default' | 'compact';
  context?: CardContext;
  layout?: 'grid' | 'list';
}

/** Directory card for /stores — matches design mockup (cover + overlapping logo + meta + CTA). */
export const StoreCard = memo(function StoreCard({
  store,
  className,
  density = 'default',
  context = 'public',
  layout = 'grid',
}: Props) {
  const compact = density === 'compact' || layout === 'list';
  const avatar = getAvatarUrl(store.logoUrl ?? '', 96);
  const cover = store.coverImageUrl ? getDetailImageUrl(store.coverImageUrl, 720) : null;
  const rating = parseFloat(store.sellerProfile.averageRating);
  const hasRating = store.sellerProfile.totalRatings > 0 && Number.isFinite(rating);
  const presentation = getStoreTypePresentation(store.storeType);
  const storeTypeLabel = store.storeType?.nameAr || presentation.card.title;
  const showHeart = context !== 'owner';
  const productCount = (store as { productCount?: number; _count?: { products?: number } }).productCount
    ?? (store as { _count?: { products?: number } })._count?.products;
  const followerCount = (store as { followerCount?: number; followersCount?: number }).followerCount
    ?? (store as { followersCount?: number }).followersCount;
  const initial = (store.name?.trim()?.[0] || 'م').toUpperCase();

  const coverFallbackClass =
    'absolute inset-0 bg-gradient-to-br from-[#1F4D33] via-[#397F56] to-[#5E9C73]';

  return (
    <article
      className={cn(
        'group relative h-full w-full min-w-0 [content-visibility:auto] [contain-intrinsic-size:auto_280px]',
        className,
      )}
    >
      <div
        className={cn(
          CARD_SHELL_SOFT,
          'flex flex-col p-2.5 sm:p-3',
          CARD_HOVER,
          CARD_FOCUS,
          CARD_PRESS,
        )}
      >
        {/* Cover band */}
        <div className={cn('relative overflow-hidden rounded-xl bg-muted', compact ? 'h-14' : 'h-16')}>
          {cover ? (
            <SafeImage
              src={cover}
              alt=""
              fill
              className="object-cover transition-transform duration-normal ease-standard group-hover:scale-[1.02]"
              sizes="(max-width: 640px) 100vw, 360px"
            />
          ) : (
            <div className={coverFallbackClass} aria-hidden>
              <StoreIcon className="absolute end-3 top-1/2 h-8 w-8 -translate-y-1/2 text-white/25" strokeWidth={1.4} />
            </div>
          )}
          <CardOfflineBadge />
          {store.plan === 'FEATURED' && (
            <span className="absolute start-2.5 top-2.5 inline-flex h-6 items-center rounded-full bg-[#FBEEE6] px-2.5 text-[11px] font-bold text-[#8F3F14]">
              مميز
            </span>
          )}
        </div>

        {/* Overlapping logo */}
        <div className="-mt-5 flex items-end justify-between px-1">
          <div className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-full border-[3px] border-card bg-primary/10 text-lg font-extrabold text-primary shadow-sm">
            {store.logoUrl ? (
              <SafeImage variant="avatar" src={avatar} alt={store.name} fill className="object-cover" sizes="52px" />
            ) : (
              <span aria-hidden>{initial}</span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="mt-2 min-w-0 space-y-1.5 px-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3
              title={store.name}
              className="min-w-0 flex-1 truncate text-[15px] font-bold leading-snug text-foreground"
            >
              {store.name}
            </h3>
            {(store.sellerProfile.verified || store.status === 'ACTIVE') && (
              <BadgeCheck className="h-4 w-4 shrink-0 text-primary" aria-label="موثّق" />
            )}
          </div>

          <p className="truncate text-xs text-muted-foreground">
            {[storeTypeLabel, store.city].filter(Boolean).join(' · ')}
          </p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
            {hasRating && (
              <span className="inline-flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-[#D9962B] text-[#D9962B]" aria-hidden />
                <span className="font-bold text-foreground">{rating.toFixed(1)}</span>
                <span>({store.sellerProfile.totalRatings})</span>
              </span>
            )}
            {typeof productCount === 'number' && (
              <span className="inline-flex items-center gap-1">
                <Package className="h-3.5 w-3.5" aria-hidden />
                {productCount.toLocaleString('ar')} منتج
              </span>
            )}
            {typeof followerCount === 'number' && (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" aria-hidden />
                {followerCount >= 1000
                  ? `${(followerCount / 1000).toFixed(followerCount % 1000 === 0 ? 0 : 1)}k`
                  : followerCount.toLocaleString('ar')}{' '}
                متابع
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-3 flex items-center gap-2 px-0.5">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-9 flex-1 rounded-xl border-primary/20 bg-background font-bold text-primary hover:bg-primary/5"
          >
            <Link href={ROUTES.storeDetail(store.id)} prefetch={false}>
              زيارة المتجر
            </Link>
          </Button>
          {showHeart && (
            <FavoriteButton
              entityType="STORE"
              entityId={store.id}
              returnTo={ROUTES.storeDetail(store.id)}
              variant="card"
              className={cn(
                'relative static h-9 w-9 shrink-0 rounded-xl border border-border/80 bg-background',
                HIT_AREA,
              )}
            />
          )}
        </div>
      </div>
    </article>
  );
});
