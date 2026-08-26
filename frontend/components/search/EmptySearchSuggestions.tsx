'use client';

import Link from 'next/link';
import { useCategories } from '@/hooks/queries/useCategories';
import { ROUTES } from '@/lib/constants';
import { Skeleton } from '@/components/shared/ui/Skeleton';

/**
 * Shown under zero-result empty states: top-level categories as escape hatches.
 */
export function EmptySearchSuggestions() {
  const { data: categories, isLoading } = useCategories();
  const top = (categories ?? []).filter((c) => !c.parentId).slice(0, 8);

  if (isLoading) {
    return (
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
    );
  }

  if (top.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs text-muted-foreground">تصفّح التصنيفات الشائعة</p>
      <div className="flex flex-wrap justify-center gap-2">
        {top.map((cat) => (
          <Link
            key={cat.id}
            href={ROUTES.category(cat.slug)}
            className="rounded-full border bg-card px-3 py-1.5 text-xs font-medium hover:border-primary/40 hover:bg-primary/5 min-h-[36px] inline-flex items-center"
          >
            {cat.nameAr}
          </Link>
        ))}
      </div>
    </div>
  );
}
