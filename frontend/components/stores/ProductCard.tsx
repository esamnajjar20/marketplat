import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
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
 * Product card — aligned with AdCard hierarchy:
 * image + badges → price-first → title → city → store footer (logo/name/time).
 */
export function ProductCard({ product, className, priority = false }: Props) {
  const rawImage = product.images[0];
  const thumb = rawImage ? getListThumbnailUrl(rawImage, 400, 280) : PLACEHOLDER_SVG;
  const blurDataURL = rawImage && isCloudinaryUrl(rawImage) ? getPlaceholderUrl(rawImage) : undefined;
  const { discountPrice, discountPercentage, hasActivePromotion } = product.effectivePrice;
  const hasDiscount = discountPrice !== null;
  const outOfStock = product.availability === 'OUT_OF_STOCK';

  const ageHours = (Date.now() - new Date(product.createdAt).getTime()) / 3_600_000;
  const timeColorClass =
    ageHours < 24 ? 'text-success' : ageHours < 24 * 7 ? 'text-warning' : 'text-muted-foreground';

  const storeLogo = getAvatarUrl(product.store.logoUrl ?? '', 32);

  return (
    <div className="relative">
      <Link
        href={ROUTES.productDetail(product.id)}
        className={cn(
          'group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
          className,
        )}
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          <SafeImage
            src={thumb}
            alt={product.name}
            fill
            className={cn(
              'object-cover transition-transform duration-300 group-hover:scale-[1.04]',
              outOfStock && 'opacity-60',
            )}
            sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 25vw"
            priority={priority}
            loading={priority ? undefined : 'lazy'}
            {...(blurDataURL && { placeholder: 'blur' as const, blurDataURL })}
          />

          {/* Top-start: promo badge */}
          <div className="absolute top-2 start-2 flex flex-col items-start gap-1">
            {hasActivePromotion && discountPercentage !== null && (
              <span className="rounded-full bg-destructive px-2.5 py-0.5 text-[10px] font-bold text-destructive-foreground backdrop-blur-sm">
                🔥 خصم {discountPercentage}%
              </span>
            )}
          </div>

          {/* Top-end: availability (when not in stock) */}
          {product.availability !== 'IN_STOCK' && (
            <span className="absolute top-2 end-2 flex items-center gap-1 rounded-full bg-foreground/70 px-2.5 py-0.5 text-[10px] font-medium text-background backdrop-blur-sm">
              {product.availability === 'OUT_OF_STOCK' ? (
                <PackageX className="h-3 w-3" aria-hidden />
              ) : (
                <Clock3 className="h-3 w-3" aria-hidden />
              )}
              {AVAILABILITY_LABEL[product.availability]}
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1.5 p-4">
          {/* Price first — same hierarchy as AdCard */}
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={cn(
                'font-mono text-xl font-bold tabular-nums',
                outOfStock ? 'text-muted-foreground line-through' : 'text-primary',
              )}
            >
              {formatPrice(hasDiscount ? discountPrice : product.price)}
            </p>
            {hasDiscount && (
              <p className="font-mono text-xs text-muted-foreground line-through">
                {formatPrice(product.price)}
              </p>
            )}
          </div>

          <h3 className="line-clamp-2 min-h-0 flex-1 text-lg leading-snug text-foreground">
            {product.name}
          </h3>

          {product.wholesalePrice && product.wholesaleMinQty && (
            <p className="text-[11px] text-muted-foreground">
              {formatPrice(product.wholesalePrice)} عند شراء {product.wholesaleMinQty}+
            </p>
          )}

          <div className="mt-auto flex flex-col gap-1.5 pt-2">
            {product.store.city && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{product.store.city}</span>
              </span>
            )}

            <div className="flex min-w-0 items-center gap-1.5">
              <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full bg-muted">
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
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
                متجر
              </span>
              <span className={cn('shrink-0 whitespace-nowrap text-[10px] tabular-nums', timeColorClass)}>
                {formatRelativeTime(product.createdAt)}
              </span>
            </div>
          </div>
        </div>
      </Link>

      {/* Sibling of <Link> — same pattern as AdCard FIX P1-1 */}
      <FavoriteButton
        entityType="PRODUCT"
        entityId={product.id}
        size="sm"
        className="absolute top-2 end-2"
      />
    </div>
  );
}
