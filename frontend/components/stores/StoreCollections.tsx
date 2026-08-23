'use client';

import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { PackageX } from 'lucide-react';
import { usePublicCollections, useCollectionProducts } from '@/hooks/queries/useCollections';
import { getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { formatPrice } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type { StoreCollectionWithCount } from '@/types/collection.types';

interface Props {
  storeId: string;
}

/**
 * COLLECTIONS (P1): public storefront section — one horizontal rail
 * per active collection, each showing its member products. Renders
 * nothing (not even a heading) when the store has no collections,
 * same "supplementary, don't force an empty section" reasoning as
 * StoreBadges — most stores won't have set any up, and an empty
 * "Collections" heading with nothing under it would look broken
 * rather than simply absent.
 */
export function StoreCollections({ storeId }: Props) {
  const { data: collections, isLoading } = usePublicCollections(storeId);

  if (isLoading || !collections || collections.length === 0) return null;

  return (
    <div className="space-y-6">
      {collections.map((collection) => (
        <CollectionRail key={collection.id} storeId={storeId} collection={collection} />
      ))}
    </div>
  );
}

function CollectionRail({
  storeId,
  collection,
}: {
  storeId: string;
  collection: StoreCollectionWithCount;
}) {
  const { data: products, isLoading } = useCollectionProducts(collection.id);

  // A collection with zero visible (ACTIVE) products isn't worth a
  // rail of its own — same reasoning as the parent's empty-state
  // skip, just scoped to one collection instead of the whole section.
  if (!isLoading && (!products || products.length === 0)) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        {collection.imageUrl && (
          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md bg-muted">
            <SafeImage src={getThumbnailUrl(collection.imageUrl, 64, 64)} alt="" fill className="object-cover" sizes="32px" />
          </div>
        )}
        <h3 className="font-bold text-sm">{collection.name}</h3>
        <span className="text-xs text-muted-foreground">({collection._count.products})</span>
      </div>

      {isLoading ? (
        <div className="flex gap-3 overflow-x-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 w-28 shrink-0 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 snap-x snap-mandatory scrollbar-hide">
          {(products ?? []).map((product) => {
            const rawImage = product.images[0];
            const thumb = rawImage ? getThumbnailUrl(rawImage, 200, 200) : PLACEHOLDER_SVG;
            return (
              <Link
                key={product.id}
                href={`/stores/${storeId}?product=${product.id}`}
                className="w-28 shrink-0 snap-start space-y-1.5"
              >
                <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                  <SafeImage
                    src={thumb}
                    alt={product.name}
                    fill
                    className={cn(
                      'object-cover',
                      product.availability === 'OUT_OF_STOCK' && 'opacity-60'
                    )}
                    sizes="112px"
                    loading="lazy"
                  />
                  {product.availability === 'OUT_OF_STOCK' && (
                    <span className="absolute top-1 end-1 flex h-5 w-5 items-center justify-center rounded-full bg-foreground/70 text-background backdrop-blur-sm">
                      <PackageX className="h-3 w-3" />
                    </span>
                  )}
                </div>
                <p className="line-clamp-2 text-xs font-medium leading-snug">{product.name}</p>
                <p className="font-mono text-xs font-bold text-primary">{formatPrice(product.price)}</p>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
