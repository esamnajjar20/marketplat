'use client';

import { Sparkle } from 'lucide-react';
import { ProductCard } from '@/components/stores/ProductCard';
import { ProductCardSkeleton } from '@/components/shared/skeletons';
import { RecommendationRail } from './RecommendationRail';
import { useProductRecommendations } from '@/hooks/queries/useRecommendations';

const DISPLAY_COUNT = 8;

interface Props {
  /** Excludes the product currently in view — see StoreProducts.tsx's
   * `?product=` deep link, this app's only "product detail" moment. */
  excludeProductId?: string;
}

/**
 * "منتجات قد تعجبك" — integrated into StoreProducts.tsx's product
 * context (see that file's own comment on why there is no dedicated
 * /products/:id route to attach this to instead). Renders nothing
 * until a product is actually highlighted via `?product=` — see the
 * `enabled` gate below, same reasoning RelatedAds only makes sense
 * once there's a reference ad.
 */
export function ProductRecommendations({ excludeProductId }: Props) {
  const { data, isLoading, isError, refetch } = useProductRecommendations(
    { limit: DISPLAY_COUNT, excludeProductId },
    { enabled: Boolean(excludeProductId) }
  );

  if (!excludeProductId) return null;

  return (
    <RecommendationRail
      title="منتجات قد تعجبك"
      icon={<Sparkle className="h-4 w-4 text-muted-foreground" />}
      items={data}
      isLoading={isLoading}
      isError={isError}
      refetch={refetch}
      getItemKey={(product) => product.id}
      renderItem={(product) => <ProductCard product={product} storeId={product.storeId} />}
      renderSkeleton={() => <ProductCardSkeleton />}
      skeletonCount={DISPLAY_COUNT}
    />
  );
}
