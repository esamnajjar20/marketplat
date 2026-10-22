import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { buildMetadata } from '@/lib/seo';
import { SuspenseFallback } from '@/components/shared/feedback/SuspenseFallback';

const FollowedStoresList = dynamic(
  () =>
    import('@/components/stores/FollowedStoresList').then(
      (module) => module.FollowedStoresList,
    ),
);

export const metadata: Metadata = buildMetadata({ title: 'المتاجر المتابَعة', noIndex: true });

export default function MyFollowedStoresPage() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border/70 pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">المتاجر المتابَعة</h1>
          <p className="mt-1 text-sm text-muted-foreground">تابع متاجرك المفضلة للوصول إلى منتجاتها وتحديثاتها بسرعة.</p>
        </div>
      </header>
      <Suspense fallback={<SuspenseFallback />}><FollowedStoresList /></Suspense>
    </div>
  );
}
