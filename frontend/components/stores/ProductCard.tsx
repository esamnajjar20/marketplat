import Link from 'next/link';
import Image from 'next/image';
import { PackageX, Clock3 } from 'lucide-react';
import { formatPrice } from '@/lib/formatters';
import { getThumbnailUrl, getPlaceholderUrl, isCloudinaryUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import type { Product, ProductAvailability } from '@/types/product.types';

interface Props {
  product: Product;
  storeId: string;
  className?: string;
}

const AVAILABILITY_LABEL: Record<ProductAvailability, string> = {
  IN_STOCK: 'متوفر',
  LIMITED: 'كمية محدودة',
  OUT_OF_STOCK: 'غير متوفر',
};

/**
 * Product card used both on the public store page (its own product
 * grid) and on the owner's my-store products list. There is no public
 * /products/:id detail *page* route yet in this pass — the card links
 * straight to the parent store, same shape as ServiceListingCard does
 * for /services/:id, but scoped here to the store since that's where
 * a shopper actually adds-to-cart-equivalent (contacts the seller).
 */
export function ProductCard({ product, storeId, className }: Props) {
  const rawImage = product.images[0];
  const thumb = rawImage ? getThumbnailUrl(rawImage, 400, 400) : PLACEHOLDER_SVG;
  const blurDataURL = rawImage && isCloudinaryUrl(rawImage) ? getPlaceholderUrl(rawImage) : undefined;
  const hasDiscount = product.discountPrice !== null;

  return (
    <Link
      href={`/stores/${storeId}?product=${product.id}`}
      className={cn(
        'group block overflow-hidden rounded-xl border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg',
        className
      )}
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        <Image
          src={thumb}
          alt={product.name}
          fill
          className={cn(
            'object-cover transition-transform duration-300 group-hover:scale-[1.04]',
            product.availability === 'OUT_OF_STOCK' && 'opacity-60'
          )}
          sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 25vw"
          loading="lazy"
          {...(blurDataURL && { placeholder: 'blur' as const, blurDataURL })}
        />
        {product.availability !== 'IN_STOCK' && (
          <span className="absolute top-2 end-2 flex items-center gap-1 rounded-full bg-foreground/70 px-2.5 py-0.5 text-xs text-background backdrop-blur-sm">
            {product.availability === 'OUT_OF_STOCK' ? (
              <PackageX className="h-3 w-3" />
            ) : (
              <Clock3 className="h-3 w-3" />
            )}
            {AVAILABILITY_LABEL[product.availability]}
          </span>
        )}
      </div>

      <div className="space-y-1 p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{product.name}</h3>
        <div className="flex items-center gap-2">
          <p className="font-mono text-base font-bold text-primary">
            {formatPrice(hasDiscount ? product.discountPrice : product.price)}
          </p>
          {hasDiscount && (
            <p className="font-mono text-xs text-muted-foreground line-through">
              {formatPrice(product.price)}
            </p>
          )}
        </div>
        {product.wholesalePrice && product.wholesaleMinQty && (
          <p className="text-xs text-muted-foreground">
            {formatPrice(product.wholesalePrice)} عند شراء {product.wholesaleMinQty}+
          </p>
        )}
      </div>
    </Link>
  );
}
