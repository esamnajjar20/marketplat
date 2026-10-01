'use client';

import { useMemo } from 'react';
import { Sparkle } from 'lucide-react';
import { ProductCard } from '@/components/stores/ProductCard';
import { ProductCardSkeleton } from '@/components/shared/skeletons';
import { RecommendationRail } from './RecommendationRail';
import { useProductRecommendations } from '@/hooks/queries/useRecommendations';

const DISPLAY_COUNT = 8;

interface Props {
  /** Excludes the product currently in view. */
  excludeProductId?: string;
  /**
   * When set (product detail page), hide products from the same store so this
   * rail does not duplicate "منتجات من نفس المتجر".
   */
  excludeStoreId?: string;
}

/**
 * "منتجات قد تعجبك" — category / personalized recommendations.
 * On product detail, pass excludeStoreId so same-store items stay only in
 * the dedicated "منتجات من نفس المتجر" section.
 */
export function ProductRecommendations({ excludeProductId, excludeStoreId }: Props) {
  const { data, isLoading, isError, refetch } = useProductRecommendations(
    { limit: DISPLAY_COUNT + 6, excludeProductId },
    { enabled: Boolean(excludeProductId) },
  );

  const items = useMemo(() => {
    const list = data ?? [];
    const filtered = excludeStoreId
      ? list.filter((p) => p.storeId !== excludeStoreId)
      : list;
    return filtered.slice(0, DISPLAY_COUNT);
  }, [data, excludeStoreId]);

  if (!excludeProductId) return null;

  return (
    <RecommendationRail
      title="منتجات قد تعجبك"
      icon={<Sparkle className="h-4 w-4 text-muted-foreground" />}
      items={items}
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
