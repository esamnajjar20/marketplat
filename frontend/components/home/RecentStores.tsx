'use client';

import Link from 'next/link';
import { Store as StoreIcon } from 'lucide-react';
import { StoreCard } from '@/components/stores/StoreCard';
import { StoreCardSkeleton } from '@/components/shared/skeletons';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { Button } from '@/components/shared/ui/Button';
import { useStores } from '@/hooks/queries/useStores';
import { ROUTES } from '@/lib/constants';

const DISPLAY_COUNT = 6;

/**
 * Plan §8: "المتاجر" home rail. No Store.isFeatured field exists, so
 * this is newest-first (createdAt DESC) — same reasoning as
 * RecentProducts, and the plan explicitly allows this fallback.
 */
export function RecentStores() {
  const { data, isLoading } = useStores({ limit: DISPLAY_COUNT, sortBy: 'createdAt', sortOrder: 'desc' });
  const items = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: DISPLAY_COUNT }).map((_, i) => <StoreCardSkeleton key={i} />)}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<StoreIcon className="h-8 w-8" />}
        title="لا توجد متاجر بعد"
        description="لم يفتح أي بائع متجراً حتى الآن"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((store) => <StoreCard key={store.id} store={store} />)}
      </div>
      <div className="flex justify-center">
        <Link href={ROUTES.stores}>
          <Button variant="outline">عرض جميع المتاجر</Button>
        </Link>
      </div>
    </div>
  );
}
