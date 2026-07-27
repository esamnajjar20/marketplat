import type { Metadata } from 'next';
import { Suspense }      from 'react';
import { FavoritesList } from '@/components/profile/FavoritesList';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'المفضلة', noIndex: true });

export default function FavoritesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">المفضلة</h1>
      <Suspense><FavoritesList /></Suspense>
    </div>
  );
}
