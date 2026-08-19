import type { Metadata } from 'next';
import { cache, Suspense } from 'react';
import Link from 'next/link';
import { SearchX, Package, Star } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';
import { storesApi } from '@/api/stores.api';
import { StoreHeader } from '@/components/stores/StoreHeader';
import { StoreProducts } from '@/components/stores/StoreProducts';
import { StoreReviewsList } from '@/components/stores/StoreReviewsList';
import { StoreReviewButton } from '@/components/stores/StoreReviewButton';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ROUTES } from '@/lib/constants';

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

  // FIX (audit note, quality pass §UX): this was a single bare line of
  // muted text with no icon and no way back to browsing — one of four
  // inconsistent "not found" treatments the audit flagged across the
  // (public) group. Now matches the EmptyState pattern already used by
  // /ads/[id]'s own 404 case (AdDetailSection) and everywhere else.
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
    <div className="container mx-auto px-4 py-6 space-y-8 max-w-4xl">
      <StoreHeader store={store} />

      <section className="space-y-3">
        <h2 className="flex items-center gap-1.5 text-lg font-bold">
          <Package className="h-4 w-4 text-muted-foreground" />
          المنتجات
        </h2>
        <Suspense fallback={<div className="flex justify-center py-8"><LoadingSpinner /></div>}>
          <StoreProducts storeId={store.id} />
        </Suspense>
      </section>

      <section className="space-y-3 border-t pt-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-lg font-bold">
            <Star className="h-4 w-4 text-muted-foreground" />
            التقييمات
          </h2>
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
