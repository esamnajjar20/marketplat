'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { memo, useState } from 'react';
import { Heart, Clock3, MapPin, Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { ROUTES, CONDITION_LABELS } from '@/lib/constants';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { getListThumbnailUrl, getPlaceholderUrl, isCloudinaryUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { useIsFavorited } from '@/hooks/queries/useFavorites';
import { useToggleFavorite } from '@/hooks/mutations/useFavoriteMutations';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { toast } from 'sonner';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import type { AdListItem } from '@/types/ad.types';
import { cn } from '@/lib/utils';
import { signalNavigationStart } from '@/components/shared/NavigationProgress';
import { CardKindBadge, CardOfflineBadgeView, type CardContext, useNowAfterMount } from '@/components/shared/cards/cardParts';
import {
  CARD_BODY_COMPACT,
  CARD_BODY_DEFAULT,
  CARD_FOCUS,
  CARD_HOVER,
  CARD_IMAGE_HOVER,
  CARD_HEART_BUTTON_BASE,
  CARD_HEART_BUTTON_BG,
  CARD_HEART_ICON_FILLED,
  CARD_HEART_ICON_OUTLINE,
  CARD_IMAGE_43,
  CARD_IMAGE_SHADE,
  CARD_META_ITEM,
  CARD_PRICE_ROW,
  CARD_MAX_BADGES,
  CARD_PRESS,
  CARD_PRICE_UNSET,
  CARD_SHELL,
  CARD_TITLE_GRID,
  HIT_AREA,
  TIME_PLACEHOLDER,
  freshnessClass,
} from '@/components/shared/cards/cardTokens';

interface Props {
  ad: AdListItem;
  context?: CardContext;
  className?: string;
  priority?: boolean;
  density?: 'default' | 'compact';
  showKind?: boolean;
  /** When true (default on browse grid), use the soft design-mockup card. */
  designLayout?: boolean;
}

const PASTEL_BGS = ['bg-[#E8F1EC]', 'bg-[#F6E7DB]', 'bg-[#EFEADF]', 'bg-[#E3EEF5]', 'bg-[#FBF0D9]', 'bg-[#F6F1E7]'] as const;

function pastelForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * (i + 1)) % PASTEL_BGS.length;
  return PASTEL_BGS[h] ?? PASTEL_BGS[0];
}

function sellerInitial(name: string): string {
  const t = name.trim();
  if (!t) return 'م';
  return t.charAt(0);
}

export const AdCard = memo(function AdCard({
  ad,
  context = 'public',
  className,
  priority = false,
  density = 'default',
  showKind = false,
  designLayout,
}: Props) {
  const compact = density === 'compact';
  const useDesign = designLayout !== false && (context === 'public' || context === 'catalog') && !compact;
  const router = useRouter();
  const detailHref = ROUTES.adDetail(ad.id);
  const rawImage = ad.images?.[0];
  const thumb = rawImage ? getListThumbnailUrl(rawImage, 320, 240) : PLACEHOLDER_SVG;
  const blurDataURL = rawImage && isCloudinaryUrl(rawImage) ? getPlaceholderUrl(rawImage) : undefined;
  const isSold = ad.status === 'SOLD';
  const showTime = context === 'public' || context === 'favorites' || context === 'featured' || context === 'owner';
  const now = useNowAfterMount(showTime, ad.createdAt);
  const timeColorClass = freshnessClass(now, ad.createdAt);
  const isAuth = useAuthStore(selectIsAuthenticated);
  const isOnline = useOnlineStatus();
  const isFavorited = useIsFavorited(ad.id);
  const toggleFavorite = useToggleFavorite();
  const [popKey, setPopKey] = useState(0);
  const showCity = context !== 'store' && context !== 'owner' && !useDesign;
  const showSeller = context === 'favorites' || context === 'catalog' || useDesign;
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
        className="inline-flex h-6 items-center rounded-full bg-[#FBEEE6] px-2.5 text-[11px] font-bold text-[#8F3F14]"
      >
        مميز
      </span>,
    );
  }
  if (ad.condition && useDesign) {
    const isNew = ad.condition === 'NEW';
    badges.push(
      <span
        key="cond"
        className={cn(
          'inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-bold',
          isNew ? 'bg-[#E8F1EC] text-[#1F4D33]' : 'bg-[#F6F1E7] text-[#4A433A]',
        )}
      >
        {CONDITION_LABELS[ad.condition] ?? ad.condition}
      </span>,
    );
  } else if (ad.condition) {
    badges.push(
      <Badge key="cond" size="xs" variant={ad.condition === 'NEW' ? 'overlay-success' : 'overlay'}>
        {CONDITION_LABELS[ad.condition] ?? ad.condition}
      </Badge>,
    );
  }
  const visibleBadges = badges.slice(0, CARD_MAX_BADGES);

  const priceNode =
    ad.price == null ? CARD_PRICE_UNSET : formatPrice(ad.price);

  if (useDesign) {
    return (
      <article
        className={cn(
          'group relative h-full min-w-0 [content-visibility:auto] [contain-intrinsic-size:auto_280px]',
          className,
        )}
      >
        <Link
          href={detailHref}
          prefetch={false}
          className={cn(
            CARD_SHELL,
            'group/card flex flex-col',
            CARD_HOVER,
            CARD_FOCUS,
            CARD_PRESS,
            ad.isFeatured && !isSold && 'border-accent/40',
          )}
        >
          <div
            className={cn(
              cn(CARD_IMAGE_43, 'flex items-center justify-center'),
              !rawImage && pastelForId(ad.id),
              rawImage && 'bg-muted',
            )}
          >
            {rawImage ? (
              <SafeImage
                src={thumb}
                alt={ad.title}
                fill
                className={cn('object-cover', CARD_IMAGE_HOVER, isSold && 'opacity-60')}
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                priority={priority}
                loading={priority ? undefined : 'lazy'}
                {...(blurDataURL && { placeholder: 'blur' as const, blurDataURL })}
              />
            ) : (
              <Package className="h-8 w-8 text-primary/50" aria-hidden />
            )}
            <CardOfflineBadgeView isOnline={isOnline} />
            {isSold && (
              <div className="absolute inset-0 z-[1] flex items-center justify-center bg-foreground/45">
                <span className="rounded-full bg-background/95 px-3 py-1 text-sm font-bold">مباع</span>
              </div>
            )}
            <div className="absolute start-2 top-2 z-10 flex max-w-[calc(100%-3.5rem)] flex-col items-start gap-1">
              {visibleBadges}
            </div>
          </div>
          <div className={cn(CARD_BODY_DEFAULT, 'gap-1')}>
            <h3 title={ad.title} className={cn(CARD_TITLE_GRID, 'break-words')}>
              {ad.title}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                dir="ltr"
                className={cn(
                  'text-sm font-extrabold tabular-nums tracking-tight text-primary',
                  isSold && 'text-muted-foreground line-through',
                  ad.price == null && 'text-muted-foreground text-xs font-bold',
                )}
              >
                {priceNode}
              </span>
              {ad.isNegotiable && !isSold && (
                <span className="text-[10px] font-semibold text-muted-foreground">قابل للتفاوض</span>
              )}
            </div>
            {showSeller && (
              <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#E8F1EC] text-[9px] font-extrabold text-[#1F4D33]"
                  aria-hidden
                >
                  {sellerInitial(sellerName)}
                </span>
                <span className="truncate">{sellerName}</span>
              </span>
            )}
          </div>
        </Link>
        {showHeart && (
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
        )}
      </article>
    );
  }

  return (
    <article
      className={cn(
        'group relative h-full min-w-0 [content-visibility:auto] [contain-intrinsic-size:auto_320px]',
        className,
      )}
    >
      <Link
        href={detailHref}
        prefetch={false}
        className={cn(
          CARD_SHELL,
          'group/card flex flex-col',
          CARD_HOVER,
          CARD_FOCUS,
          CARD_PRESS,
          ad.isFeatured && !isSold && 'border-accent/40',
        )}
      >
        <div className={CARD_IMAGE_43}>
          <SafeImage
            src={thumb}
            alt={ad.title}
            fill
            className={cn('object-cover', CARD_IMAGE_HOVER, isSold && 'opacity-60')}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            priority={priority}
            loading={priority ? undefined : 'lazy'}
            {...(blurDataURL && { placeholder: 'blur' as const, blurDataURL })}
          />
          <div className={CARD_IMAGE_SHADE} aria-hidden />
          <CardOfflineBadgeView isOnline={isOnline} />
          {isSold && (
            <div className="absolute inset-0 z-[1] flex items-center justify-center bg-foreground/45">
              <span className="rounded-full bg-background/95 px-3 py-1 text-sm font-bold">مباع</span>
            </div>
          )}
          <div className="absolute start-2 top-2 z-10 flex max-w-[calc(100%-3.75rem)] flex-col items-start gap-1">
            {visibleBadges}
          </div>
        </div>
        <div className={compact ? CARD_BODY_COMPACT : CARD_BODY_DEFAULT}>
          <div className={CARD_PRICE_ROW}>
            <span
              dir="ltr"
              className={cn(
                'font-mono font-bold tabular-nums tracking-tight',
                compact ? 'text-base' : 'text-lg',
                isSold ? 'text-muted-foreground line-through' : ad.price == null ? 'text-muted-foreground text-sm' : 'text-primary',
              )}
            >
              {priceNode}
            </span>
            {ad.isNegotiable && !isSold && (
              <Badge size="xs" variant="soft">
                قابل للتفاوض
              </Badge>
            )}
          </div>
          <h3 title={ad.title} className="line-clamp-2 min-h-[2.6em] text-sm font-bold leading-6 text-foreground">
            {ad.title}
          </h3>
          <div className="mt-auto flex min-h-6 flex-wrap items-center gap-1.5 border-t border-border/50 pt-2 text-xs text-muted-foreground">
            {showCity && ad.city && (
              <span className={CARD_META_ITEM}>
                <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{ad.city}</span>
              </span>
            )}
            {showSeller && (
              <span className={CARD_META_ITEM}>
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-extrabold text-primary"
                  aria-hidden
                >
                  {sellerInitial(sellerName)}
                </span>
                <span className="truncate">{sellerName}</span>
              </span>
            )}
            {showTime && now !== null && (
              <span className={cn(CARD_META_ITEM, 'ms-auto shrink-0 whitespace-nowrap tabular-nums', timeColorClass)}>
                <Clock3 className="h-3 w-3" aria-hidden />
                {formatRelativeTime(ad.createdAt, now)}
              </span>
            )}
            {showTime && now === null && (
              <span className={cn(CARD_META_ITEM, 'ms-auto shrink-0')}>
                <Clock3 className="h-3 w-3" aria-hidden />
                {TIME_PLACEHOLDER}
              </span>
            )}
          </div>
        </div>
      </Link>
      {showHeart && (
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
      )}
    </article>
  );
});
