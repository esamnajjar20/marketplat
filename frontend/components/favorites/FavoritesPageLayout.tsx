'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
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
    <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-sm">
      <span className="font-medium text-primary">عرض قائمة: {list.name}</span>
      <span className="ms-2 text-muted-foreground">({list.itemsCount} عنصر)</span>
    </div>
  );
}

export function FavoritesPageLayout() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">المفضلة</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          اختر قائمة من الشريط لعرض محتواها، أو «الكل» لرؤية كل العناصر المحفوظة.
          انقل عنصرًا إلى قائمة عبر زر «نقل إلى قائمة» تحت كل بطاقة.
        </p>
      </div>
      <Suspense>
        <ActiveListBanner />
      </Suspense>
      <div className="grid gap-6 md:grid-cols-[15rem_1fr]">
        {/* على الموبايل: الشريط فوق المحتوى ليكون واضحًا */}
        <Suspense>
          <FavoriteListsSidebar />
        </Suspense>
        <div className="min-w-0 space-y-3">
          <Suspense>
            <FavoritesTabs />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
