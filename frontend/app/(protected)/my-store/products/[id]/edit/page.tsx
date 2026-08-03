'use client';

/**
 * Edit my product page — Protected Client Component.
 * Ownership check: Product has no userId field directly (it belongs
 * to a StoreDetails, which belongs to a SellerProfile, which belongs
 * to a User) — same indirection service listings deal with (see
 * my-services/[id]/edit/page.tsx's comment). Rather than resolve that
 * chain client-side, this checks membership in the caller's own
 * /products/me list, which the backend already scopes to the
 * authenticated store owner.
 *
 * AUDIT-FIX (protected #7): shares useOwnershipGuard with the other
 * three edit pages instead of hand-rolling the same redirect effect.
 */
import { use } from 'react';
import { notFound } from 'next/navigation';
import { ProductForm } from '@/components/stores/ProductForm';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useProduct, useMyProducts } from '@/hooks/queries/useProducts';
import { useOwnershipGuard } from '@/hooks/useOwnershipGuard';
import { ROUTES } from '@/lib/constants';

interface Props {
  params: Promise<{ id: string }>;
}

export default function EditProductPage({ params }: Props) {
  const { id } = use(params);
  const { data: product, isLoading, isError } = useProduct(id);
  const { data: mine, isLoading: isLoadingMine } = useMyProducts({ limit: 100 });

  const isOwner = !!product && !!mine && mine.items.some((p) => p.id === product.id);
  const isLoadingOwnership = isLoading || isLoadingMine;
  const isRedirecting = useOwnershipGuard({
    isLoading: isLoadingOwnership,
    item: product,
    isOwner,
    redirectTo: ROUTES.myStoreProducts,
  });

  if (isLoadingOwnership) return <div className="flex justify-center py-20"><LoadingSpinner /></div>;
  if (isError || !product) return notFound();
  if (isRedirecting) return null;

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">تعديل المنتج</h1>
      <ProductForm mode="edit" product={product} />
    </div>
  );
}
