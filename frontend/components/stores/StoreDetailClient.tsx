'use client';

/**
 * FIX SSR-FALLBACK-01: client-side rendering of the store page, used when the
 * server-side fetch failed (transport/5xx). The browser reaches the API through
 * the same-origin /api/v1 proxy, which works even when SSR cannot, so the user
 * sees the store instead of the opaque React #441 crash page. Keep this fallback
 * visually and behaviorally aligned with the normal Server Component path:
 * store header + storefront only, without starting a recommendations query.
 */
import { Suspense } from 'react';
import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import { SearchX, AlertTriangle } from 'lucide-react';
import { useStore } from '@/hooks/queries/useStores';
import { StoreHeader } from '@/components/stores/StoreHeader';
import { StoreStorefront } from '@/components/stores/StoreStorefront';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { Button } from '@/components/shared/ui/Button';
import { parseApiError } from '@/lib/errorParser';
import { ROUTES } from '@/lib/constants';
import { ENTITY_PAGE } from '@/components/shared/entity-page/entityPageTokens';
import { PublicAccountBlockedState } from '@/components/shared/feedback/PublicAccountBlockedState';

export function StoreDetailClient({ id }: { id: string }) {
  const { data: pageData, isLoading, isError, error, refetch } = useStore(id, { trackView: true });
  const store = pageData?.store;

  if (isLoading) {
    return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
  }

  if (isError || !store) {
    const parsed = isError ? parseApiError(error) : null;
    if (parsed?.code === 'PUBLIC_ACCOUNT_BLOCKED') return <PublicAccountBlockedState />;
    const notFound = parsed?.statusCode === 404;
    return (
      <div className={ENTITY_PAGE}>
        <EmptyState
          icon={notFound ? <SearchX className="h-10 w-10" /> : <AlertTriangle className="h-10 w-10" />}
          title={notFound ? 'المتجر غير موجود' : 'تعذّر تحميل المتجر'}
          description={notFound ? 'ربما تم حذف هذا المتجر أو أن الرابط غير صحيح' : 'حدثت مشكلة في الاتصال، حاول مرة أخرى'}
          action={notFound
            ? <IntentPrefetchLink href={ROUTES.stores} className="text-sm text-primary hover:underline" prefetch={false}>تصفح المتاجر</IntentPrefetchLink>
            : <Button type="button" variant="outline" onClick={() => refetch()}>إعادة المحاولة</Button>}
        />
      </div>
    );
  }

  return (
    <div className={ENTITY_PAGE}>
      <StoreHeader
        store={store}
        isFollowing={pageData?.viewer?.isFollowing ?? false}
        isFavorited={pageData?.viewer?.isFavorited ?? false}
        badges={pageData?.badges}
      />
      <Suspense fallback={<div className="flex justify-center py-8"><LoadingSpinner /></div>}>
        <StoreStorefront
          storeId={store.id}
          storeName={store.name}
          ownerUserId={store.sellerProfile?.userId ?? ''}
          store={store}
        />
      </Suspense>
    </div>
  );
}
