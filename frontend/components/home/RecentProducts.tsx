'use client';

import Link from 'next/link';
import { PackageSearch } from 'lucide-react';
import { ProductCard } from '@/components/stores/ProductCard';
import { ProductCardSkeleton } from '@/components/shared/skeletons';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { Button } from '@/components/shared/ui/Button';
import { useProducts } from '@/hooks/queries/useProducts';
import { ROUTES } from '@/lib/constants';

const DISPLAY_COUNT = 8;

/**
 * Plan §5: "أحدث المنتجات" home rail. Mirrors RecentAds.tsx's shape
 * exactly (same skeleton count, same EmptyState pattern) but simpler —
 * no isFeatured concept exists yet (plan §17 explicitly defers that),
 * so this is createdAt DESC only, same as RecentAds.
 */
export function RecentProducts() {
  const { data, isLoading } = useProducts({ limit: DISPLAY_COUNT, sortBy: 'createdAt', sortOrder: 'desc' });
  const items = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: DISPLAY_COUNT }).map((_, i) => <ProductCardSkeleton key={i} />)}
      </div>
    );
  }

  // Plan §14: hide the whole section rather than show it empty — Home
  // itself decides whether to render RecentProducts at all based on
  // this same emptiness (see RecentProductsSection wrapper).
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<PackageSearch className="h-8 w-8" />}
        title="لا توجد منتجات بعد"
        description="لم يقم أي متجر بإضافة منتجات حتى الآن"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 stagger-fade-in">
        {items.map((product) => (
          <ProductCard key={product.id} product={product} storeId={product.storeId} />
        ))}
      </div>
      <div className="flex justify-center">
        <Link href={ROUTES.products}>
          <Button variant="outline">عرض جميع المنتجات</Button>
        </Link>
      </div>
    </div>
  );
}
