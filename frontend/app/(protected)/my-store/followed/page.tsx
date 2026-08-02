import type { Metadata } from 'next';
import { Suspense } from 'react';
import { FollowedStoresList } from '@/components/stores/FollowedStoresList';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'المتاجر المتابَعة', noIndex: true });

export default function MyFollowedStoresPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">المتاجر المتابَعة</h1>
      <Suspense><FollowedStoresList /></Suspense>
    </div>
  );
}
