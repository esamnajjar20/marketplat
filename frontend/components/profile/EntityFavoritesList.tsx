'use client';

import { ProductCard } from '@/components/stores/ProductCard';
import { StoreCard } from '@/components/stores/StoreCard';
import { ServiceListingCard } from '@/components/services/ServiceListingCard';
import { ProductCardSkeleton, StoreCardSkeleton, ServiceListingCardSkeleton } from '@/components/shared/skeletons';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { Pagination } from '@/components/shared/ui/Pagination';
import { Button } from '@/components/shared/ui/Button';
import { useFavoritesByType } from '@/hooks/queries/useFavorites';
import { useSearchParams } from 'next/navigation';
import { Heart, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { ROUTES } from '@/lib/constants';
import type { FavoriteEntityKind } from '@/types/favorite.types';
import type { ProductWithStore } from '@/types/product.types';
import type { StoreWithSeller } from '@/types/store.types';
import type { ServiceListingWithProvider } from '@/types/service.types';

interface Props {
  type: FavoriteEntityKind;
}

const EMPTY_COPY: Record<FavoriteEntityKind, { title: string; description: string; cta: string; href: string }> = {
  PRODUCT: {
    title: 'لا توجد منتجات محفوظة',
    description: 'احفظ المنتجات التي تعجبك لتجدها هنا لاحقاً',
    cta: 'تصفح المنتجات',
    href: ROUTES.home,
  },
  STORE: {
    title: 'لا توجد متاجر محفوظة',
    description: 'احفظ المتاجر التي تعجبك لتجدها هنا لاحقاً',
    cta: 'تصفح المتاجر',
    href: ROUTES.stores,
  },
  SERVICE_LISTING: {
    title: 'لا توجد خدمات محفوظة',
    description: 'احفظ الخدمات التي تعجبك لتجدها هنا لاحقاً',
    cta: 'تصفح الخدمات',
    href: ROUTES.services,
  },
};

/**
 * FEAT-FAVORITE-POLYMORPHIC PR3: generic counterpart of
 * FavoritesList.tsx (which stays AD-only, untouched) for
 * PRODUCT/STORE/SERVICE_LISTING. GET /favorites?type=... returns one
 * type per call (favorites.validation.ts's getFavoritesSchema — no
 * mixed-type response), so this renders exactly one type per mount;
 * FavoritesTabs.tsx picks which type based on the URL.
 */
export function EntityFavoritesList({ type }: Props) {
  const sp = useSearchParams();
  const page = Number(sp.get('page') ?? 1);
  const { data, isLoading, isError, refetch } = useFavoritesByType(type, { page });
  const items = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;
  const copy = EMPTY_COPY[type];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <EntityCardSkeleton key={i} type={type} />)}
      </div>
    );
  }

  // Same UX-FIX P1-8 ordering as FavoritesList.tsx: a real fetch
  // failure must never be misread as "genuinely no favorites".
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل المفضلة</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-sm text-primary hover:underline"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Heart className="h-10 w-10" />}
        title={copy.title}
        description={copy.description}
        action={<Link href={copy.href}><Button variant="outline">{copy.cta}</Button></Link>}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div
        className={
          type === 'STORE'
            ? 'grid grid-cols-1 sm:grid-cols-2 gap-3 stagger-fade-in'
            : 'grid grid-cols-2 lg:grid-cols-3 gap-3 stagger-fade-in'
        }
      >
        {items.map((fav) => (
          <EntityCard key={fav.entityId} type={type} entity={fav.entity} />
        ))}
      </div>
      {totalPages > 1 && (
        <Pagination
          totalPages={totalPages}
          currentPage={page}
          baseUrl={ROUTES.favorites}
          searchParams={{ type: sp.get('type') ?? undefined }}
        />
      )}
    </div>
  );
}

function EntityCard({
  type,
  entity,
}: {
  type: FavoriteEntityKind;
  entity: ProductWithStore | StoreWithSeller | ServiceListingWithProvider;
}) {
  switch (type) {
    case 'PRODUCT': {
      const product = entity as ProductWithStore;
      return <ProductCard product={product} storeId={product.store.id} />;
    }
    case 'STORE':
      return <StoreCard store={entity as StoreWithSeller} />;
    case 'SERVICE_LISTING':
      return <ServiceListingCard listing={entity as ServiceListingWithProvider} />;
  }
}

function EntityCardSkeleton({ type }: { type: FavoriteEntityKind }) {
  switch (type) {
    case 'PRODUCT':
      return <ProductCardSkeleton />;
    case 'STORE':
      return <StoreCardSkeleton />;
    case 'SERVICE_LISTING':
      return <ServiceListingCardSkeleton />;
  }
}
