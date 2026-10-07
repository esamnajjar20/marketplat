'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Heart, ListChecks } from 'lucide-react';
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
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--radius-card)] border border-primary/20 bg-primary/[0.06] shadow-xs px-3.5 py-3 text-sm" role="status">
      <ListChecks className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="font-medium text-foreground">القائمة الحالية: {list.name}</span>
      <span className="text-muted-foreground">({list.itemsCount} عنصر)</span>
    </div>
  );
}

export function FavoritesPageLayout() {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-[var(--radius-card)] border bg-surface-1 p-4 shadow-xs sm:p-5">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Heart className="h-4.5 w-4.5 fill-current" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">كل ما حفظته في مكان واحد</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground sm:text-sm">
            بدّل بين الأنواع، أنشئ قوائم خاصة بك، وانقل العناصر بينها بدون فقدانها من المفضلة.
          </p>
        </div>
      </div>

      <Suspense>
        <ActiveListBanner />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        <Suspense>
          <FavoriteListsSidebar />
        </Suspense>
        <section className="min-w-0" aria-label="محتوى المفضلة">
          <Suspense>
            <FavoritesTabs />
          </Suspense>
        </section>
      </div>
    </div>
  );
}
