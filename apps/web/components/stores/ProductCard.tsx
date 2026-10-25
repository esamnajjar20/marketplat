'use client';

import { memo } from 'react';
import { Clock3, MapPin, Package } from 'lucide-react';
import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { CardKindBadge, CardOfflineBadge, type CardContext, useNowAfterMount } from '@/components/shared/cards/cardParts';
import {
  CARD_BODY_COMPACT,
  CARD_BODY_DEFAULT,
  CARD_FOCUS,
  CARD_HOVER,
  CARD_IMAGE_HOVER,
  CARD_HEART_POSITION,
  CARD_IMAGE_43,
  CARD_IMAGE_SHADE,
  CARD_META_ITEM,
  CARD_PRICE_ROW,
  CARD_MAX_BADGES,
  CARD_PRESS,
  CARD_PRICE_UNSET,
  CARD_SHELL,
  CARD_TITLE,
  CARD_TITLE_GRID,
  HIT_AREA,
  TIME_PLACEHOLDER,
  freshnessClass,
} from '@/components/shared/cards/cardTokens';
import { Badge } from '@/components/ui/badge';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { ROUTES } from '@/lib/constants';
import { getListThumbnailUrl, getPlaceholderUrl, isCloudinaryUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import type { ProductWithStore } from '@/types/product.types';

interface Props {
  product: ProductWithStore;
  storeId?: string;
  context?: CardContext;
  className?: string;
  priority?: boolean;
  density?: 'default' | 'compact';
  layout?: 'grid' | 'list';
  showKind?: boolean;
  /** يُحتفظ بالخيار للتوافق مع الشبكات المختلطة؛ جميع بطاقات الشبكة أصبحت بنسبة صورة موحّدة 4:3. */
  mixedList?: boolean;
}

/** Soft pastel backgrounds for image area when matching design mockup (catalog grid). */
const PASTEL_BGS = ['bg-[#E8F1EC]', 'bg-[#F6E7DB]', 'bg-[#EFEADF]', 'bg-[#E3EEF5]', 'bg-[#FBF0D9]', 'bg-[#F6F1E7]'] as const;

function pastelForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * (i + 1)) % PASTEL_BGS.length;
  return PASTEL_BGS[h] ?? PASTEL_BGS[0];
}

function storeInitial(name: string): string {
  const t = name.trim();
  if (!t) return 'م';
  return t.charAt(0);
}

export const ProductCard = memo(function ProductCard({
  product,
  context = 'public',
  className,
  priority = false,
  density = 'default',
  layout = 'grid',
  showKind = false,
}: Props) {
  const compact = density === 'compact' || layout === 'list';
  const isCatalogGrid = context === 'catalog' && layout === 'grid';
  const detailHref = ROUTES.productDetail(product.id);
  const rawImage = product.images?.[0];
  const thumb = rawImage ? getListThumbnailUrl(rawImage, 320, 240) : PLACEHOLDER_SVG;
  const blurDataURL = rawImage && isCloudinaryUrl(rawImage) ? getPlaceholderUrl(rawImage) : undefined;
  const outOfStock = product.availability === 'OUT_OF_STOCK';
  const showTime = context === 'public' || context === 'favorites' || context === 'featured' || context === 'owner';
  const now = useNowAfterMount(showTime, product.createdAt);
  const timeColorClass = freshnessClass(now, product.createdAt);
  const showLocation = context !== 'store' && context !== 'owner' && !isCatalogGrid;
  const showStore = context === 'favorites' || context === 'catalog';
  const showHeart = context !== 'owner';
  const effectivePrice =
    product.effectivePrice ?? {
      price: Number(product.price ?? 0),
      originalPrice: Number(product.price ?? 0),
      discountPrice: product.discountPrice != null ? Number(product.discountPrice) : null,
      discountPercentage: null,
      hasActivePromotion: false,
      activePromotionId: null,
    };
  const hasDiscount = effectivePrice.discountPrice !== null;

  // Design mockup tags: متوفر / كمية محدودة / عرض خاص
  const candidates: { order: number; priority: number; node: React.ReactNode }[] = [];
  if (showKind) {
    candidates.push({ order: 0, priority: 4, node: <CardKindBadge key="kind" kind="product" /> });
  }
  if (effectivePrice.hasActivePromotion) {
    candidates.push({
      order: 1,
      priority: 3,
      node: (
        <span
          key="promo"
          className="inline-flex h-6 items-center rounded-full bg-[#FBEEE6] px-2.5 text-[11px] font-bold text-[#8F3F14]"
        >
          عرض خاص
        </span>
      ),
    });
  } else if (effectivePrice.discountPercentage !== null) {
    candidates.push({
      order: 1,
      priority: 2,
      node: (
        <Badge key="discount" size="xs" variant="destructive">
          خصم {effectivePrice.discountPercentage}%
        </Badge>
      ),
    });
  }
  if (product.availability === 'LIMITED') {
    candidates.push({
      order: 2,
      priority: 2,
      node: (
        <span
          key="avail"
          className="inline-flex h-6 items-center rounded-full bg-[#F6F1E7] px-2.5 text-[11px] font-bold text-[#4A433A]"
        >
          كمية محدودة
        </span>
      ),
    });
  } else if (product.availability === 'OUT_OF_STOCK') {
    candidates.push({
      order: 2,
      priority: 5,
      node: (
        <Badge key="avail" size="xs" variant="overlay">
          غير متوفر
        </Badge>
      ),
    });
  } else if (isCatalogGrid) {
    candidates.push({
      order: 2,
      priority: 1,
      node: (
        <span
          key="avail"
          className="inline-flex h-6 items-center rounded-full bg-[#E8F1EC] px-2.5 text-[11px] font-bold text-[#1F4D33]"
        >
          متوفر
        </span>
      ),
    });
  }
  const visibleBadges = [...candidates]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, CARD_MAX_BADGES)
    .sort((a, b) => a.order - b.order)
    .map((c) => c.node);

  const priceValue =
    product.price == null && !hasDiscount
      ? CARD_PRICE_UNSET
      : formatPrice(hasDiscount && effectivePrice.discountPrice != null ? effectivePrice.discountPrice : product.price);

  // ── Catalog grid: design-mockup card (soft image area, store letter, compact) ──
  if (isCatalogGrid) {
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
          )}
        >
          <div
            className={cn(
              cn(CARD_IMAGE_43, 'flex items-center justify-center'),
              !rawImage && pastelForId(product.id),
              rawImage && 'bg-muted',
            )}
          >
            {rawImage ? (
              <SafeImage
                src={thumb}
                alt={product.name}
                fill
                className={cn('object-cover', CARD_IMAGE_HOVER, outOfStock && 'opacity-60')}
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                priority={priority}
                loading={priority ? undefined : 'lazy'}
                {...(blurDataURL && { placeholder: 'blur' as const, blurDataURL })}
              />
            ) : (
              <Package className="h-8 w-8 text-primary/50" aria-hidden />
            )}
            {outOfStock && (
              <div
                className="absolute inset-0 z-[1] flex items-center justify-center bg-foreground/35"
                aria-label="المنتج غير متوفر"
              >
                <span className="rounded-full bg-background/95 px-3 py-1 text-sm font-bold text-foreground">
                  غير متوفر
                </span>
              </div>
            )}
            <CardOfflineBadge />
            <div className="absolute start-2 top-2 z-10 flex max-w-[calc(100%-3.5rem)] flex-col items-start gap-1">
              {visibleBadges}
            </div>
          </div>
          <div className={cn(CARD_BODY_DEFAULT, 'gap-1')}>
            <h3 title={product.name} className={cn(CARD_TITLE_GRID, 'break-words')}>
              {product.name}
            </h3>
            <div className="flex items-baseline gap-1.5">
              <span
                dir="ltr"
                className={cn(
                  'text-sm font-extrabold tabular-nums tracking-tight text-primary',
                  outOfStock && 'text-muted-foreground line-through',
                )}
              >
                {priceValue}
              </span>
              {hasDiscount && (
                <span dir="ltr" className="text-xs text-muted-foreground line-through tabular-nums">
                  {formatPrice(product.price)}
                </span>
              )}
            </div>
            {showStore && (
              <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#E8F1EC] text-[9px] font-extrabold text-[#1F4D33]"
                  aria-hidden
                >
                  {storeInitial(product.store.name)}
                </span>
                <span className="truncate">{product.store.name}</span>
              </span>
            )}
          </div>
        </Link>
        {showHeart && (
          <FavoriteButton
            entityType="PRODUCT"
            entityId={product.id}
            returnTo={detailHref}
            variant="card"
            className={`${CARD_HEART_POSITION} ${HIT_AREA}`}
          />
        )}
      </article>
    );
  }

  // ── Default card (other contexts / list layout) ──
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
          'group/card flex',
          layout === 'list' ? 'flex-row' : 'flex-col',
          CARD_HOVER,
          CARD_FOCUS,
          CARD_PRESS,
        )}
      >
        <div className={cn(CARD_IMAGE_43, layout === 'list' && 'aspect-auto h-24 w-24 shrink-0 sm:h-32 sm:w-40')}>
          <SafeImage
            src={thumb}
            alt={product.name}
            fill
            className={cn('object-cover', CARD_IMAGE_HOVER, outOfStock && 'opacity-60')}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            priority={priority}
            loading={priority ? undefined : 'lazy'}
            {...(blurDataURL && { placeholder: 'blur' as const, blurDataURL })}
          />
          <div className={CARD_IMAGE_SHADE} aria-hidden />
          {outOfStock && (
            <div
              className="absolute inset-0 z-[1] flex items-center justify-center bg-foreground/35"
              aria-label="المنتج غير متوفر"
            >
              <span className="rounded-full bg-background/95 px-3 py-1 text-sm font-bold text-foreground">
                غير متوفر
              </span>
            </div>
          )}
          <CardOfflineBadge />
          <div className="absolute start-2 top-2 z-10 flex max-w-[calc(100%-3.75rem)] flex-col items-start gap-1">
            {visibleBadges}
          </div>
        </div>
        <div className={cn('min-w-0', compact ? CARD_BODY_COMPACT : CARD_BODY_DEFAULT)}>
          <div className={CARD_PRICE_ROW}>
            <span
              dir="ltr"
              className={cn(
                'font-mono font-bold tabular-nums tracking-tight',
                compact ? 'text-base' : 'text-lg',
                outOfStock ? 'text-muted-foreground line-through' : 'text-primary',
              )}
            >
              {priceValue}
            </span>
            {hasDiscount && (
              <span dir="ltr" className="font-mono text-xs text-muted-foreground line-through tabular-nums">
                {formatPrice(product.price)}
              </span>
            )}
          </div>
          <h3 title={product.name} className={cn(layout === 'grid' ? CARD_TITLE_GRID : CARD_TITLE, layout === 'grid' ? 'leading-6' : '')}>
            {product.name}
          </h3>
          {product.wholesalePrice && product.wholesaleMinQty && (
            <p className="text-xs text-muted-foreground" dir="ltr">
              {formatPrice(product.wholesalePrice)} عند شراء {product.wholesaleMinQty}+
            </p>
          )}
          <div className="mt-auto flex min-h-6 flex-wrap items-center gap-1.5 border-t border-border/50 pt-2 text-xs text-muted-foreground">
            {showLocation && product.store.city && (
              <span className={CARD_META_ITEM}>
                <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{product.store.city}</span>
              </span>
            )}
            {showStore && (
              <span className={CARD_META_ITEM}>
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-extrabold text-primary"
                  aria-hidden
                >
                  {storeInitial(product.store.name)}
                </span>
                <span className="truncate">{product.store.name}</span>
              </span>
            )}
            {showTime && now !== null && (
              <span className={cn(CARD_META_ITEM, 'ms-auto shrink-0 whitespace-nowrap tabular-nums', timeColorClass)}>
                <Clock3 className="h-3 w-3" aria-hidden />
                {formatRelativeTime(product.createdAt, now)}
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
        <FavoriteButton
          entityType="PRODUCT"
          entityId={product.id}
          returnTo={detailHref}
          variant="card"
          className={`${CARD_HEART_POSITION} ${HIT_AREA}`}
        />
      )}
    </article>
  );
});
