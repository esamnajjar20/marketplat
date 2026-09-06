'use client';

/**
 * تخطيط صفحة المفضلة: شريط القوائم + التبويبات الحالية (إعلانات/منتجات/...).
 * استبدل محتوى favorites/page.tsx بهذا المكوّن أو غلّف FavoritesTabs به.
 */

import { Suspense } from 'react';
import { FavoriteListsSidebar } from '@/components/favorites/FavoriteListsSidebar';
import { FavoritesTabs } from '@/components/profile/FavoritesTabs';

export function FavoritesPageLayout() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">المفضلة</h1>
      <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
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
