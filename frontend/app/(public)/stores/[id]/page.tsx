import type { Metadata } from 'next';
import { cache, Suspense } from 'react';
import { buildMetadata } from '@/lib/seo';
import { storesApi } from '@/api/stores.api';
import { StoreHeader } from '@/components/stores/StoreHeader';
import { StoreProducts } from '@/components/stores/StoreProducts';
import { StoreReviewsList } from '@/components/stores/StoreReviewsList';
import { StoreReviewButton } from '@/components/stores/StoreReviewButton';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';

interface Props {
  params: Promise<{ id: string }>;
}

// Same reasoning as service-providers/[id]/page.tsx's getCachedProvider:
// memoizes within a single render pass so generateMetadata and the
// page body don't each fire their own network request for the same
// store.
const getCachedStore = cache((id: string) => storesApi.getById(id));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const store = await getCachedStore(id);
    return buildMetadata({
      title: `${store.data.data!.name} — متجر`,
      path: `/stores/${id}`,
    });
  } catch {
    return { title: 'متجر' };
  }
}

export default async function StorePage({ params }: Props) {
  const { id } = await params;
  let store: Awaited<ReturnType<typeof storesApi.getById>>['data']['data'] | null = null;

  try {
    const res = await getCachedStore(id);
    store = res.data.data ?? null;
  } catch {
    /* 404 */
  }

  if (!store) {
    return <div className="text-center py-20 text-muted-foreground">المتجر غير موجود</div>;
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-4xl">
      <StoreHeader store={store} />

      <section className="space-y-3">
        <h2 className="font-semibold text-lg">المنتجات</h2>
        <Suspense fallback={<div className="flex justify-center py-8"><LoadingSpinner /></div>}>
          <StoreProducts storeId={store.id} />
        </Suspense>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-lg">التقييمات</h2>
          <StoreReviewButton
            storeId={store.id}
            storeName={store.name}
            ownerUserId={store.sellerProfile.userId}
          />
        </div>
        <Suspense fallback={<div className="flex justify-center py-8"><LoadingSpinner /></div>}>
          <StoreReviewsList storeId={store.id} />
        </Suspense>
      </section>
    </div>
  );
}
