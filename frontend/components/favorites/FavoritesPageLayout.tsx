'use client';

import { Suspense } from 'react';
import { FavoriteListsSidebar } from '@/components/favorites/FavoriteListsSidebar';
import { FavoritesTabs } from '@/components/profile/FavoritesTabs';

export function FavoritesPageLayout() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">المفضلة</h1>
        <p className="text-sm text-muted-foreground">
          1) اضغط ♡ على أي إعلان أو منتج أو خدمة · 2) أنشئ قائمة من الشريط · 3) اضغط «نقل إلى
          قائمة» على العنصر.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-[15rem_1fr]">
        <Suspense>
          <FavoriteListsSidebar />
        </Suspense>
        <div className="min-w-0">
          <Suspense>
            <FavoritesTabs />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
