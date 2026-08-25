import type { Metadata } from 'next';
import { Suspense }      from 'react';
import { FavoritesTabs } from '@/components/profile/FavoritesTabs';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'المفضلة', noIndex: true });

export default function FavoritesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">المفضلة</h1>
      <Suspense><FavoritesTabs /></Suspense>
    </div>
  );
}
