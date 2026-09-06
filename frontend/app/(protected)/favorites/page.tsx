import type { Metadata } from 'next';
import { FavoritesPageLayout } from '@/components/favorites/FavoritesPageLayout';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'المفضلة', noIndex: true });

export default function FavoritesPage() {
  return <FavoritesPageLayout />;
}
