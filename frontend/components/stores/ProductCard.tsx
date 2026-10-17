'use client';

import { memo } from 'react';
import { Clock3, MapPin, Store } from 'lucide-react';
import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { CardKindBadge, CardOfflineBadge, type CardContext, useNowAfterMount } from '@/components/shared/cards/cardParts';
import { CARD_BODY_COMPACT, CARD_BODY_DEFAULT, CARD_FOCUS, CARD_HOVER, CARD_IMAGE_HOVER, CARD_HEART_POSITION, CARD_IMAGE_43, CARD_IMAGE_SHADE, CARD_META_ITEM, CARD_PRICE_ROW, CARD_MAX_BADGES, CARD_PRESS, CARD_PRICE_UNSET, CARD_SHELL, HIT_AREA, TIME_PLACEHOLDER, freshnessClass } from '@/components/shared/cards/cardTokens';
import { Badge } from '@/components/ui/badge';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { ROUTES } from '@/lib/constants';
import { getListThumbnailUrl, getPlaceholderUrl, isCloudinaryUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import type { ProductAvailability, ProductWithStore } from '@/types/product.types';

interface Props { product: ProductWithStore; storeId?: string; context?: CardContext; className?: string; priority?: boolean; density?: 'default' | 'compact'; layout?: 'grid' | 'list'; showKind?: boolean;
  /** يُحتفظ بالخيار للتوافق مع الشبكات المختلطة؛ جميع بطاقات الشبكة أصبحت بنسبة صورة موحّدة 4:3. */
  mixedList?: boolean; }
const AVAILABILITY_LABEL: Record<ProductAvailability, string> = { IN_STOCK: 'متوفر', LIMITED: 'كمية محدودة', OUT_OF_STOCK: 'غير متوفر' };

export const ProductCard = memo(function ProductCard({ product, context = 'public', className, priority = false, density = 'default', layout = 'grid', showKind = false }: Props) {
  const compact = density === 'compact' || layout === 'list';
  const detailHref = ROUTES.productDetail(product.id);
  const rawImage = product.images?.[0];
  const thumb = rawImage ? getListThumbnailUrl(rawImage, 320, 240) : PLACEHOLDER_SVG;
  const blurDataURL = rawImage && isCloudinaryUrl(rawImage) ? getPlaceholderUrl(rawImage) : undefined;
  const outOfStock = product.availability === 'OUT_OF_STOCK';
  const showTime = context === 'public' || context === 'favorites' || context === 'featured' || context === 'owner';
  const now = useNowAfterMount(showTime, product.createdAt);
  const timeColorClass = freshnessClass(now, product.createdAt);
  const showLocation = context !== 'store' && context !== 'owner';
  const showStore = context === 'favorites' || context === 'catalog';
  const showHeart = context !== 'owner';
  const effectivePrice = product.effectivePrice ?? { price: Number(product.price ?? 0), originalPrice: Number(product.price ?? 0), discountPrice: product.discountPrice != null ? Number(product.discountPrice) : null, discountPercentage: null, hasActivePromotion: false, activePromotionId: null };
  const hasDiscount = effectivePrice.discountPrice !== null;

  // القاعدة 8: صفّان كحد أقصى. الأولوية عند الازدحام: النوع > غير متوفر > الخصم > بقية الحالات
  const candidates: { order: number; priority: number; node: React.ReactNode }[] = [];
  if (showKind) candidates.push({ order: 0, priority: 4, node: <CardKindBadge key="kind" kind="product" /> });
  if (effectivePrice.hasActivePromotion && effectivePrice.discountPercentage !== null) candidates.push({ order: 1, priority: 2, node: <Badge key="discount" size="xs" variant="destructive">خصم {effectivePrice.discountPercentage}%</Badge> });
  if (product.availability !== 'IN_STOCK') candidates.push({ order: 2, priority: outOfStock ? 5 : 1, node: <Badge key="avail" size="xs" variant="overlay">{AVAILABILITY_LABEL[product.availability]}</Badge> });
  const visibleBadges = [...candidates].sort((a, b) => b.priority - a.priority).slice(0, CARD_MAX_BADGES).sort((a, b) => a.order - b.order).map((c) => c.node);

  return (
    <article className={cn('group relative h-full min-w-0 [content-visibility:auto] [contain-intrinsic-size:auto_320px]', className)}>
      <Link href={detailHref} prefetch={false} className={cn(CARD_SHELL, 'group/card flex', layout === 'list' ? 'flex-row' : 'flex-col', CARD_HOVER, CARD_FOCUS, CARD_PRESS)}>
        <div className={cn(CARD_IMAGE_43, layout === 'list' && 'aspect-auto h-24 w-24 shrink-0 sm:h-32 sm:w-40') }>
          <SafeImage src={thumb} alt={product.name} fill className={cn('object-cover', CARD_IMAGE_HOVER, outOfStock && 'opacity-60')} sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" priority={priority} loading={priority ? undefined : 'lazy'} {...(blurDataURL && { placeholder: 'blur' as const, blurDataURL })} />
          <div className={CARD_IMAGE_SHADE} aria-hidden />
          {outOfStock && <div className="absolute inset-0 z-[1] flex items-center justify-center bg-foreground/35" aria-label="المنتج غير متوفر"><span className="rounded-full bg-background/95 px-3 py-1 text-sm font-bold text-foreground">غير متوفر</span></div>}
          <CardOfflineBadge />
          <div className="absolute start-2 top-2 z-10 flex max-w-[calc(100%-3.75rem)] flex-col items-start gap-1">
            {visibleBadges}
          </div>
        </div>
        <div className={cn('min-w-0', compact ? CARD_BODY_COMPACT : CARD_BODY_DEFAULT)}>
          <div className={CARD_PRICE_ROW}><span dir="ltr" className={cn('font-mono font-bold tabular-nums tracking-tight', compact ? 'text-base' : 'text-lg', outOfStock ? 'text-muted-foreground line-through' : 'text-primary')}>{product.price == null && !hasDiscount ? CARD_PRICE_UNSET : formatPrice(hasDiscount && effectivePrice.discountPrice != null ? effectivePrice.discountPrice : product.price)}</span>{hasDiscount && <span dir="ltr" className="font-mono text-xs text-muted-foreground line-through tabular-nums">{formatPrice(product.price)}</span>}</div>
          <h3 title={product.name} className="line-clamp-2 min-h-[2.6em] text-sm font-bold leading-6 text-foreground">{product.name}</h3>
          {product.wholesalePrice && product.wholesaleMinQty && <p className="text-xs text-muted-foreground" dir="ltr">{formatPrice(product.wholesalePrice)} عند شراء {product.wholesaleMinQty}+</p>}
          <div className="mt-auto flex min-h-6 flex-wrap items-center gap-1.5 border-t border-border/50 pt-2 text-xs text-muted-foreground">
            {showLocation && product.store.city && <span className={CARD_META_ITEM}><MapPin className="h-3 w-3 shrink-0" aria-hidden /><span className="truncate">{product.store.city}</span></span>}
            {showStore && <span className={CARD_META_ITEM}><Store className="h-3 w-3 shrink-0" aria-hidden /><span className="truncate">{product.store.name}</span></span>}
            {showTime && now !== null && <span className={cn(CARD_META_ITEM, 'ms-auto shrink-0 whitespace-nowrap tabular-nums', timeColorClass)}><Clock3 className="h-3 w-3" aria-hidden />{formatRelativeTime(product.createdAt, now)}</span>}
            {showTime && now === null && <span className={cn(CARD_META_ITEM, 'ms-auto shrink-0')}><Clock3 className="h-3 w-3" aria-hidden />{TIME_PLACEHOLDER}</span>}
          </div>
        </div>
      </Link>
      {showHeart && <FavoriteButton entityType="PRODUCT" entityId={product.id} returnTo={detailHref} variant="card" className={`${CARD_HEART_POSITION} ${HIT_AREA}`} />}
    </article>
  );
});
