import type { Metadata } from 'next';
import { cache, Suspense } from 'react';
import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';
import { storesApi } from '@/api/stores.api';
import { StoreHeader } from '@/components/stores/StoreHeader';
import { StoreStorefront } from '@/components/stores/StoreStorefront';
import { StoreRecommendations } from '@/components/recommendations/StoreRecommendations';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ROUTES } from '@/lib/constants';

interface Props {
  params: Promise<{ id: string }>;
}

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
    return (
      <div className="container mx-auto px-4 py-6">
        <EmptyState
          icon={<SearchX className="h-10 w-10" />}
          title="المتجر غير موجود"
          description="ربما تم حذف هذا المتجر أو أن الرابط غير صحيح"
          action={
            <Link href={ROUTES.stores} className="text-sm text-primary hover:underline">
              تصفح المتاجر
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl space-y-8 px-4 py-6">
      <StoreHeader store={store} />

      <Suspense fallback={<div className="flex justify-center py-8"><LoadingSpinner /></div>}>
        <StoreStorefront
          storeId={store.id}
          storeName={store.name}
          ownerUserId={store.sellerProfile.userId}
        />
      </Suspense>

      <StoreRecommendations excludeStoreId={store.id} />
    </div>
  );
}
