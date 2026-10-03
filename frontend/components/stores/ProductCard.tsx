'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { CardKindBadge, CardOfflineBadge, type CardContext, useNowAfterMount } from '@/components/shared/cards/cardParts';
import { CARD_BODY_COMPACT, CARD_BODY_DEFAULT, CARD_IMAGE_SQUARE, CARD_SHELL, HIT_AREA, TIME_PLACEHOLDER, freshnessClass } from '@/components/shared/cards/cardTokens';
import { Badge } from '@/components/ui/badge';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { ROUTES } from '@/lib/constants';
import { getListThumbnailUrl, getPlaceholderUrl, isCloudinaryUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import type { ProductAvailability, ProductWithStore } from '@/types/product.types';

interface Props { product: ProductWithStore; storeId?: string; context?: CardContext; className?: string; priority?: boolean; density?: 'default' | 'compact'; showKind?: boolean; }
const AVAILABILITY_LABEL: Record<ProductAvailability, string> = { IN_STOCK: 'متوفر', LIMITED: 'كمية محدودة', OUT_OF_STOCK: 'غير متوفر' };

export function ProductCard({ product, context = 'public', className, priority = false, density = 'default', showKind = false }: Props) {
  const compact = density === 'compact';
  const router = useRouter();
  const detailHref = ROUTES.productDetail(product.id);
  const rawImage = product.images?.[0];
  const thumb = rawImage ? getListThumbnailUrl(rawImage, 320, 320) : PLACEHOLDER_SVG;
  const blurDataURL = rawImage && isCloudinaryUrl(rawImage) ? getPlaceholderUrl(rawImage) : undefined;
  const outOfStock = product.availability === 'OUT_OF_STOCK';
  const now = useNowAfterMount();
  const timeColorClass = freshnessClass(now, product.createdAt);
  const showLocation = context !== 'store' && context !== 'owner';
  const showTime = context === 'public' || context === 'favorites' || context === 'featured';
  const showStore = context === 'favorites' || context === 'catalog';
  const showHeart = context !== 'owner';
  const effectivePrice = product.effectivePrice ?? { price: Number(product.price ?? 0), originalPrice: Number(product.price ?? 0), discountPrice: product.discountPrice != null ? Number(product.discountPrice) : null, discountPercentage: null, hasActivePromotion: false, activePromotionId: null };
  const hasDiscount = effectivePrice.discountPrice !== null;
  function warmDetail() { router.prefetch(detailHref); }

  return (
    <article className={cn('group relative h-full min-w-0', className)}>
      <Link href={detailHref} prefetch={false} onPointerEnter={warmDetail} onFocus={warmDetail} className={cn(CARD_SHELL, 'group/card flex flex-col transition-[transform,box-shadow,border-color] duration-200', 'hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md', 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', 'active:scale-[0.99]')}>
        <div className={CARD_IMAGE_SQUARE}>
          <SafeImage src={thumb} alt={product.name} fill className={cn('object-cover transition-transform duration-200 group-hover/card:scale-[1.02]', outOfStock && 'opacity-60')} sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" priority={priority} loading={priority ? undefined : 'lazy'} {...(blurDataURL && { placeholder: 'blur' as const, blurDataURL })} />
          <CardOfflineBadge />
          <div className="absolute start-2 top-2 z-10 flex max-w-[68%] flex-col items-start gap-1">
            {showKind && <CardKindBadge kind="product" />}
            {effectivePrice.hasActivePromotion && effectivePrice.discountPercentage !== null && <Badge size="xs" variant="destructive">خصم {effectivePrice.discountPercentage}%</Badge>}
            {product.availability !== 'IN_STOCK' && <Badge size="xs" variant="overlay">{AVAILABILITY_LABEL[product.availability]}</Badge>}
          </div>
          {showHeart && <FavoriteButton entityType="PRODUCT" entityId={product.id} size="sm" className={`absolute end-2 top-2 z-20 !h-9 !w-9 bg-background/95 shadow-md backdrop-blur ${HIT_AREA}`} />}
        </div>
        <div className={compact ? CARD_BODY_COMPACT : CARD_BODY_DEFAULT}>
          <div className="flex min-h-6 items-baseline gap-2"><span dir="ltr" className={cn('font-mono font-bold tabular-nums tracking-tight', compact ? 'text-base' : 'text-lg', outOfStock ? 'text-muted-foreground line-through' : 'text-primary')}>{formatPrice(hasDiscount && effectivePrice.discountPrice != null ? effectivePrice.discountPrice : product.price)}</span>{hasDiscount && <span dir="ltr" className="font-mono text-xs text-muted-foreground line-through tabular-nums">{formatPrice(product.price)}</span>}</div>
          <h3 className="line-clamp-2 min-h-[2.5em] text-sm font-semibold leading-snug text-foreground">{product.name}</h3>
          {product.wholesalePrice && product.wholesaleMinQty && <p className="text-[11px] text-muted-foreground" dir="ltr">{formatPrice(product.wholesalePrice)} عند شراء {product.wholesaleMinQty}+</p>}
          <div className="mt-auto flex min-h-5 items-center gap-2 border-t border-border/40 pt-2 text-xs text-muted-foreground">
            {showLocation && product.store.city && <span className="truncate">{product.store.city}</span>}
            {showStore && <span className="truncate">{product.store.name}</span>}
            {showTime && now !== null && <span className={cn('ms-auto shrink-0 whitespace-nowrap tabular-nums', timeColorClass)}>{formatRelativeTime(product.createdAt, now)}</span>}
            {showTime && now === null && <span className="ms-auto shrink-0">{TIME_PLACEHOLDER}</span>}
          </div>
        </div>
      </Link>
    </article>
  );
}
