'use client';

import { ProductForm } from '@/components/stores/ProductForm';
import { RequireProfileGate } from '@/components/shared/gates/RequireProfileGate';
import { useMyStore } from '@/hooks/queries/useStores';
import { ROUTES } from '@/lib/constants';

/**
 * Gates product creation behind store ownership — mirrors CreateAdGate's
 * seller-profile check. Previously /my-store/products/new mounted
 * ProductForm directly with no client-side check, so a user without a
 * store only found out via a backend 4xx on submit, with no path back
 * to this page after opening a store via settings.
 *
 * Only store owners may add products — enforced server-side already;
 * this just surfaces it before the form instead of after submit.
 */
export function CreateProductGate() {
  const query = useMyStore();

  return (
    <RequireProfileGate
      query={query}
      setupHref={ROUTES.myStore}
      from={ROUTES.myStoreProductCreate}
      title="افتح متجرك أولاً"
      description="تحتاج إلى فتح متجر قبل أن تتمكن من إضافة منتجات"
      ctaLabel="فتح متجر"
    >
      <ProductForm mode="create" />
    </RequireProfileGate>
  );
}
