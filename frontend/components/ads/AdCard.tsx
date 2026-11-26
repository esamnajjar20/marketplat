'use client';

import { useRouter } from 'next/navigation';
import { memo, useState } from 'react';
import { Heart, Package } from 'lucide-react';
import { ROUTES, CONDITION_LABELS } from '@/lib/constants';
import { formatPrice } from '@/lib/formatters';
import { useIsFavorited } from '@/hooks/queries/useFavorites';
import { useToggleFavorite } from '@/hooks/mutations/useFavoriteMutations';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { toast } from 'sonner';
import type { AdListItem } from '@/types/ad.types';
import { cn } from '@/lib/utils';
import { signalNavigationStart } from '@/components/shared/NavigationProgress';
import { CardKindBadge, type CardContext } from '@/components/shared/cards/cardParts';
import { MarketCard } from '@/components/shared/cards/MarketCard';
import {
  CARD_HEART_BUTTON_BASE,
  CARD_HEART_BUTTON_BG,
  CARD_HEART_ICON_FILLED,
  CARD_HEART_ICON_OUTLINE,
  CARD_MAX_BADGES,
  CARD_PRICE_UNSET,
  HIT_AREA,
} from '@/components/shared/cards/cardTokens';

interface Props {
  ad: AdListItem;
  context?: CardContext;
  className?: string;
  priority?: boolean;
  /** Kept for API compatibility — all densities now share the unified card. */
  density?: 'default' | 'compact';
  showKind?: boolean;
  /** Kept for API compatibility — the unified card is always used. */
  designLayout?: boolean;
}

export const AdCard = memo(function AdCard({
  ad,
  context = 'public',
  className,
  priority = false,
  showKind = false,
}: Props) {
  const router = useRouter();
  const detailHref = ROUTES.adDetail(ad.id);
  const rawImage = ad.images?.[0];
  const isSold = ad.status === 'SOLD';
  const isAuth = useAuthStore(selectIsAuthenticated);
  const isFavorited = useIsFavorited(ad.id);
  const toggleFavorite = useToggleFavorite();
  const [popKey, setPopKey] = useState(0);

  // Same visibility rules as ProductCard / ServiceListingCard (unified).
  const hideOwnerAndPlace = context === 'store' || context === 'owner';
  const showTime = context !== 'related' && context !== 'store';
  const showHeart = context !== 'owner';
  const sellerName = ad.store?.id ? ad.store.name : ad.user.name;

  function handleFavoriteClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuth) {
      toast.error('سجّل الدخول لحفظ الإعلان');
      const destination = `${ROUTES.login}?from=${encodeURIComponent(detailHref)}`;
      signalNavigationStart(destination);
      router.push(destination);
      return;
    }
    if (!isFavorited) setPopKey((k) => k + 1);
    toggleFavorite.mutate(ad.id);
  }

  const badges: React.ReactNode[] = [];
  if (showKind) badges.push(<CardKindBadge key="kind" kind="ad" />);
  if (ad.isFeatured && !isSold) {
    badges.push(
      <span
        key="featured"
        className="inline-flex h-6 items-center rounded-full bg-accent-soft px-2.5 text-2xs-tight font-bold text-accent"
      >
        مميز
      </span>,
    );
  }
  if (ad.condition) {
    const isNew = ad.condition === 'NEW';
    badges.push(
      <span
        key="cond"
        className={cn(
          'inline-flex h-6 items-center rounded-full px-2.5 text-2xs-tight font-bold',
          isNew ? 'bg-primary-soft text-primary' : 'bg-muted text-muted-foreground',
        )}
      >
        {CONDITION_LABELS[ad.condition] ?? ad.condition}
      </span>,
    );
  }

  return (
    <MarketCard
      id={ad.id}
      href={detailHref}
      title={ad.title}
      imageSrc={rawImage}
      placeholderIcon={Package}
      priority={priority}
      badges={badges.slice(0, CARD_MAX_BADGES)}
      dimmed={isSold}
      overlayLabel={isSold ? 'مباع' : undefined}
      accent={ad.isFeatured && !isSold}
      price={ad.price == null ? CARD_PRICE_UNSET : formatPrice(ad.price)}
      priceUnset={ad.price == null}
      priceNote={ad.isNegotiable && !isSold ? 'قابل للتفاوض' : undefined}
      ownerName={hideOwnerAndPlace ? undefined : sellerName}
      city={hideOwnerAndPlace ? undefined : ad.city}
      createdAt={showTime ? ad.createdAt : undefined}
      className={className}
      heart={
        showHeart ? (
          <button
            type="button"
            onClick={handleFavoriteClick}
            disabled={toggleFavorite.isPending}
            aria-label={isFavorited ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
            aria-pressed={isFavorited}
            className={cn(
              CARD_HEART_BUTTON_BASE,
              CARD_HEART_BUTTON_BG,
              'absolute end-2 top-2 z-20 h-11 w-11 touch-manipulation',
              HIT_AREA,
            )}
          >
            <Heart
              key={popKey}
              className={cn(
                'h-4 w-4',
                popKey > 0 && 'motion-safe:animate-heart-pop',
                isFavorited ? CARD_HEART_ICON_FILLED : CARD_HEART_ICON_OUTLINE,
              )}
            />
          </button>
        ) : null
      }
    />
  );
});
