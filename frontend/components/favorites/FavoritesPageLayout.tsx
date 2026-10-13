'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ListChecks } from 'lucide-react';
import { FavoriteListsSidebar } from '@/components/favorites/FavoriteListsSidebar';
import { FavoritesTabs } from '@/components/profile/FavoritesTabs';
import { useFavoriteLists } from '@/hooks/queries/useFavoriteLists';

function ActiveListBanner() {
  const sp = useSearchParams();
  const listId = sp.get('list');
  const { data: lists } = useFavoriteLists();
  if (!listId || !lists) return null;
  const list = lists.find((l) => l.id === listId);
  if (!list) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-primary/20 bg-primary/[0.06] px-3.5 py-2.5 text-sm"
      role="status"
    >
      <ListChecks className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="font-medium text-foreground">القائمة الحالية: {list.name}</span>
      <span className="text-muted-foreground">({list.itemsCount} عنصر)</span>
    </div>
  );
}

export function FavoritesPageLayout() {
  return (
    <div className="space-y-4 sm:space-y-5">
      <Suspense>
        <ActiveListBanner />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        <Suspense>
          <FavoriteListsSidebar />
        </Suspense>
        <section
          className="min-w-0 rounded-2xl border border-border/70 bg-surface-1/70 p-3 shadow-sm sm:p-4 lg:p-5"
          aria-label="محتوى المفضلة"
        >
          <Suspense>
            <FavoritesTabs />
          </Suspense>
        </section>
      </div>
    </div>
  );
}
