'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { onIntentPrefetch } from '@/lib/prefetchOnIntent';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Badge } from '@/components/ui/badge';
import { PackageX, Clock3, MapPin } from 'lucide-react';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { ROUTES } from '@/lib/constants';
import {
  getListThumbnailUrl,
  getPlaceholderUrl,
  isCloudinaryUrl,
  PLACEHOLDER_SVG,
  getAvatarUrl,
} from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import type { ProductAvailability, ProductWithStore } from '@/types/product.types';

interface Props {
  product: ProductWithStore;
  /** @deprecated Detail links use product.id; kept optional for existing callers. */
  storeId?: string;
  className?: string;
  /** Same as AdCard: pass for above-the-fold cards to improve LCP. */
  priority?: boolean;
}

const AVAILABILITY_LABEL: Record<ProductAvailability, string> = {
  IN_STOCK: 'متوفر',
  LIMITED: 'كمية محدودة',
  OUT_OF_STOCK: 'غير متوفر',
};

/**
 * Product card — unified Badge + typography scale (Phase 3+).
 */
export function ProductCard({ product, className, priority = false }: Props) {
  const router = useRouter();
  const detailHref = ROUTES.productDetail(product.id);
  function warmDetail() {
    onIntentPrefetch(`product:${product.id}`, () => {
      router.prefetch(detailHref);
    });
  }

  const rawImage = product.images?.[0];
  const thumb = rawImage ? getListThumbnailUrl(rawImage, 320, 224) : PLACEHOLDER_SVG;
  const blurDataURL =
    rawImage && isCloudinaryUrl(rawImage) ? getPlaceholderUrl(rawImage) : undefined;

  const rawPrice = Number(product.price ?? 0);
  const rawDiscount =
    product.discountPrice != null ? Number(product.discountPrice) : null;
  const effectivePrice = product.effectivePrice ?? {
    price: rawPrice,
    originalPrice: rawPrice,
    discountPrice: rawDiscount,
    discountPercentage:
      rawDiscount != null && rawPrice > 0
        ? Math.round(((rawPrice - rawDiscount) / rawPrice) * 100)
        : null,
    hasActivePromotion: false,
  };
  const { discountPrice, discountPercentage, hasActivePromotion } = effectivePrice;
  const hasDiscount = discountPrice !== null;
  const outOfStock = product.availability === 'OUT_OF_STOCK';

  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  const ageHours =
    now === null
      ? Infinity
      : (now - new Date(product.createdAt).getTime()) / 3_600_000;
  const timeColorClass =
    ageHours < 24
      ? 'text-success'
      : ageHours < 24 * 7
        ? 'text-warning'
        : 'text-muted-foreground';

  const storeLogo = getAvatarUrl(product.store?.logoUrl ?? '', 32);

  return (
    <div
      className={cn(
        'group/card relative isolate z-0 h-full',
        'transition-transform duration-200 ease-out',
        'hover:z-10 hover:-translate-y-0.5',
      )}
    >
      <Link
        href={detailHref}
        prefetch={false}
        onPointerEnter={warmDetail}
        onFocus={warmDetail}
        className={cn(
          'flex h-full flex-col overflow-hidden rounded-2xl border bg-card',
          'shadow-sm transition-[box-shadow,border-color] duration-200',
          'active:scale-[0.98]',
          'group-hover/card:border-primary/30 group-hover/card:shadow-md',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          hasActivePromotion && !outOfStock
            ? 'border-destructive/30'
            : 'border-border/80',
          className,
        )}
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          <SafeImage
            src={thumb}
            alt={product.name}
            fill
            className={cn(
              'object-cover transition-transform duration-400 ease-out group-hover/card:scale-[1.04]',
              outOfStock && 'opacity-55',
            )}
            sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 25vw"
            priority={priority}
            loading={priority ? undefined : 'lazy'}
            {...(blurDataURL && { placeholder: 'blur' as const, blurDataURL })}
          />

          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/20 to-transparent"
            aria-hidden
          />

          <div className="absolute top-2 start-2 z-[1] flex max-w-[70%] flex-col items-start gap-1">
            {hasActivePromotion && discountPercentage !== null && (
              <Badge size="xs" variant="destructive">
                خصم {discountPercentage}%
              </Badge>
            )}
            {product.availability !== 'IN_STOCK' && (
              <Badge size="xs" variant="overlay" className="gap-1">
                {product.availability === 'OUT_OF_STOCK' ? (
                  <PackageX className="h-3 w-3" aria-hidden />
                ) : (
                  <Clock3 className="h-3 w-3" aria-hidden />
                )}
                {AVAILABILITY_LABEL[product.availability]}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-3.5">
          <div className="flex flex-wrap items-baseline gap-2">
            <p
              className={cn(
                'font-mono text-lg font-bold tabular-nums tracking-tight sm:text-xl',
                outOfStock ? 'text-muted-foreground line-through' : 'text-primary',
              )}
            >
              {formatPrice(hasDiscount && discountPrice != null ? discountPrice : product.price)}
            </p>
            {hasDiscount && (
              <p className="font-mono text-xs text-muted-foreground line-through">
                {formatPrice(product.price)}
              </p>
            )}
          </div>

          <h3 className="line-clamp-2 min-h-0 flex-1 text-sm font-medium leading-snug text-foreground sm:text-card-title">
            {product.name}
          </h3>

          {product.wholesalePrice && product.wholesaleMinQty && (
            <p className="text-2xs text-muted-foreground sm:text-xs">
              {formatPrice(product.wholesalePrice)} عند شراء {product.wholesaleMinQty}+
            </p>
          )}

          <div className="mt-auto flex flex-col gap-1.5 border-t border-border/40 pt-2">
            {product.store.city && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                <span className="truncate">{product.store.city}</span>
              </span>
            )}

            <div className="flex min-w-0 items-center gap-1.5">
              <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border/60">
                <SafeImage
                  variant="avatar"
                  src={storeLogo}
                  alt={product.store.name}
                  fill
                  className="object-cover"
                  sizes="20px"
                />
              </div>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {product.store.name}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <Badge size="sm" variant="secondary">
                متجر
              </Badge>
              <span
                className={cn(
                  'shrink-0 whitespace-nowrap text-2xs font-medium tabular-nums',
                  timeColorClass,
                )}
              >
                {now === null ? '—' : formatRelativeTime(product.createdAt, now)}
              </span>
            </div>
          </div>
        </div>
      </Link>

      <FavoriteButton
        entityType="PRODUCT"
        entityId={product.id}
        size="sm"
        className="absolute top-2 end-2 z-20 !h-9 !w-9 rounded-full bg-background/95 shadow-md backdrop-blur-md ring-1 ring-black/5"
      />
    </div>
  );
}
