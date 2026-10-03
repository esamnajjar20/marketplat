'use client';

import Link from 'next/link';
import { Store } from 'lucide-react';
import { useStoreTypes } from '@/hooks/queries/useStoreTypes';
import { ROUTES } from '@/lib/constants';

export function StoreTypesRow() {
  const { data: storeTypes = [], isLoading } = useStoreTypes();
  const visibleTypes = storeTypes.filter((type) => type.hasActiveStores);

  if (isLoading || visibleTypes.length === 0) return null;

  return (
    <section className="space-y-2" aria-label="أنواع المتاجر">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">تصفح حسب نوع المتجر</h2>
        <Link href={ROUTES.stores} className="text-xs text-primary hover:underline">
          كل المتاجر
        </Link>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1" role="list">
        {visibleTypes.map((type) => (
          <Link
            key={type.id}
            href={`${ROUTES.stores}?type=${encodeURIComponent(type.slug)}`}
            className="flex min-w-max items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
            role="listitem"
          >
            <Store className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span>{type.nameAr}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
