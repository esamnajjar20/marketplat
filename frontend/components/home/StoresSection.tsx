'use client';

import { Store as StoreIcon } from 'lucide-react';
import { RecentStores } from './RecentStores';
import { useStores } from '@/hooks/queries/useStores';

const DISPLAY_COUNT = 6;

/** Plan §8/§14: same self-hiding-heading pattern as ProductsSection. */
export function StoresSection() {
  const { data, isLoading } = useStores({ limit: DISPLAY_COUNT, sortBy: 'createdAt', sortOrder: 'desc' });

  if (!isLoading && data?.items.length === 0) return null;

  return (
    <section className="container mx-auto space-y-4 px-4 pt-10">
      <div className="flex items-end justify-between gap-3 border-b pb-3">
        <div className="space-y-0.5">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <StoreIcon className="h-3.5 w-3.5" />
            متاجر
          </p>
          <h2 className="text-lg font-bold sm:text-xl">المتاجر</h2>
        </div>
      </div>
      <RecentStores />
    </section>
  );
}
