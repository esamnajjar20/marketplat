'use client';

import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { usePublicCollections, useCollectionProducts } from '@/hooks/queries/useCollections';
import { getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { formatPrice } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type { StoreCollectionWithCount } from '@/types/collection.types';

interface Props { storeId: string; }

export function StoreCollections({ storeId }: Props) {
  const { data: collections, isLoading } = usePublicCollections(storeId);
  if (isLoading || !collections || collections.length === 0) return null;
  return <div className="space-y-4">{collections.map((collection) => <StoreCollectionCard key={collection.id} storeId={storeId} collection={collection} />)}</div>;
}

export function StoreCollectionCard({ storeId, collection }: { storeId: string; collection: StoreCollectionWithCount }) {
  const { data: products, isLoading } = useCollectionProducts(collection.id);
  if (!isLoading && (!products || products.length === 0)) return null;
  return (
    <article className="min-w-0 rounded-2xl border border-border/80 bg-card p-3.5 shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-muted"><SafeImage src={collection.imageUrl ? getThumbnailUrl(collection.imageUrl, 96, 96) : PLACEHOLDER_SVG} alt="" fill className="object-cover" sizes="48px" /></div>
        <div className="min-w-0 flex-1"><h3 className="line-clamp-2 text-sm font-bold">{collection.name}</h3>{collection.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{collection.description}</p>}</div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{collection._count.products} منتج</span>
      </div>
      {isLoading ? (
        <div className="mt-3 flex gap-3 overflow-hidden">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="aspect-square w-36 shrink-0 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : (
        <div className="mt-3 flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-hide">
          {(products ?? []).map((product) => {
            const image = product.images[0] ? getThumbnailUrl(product.images[0], 240, 240) : PLACEHOLDER_SVG;
            return (
              <Link key={product.id} href={`/stores/${storeId}?product=${product.id}`} className="group flex w-36 shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-border/70 bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="relative aspect-square overflow-hidden bg-muted"><SafeImage src={image} alt={product.name} fill className={cn('object-cover transition-transform duration-200 group-hover:scale-[1.02]', product.availability === 'OUT_OF_STOCK' && 'opacity-60')} sizes="144px" loading="lazy" />{product.availability === 'OUT_OF_STOCK' && <span className="absolute inset-0 flex items-center justify-center bg-foreground/30 text-xs font-bold text-background">غير متوفر</span>}</div>
                <div className="flex min-h-20 flex-col gap-1 p-2"><h4 className="line-clamp-2 min-h-[2.4em] text-xs font-semibold leading-snug">{product.name}</h4><span dir="ltr" className="mt-auto font-mono text-xs font-bold tabular-nums text-primary">{formatPrice(product.price)}</span></div>
              </Link>
            );
          })}
        </div>
      )}
    </article>
  );
}
