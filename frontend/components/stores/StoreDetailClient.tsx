'use client';

/**
 * FIX SSR-FALLBACK-01: client-side rendering of the store page, used when the
 * server-side fetch failed (transport/5xx). The browser reaches the API through
 * the same-origin /api/v1 proxy, which works even when SSR cannot, so the user
 * sees the store instead of the opaque React #441 crash page.
 */
import { Suspense } from 'react';
import Link from 'next/link';
import { SearchX, AlertTriangle } from 'lucide-react';
import { useStore } from '@/hooks/queries/useStores';
import { StoreHeader } from '@/components/stores/StoreHeader';
import { StoreStorefront } from '@/components/stores/StoreStorefront';
import { StoreRecommendations } from '@/components/recommendations/StoreRecommendations';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { Button } from '@/components/shared/ui/Button';
import { parseApiError } from '@/lib/errorParser';
import { ROUTES } from '@/lib/constants';

export function StoreDetailClient({ id }: { id: string }) {
  const { data: store, isLoading, isError, error, refetch } = useStore(id);

  if (isLoading) {
    return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
  }

  if (isError || !store) {
    const notFound = isError && parseApiError(error).statusCode === 404;
    return (
      <div className="container mx-auto max-w-7xl px-3 py-6 sm:px-4 lg:py-8">
        <EmptyState
          icon={notFound ? <SearchX className="h-10 w-10" /> : <AlertTriangle className="h-10 w-10" />}
          title={notFound ? 'المتجر غير موجود' : 'تعذّر تحميل المتجر'}
          description={notFound ? 'ربما تم حذف هذا المتجر أو أن الرابط غير صحيح' : 'حدثت مشكلة في الاتصال، حاول مرة أخرى'}
          action={notFound
            ? <Link href={ROUTES.stores} className="text-sm text-primary hover:underline">تصفح المتاجر</Link>
            : <Button type="button" variant="outline" onClick={() => refetch()}>إعادة المحاولة</Button>}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto w-full max-w-7xl space-y-8 px-3 py-6 sm:px-4 lg:py-8">
      <StoreHeader store={store} />
      <Suspense fallback={<div className="flex justify-center py-8"><LoadingSpinner /></div>}>
        <StoreStorefront
          storeId={store.id}
          storeName={store.name}
          ownerUserId={store.sellerProfile?.userId ?? ''}
          store={store}
        />
      </Suspense>
      <StoreRecommendations excludeStoreId={store.id} />
    </div>
  );
}
