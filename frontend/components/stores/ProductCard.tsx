import { memo } from 'react';
import { MapPin, Package } from 'lucide-react';
import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { CardKindBadge } from '@/components/shared/cards/cardDisplayParts';
import { CardOfflineBadge } from '@/components/shared/cards/CardOfflineBadge';
import { MarketCard } from '@/components/shared/cards/MarketCard';
import { CardRelativeTime } from '@/components/shared/cards/CardRelativeTime';
import type { CardContext } from '@/components/shared/cards/cardTypes';
import {
  CARD_BODY_COMPACT,
  CARD_BODY_DEFAULT,
  CARD_FOCUS,
  CARD_HOVER,
  CARD_IMAGE_HOVER,
  CARD_IMAGE_LIST,
  CARD_HEART_POSITION,
  CARD_IMAGE_SHADE,
  CARD_META_ITEM,
  CARD_PRICE_ROW,
  CARD_MAX_BADGES,
  CARD_PRESS,
  CARD_PRICE_UNSET,
  CARD_SHELL,
  CARD_TITLE,
  HIT_AREA,
} from '@/components/shared/cards/cardTokens';
import { Badge } from '@/components/shared/ui/Badge';
import { formatPrice } from '@/lib/formatters';
import { ROUTES } from '@/lib/constants';
import { getListThumbnailUrl, getPlaceholderUrl, isCloudinaryUrl } from '@/lib/cloudinary';
import { cardPlaceholderToneForId } from '@/components/shared/cards/cardTokens';
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
  const thumb = rawImage ? getListThumbnailUrl(rawImage, 320, 240) : null;
  const blurDataURL = rawImage && isCloudinaryUrl(rawImage) ? getPlaceholderUrl(rawImage) : undefined;
  const outOfStock = product.availability === 'OUT_OF_STOCK';
  const showTime = context === 'public' || context === 'favorites' || context === 'featured' || context === 'owner';
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
          className="inline-flex h-6 items-center rounded-full bg-accent-soft px-2.5 text-2xs-tight font-bold text-accent"
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
          className="inline-flex h-6 items-center rounded-full bg-muted px-2.5 text-2xs-tight font-bold text-muted-foreground"
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
          className="inline-flex h-6 items-center rounded-full bg-primary-soft px-2.5 text-2xs-tight font-bold text-primary"
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

  // ── Grid (every context): the unified card shared with ads and services ──
  if (layout === 'grid') {
    const hideStoreAndPlace = context === 'store' || context === 'owner';
    return (
      <MarketCard
        id={product.id}
        href={detailHref}
        title={product.name}
        imageSrc={rawImage}
        placeholderIcon={Package}
        priority={priority}
        badges={visibleBadges}
        dimmed={outOfStock}
        overlayLabel={outOfStock ? 'غير متوفر' : undefined}
        price={priceValue}
        priceUnset={product.price == null && !hasDiscount}
        originalPrice={hasDiscount ? formatPrice(product.price) : undefined}
        priceSub={
          product.wholesalePrice && product.wholesaleMinQty
            ? `${formatPrice(product.wholesalePrice)} عند شراء ${product.wholesaleMinQty}+`
            : undefined
        }
        ownerName={hideStoreAndPlace ? undefined : product.store.name}
        city={hideStoreAndPlace ? undefined : product.store.city}
        createdAt={context === 'related' || context === 'store' ? undefined : product.createdAt}
        className={className}
        heart={
          showHeart ? (
            <FavoriteButton
              entityType="PRODUCT"
              entityId={product.id}
              returnTo={detailHref}
              variant="card"
              className={`${CARD_HEART_POSITION} ${HIT_AREA}`}
            />
          ) : null
        }
      />
    );
  }

  // ── List layout (grid is handled above by the unified card) ──
  return (
    <article
      className={cn(
        'group relative h-full min-w-0 [content-visibility:auto] [contain-intrinsic-size:auto_320px]',
        className,
      )}
    >
      <IntentPrefetchLink
        href={detailHref}
        prefetch={false}
        className={cn(
          CARD_SHELL,
          'group/card flex',
          'flex-row',
          CARD_HOVER,
          CARD_FOCUS,
          CARD_PRESS,
        )}
      >
        <div
          data-card-media="list"
          className={cn(
            CARD_IMAGE_LIST,
            'flex items-center justify-center',
            rawImage ? 'bg-muted' : cardPlaceholderToneForId(product.id),
          )}
        >
          {rawImage && thumb ? (
            <>
              <SafeImage
                src={thumb}
                alt={product.name}
                fill
                className={cn('object-cover', CARD_IMAGE_HOVER, outOfStock && 'opacity-60')}
                sizes="(max-width: 640px) 112px, 144px"
                priority={priority}
                loading={priority ? undefined : 'lazy'}
                {...(blurDataURL && { placeholder: 'blur' as const, blurDataURL })}
              />
              <div className={CARD_IMAGE_SHADE} aria-hidden />
            </>
          ) : (
            <Package className="h-8 w-8 text-primary/50" aria-hidden="true" />
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
          <div className="absolute start-2 top-2 z-10 flex max-w-[calc(100%-3.75rem)] flex-col items-start gap-1">
            {visibleBadges}
          </div>
        </div>
        <div className={cn('min-w-0', compact ? CARD_BODY_COMPACT : CARD_BODY_DEFAULT)}>
          <h3 title={product.name} className={CARD_TITLE}>
            {product.name}
          </h3>
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
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-3xs font-extrabold text-primary"
                  aria-hidden
                >
                  {storeInitial(product.store.name)}
                </span>
                <span className="truncate">{product.store.name}</span>
              </span>
            )}
            {showTime && <CardRelativeTime date={product.createdAt} />}
          </div>
        </div>
      </IntentPrefetchLink>
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
