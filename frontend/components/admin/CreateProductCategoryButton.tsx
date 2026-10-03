'use client';

/**
 * CreateProductCategoryButton.
 *
 * FIX SEC-4.3: thin wrapper around the shared CreateEntityCategoryDialog
 * (was previously a full ~95-line near-duplicate of
 * CreateServiceCategoryButton.tsx).
 */

import { useCreateProductCategory } from '@/hooks/mutations/useProductCategoryMutations';
import { CreateEntityCategoryDialog } from '@/components/admin/CreateEntityCategoryDialog';
import { useAdminStoreTypes } from '@/hooks/queries/useAdmin';

export function CreateProductCategoryButton() {
  const { data: storeTypes = [] } = useAdminStoreTypes();
  return (
    <CreateEntityCategoryDialog
      useCreateCategory={useCreateProductCategory}
      slugFallbackPrefix="product-category"
      entityLabel="فئة منتج جديدة"
      namePlaceholderAr="مثال: إلكترونيات"
      namePlaceholderEn="e.g. Electronics"
      iconPlaceholder="e.g. cpu"
      storeTypes={storeTypes.map((type) => ({ id: type.id, nameAr: type.nameAr }))}
    />
  );
}
