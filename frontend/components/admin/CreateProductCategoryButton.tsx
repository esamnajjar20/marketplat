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

export function CreateProductCategoryButton() {
  return (
    <CreateEntityCategoryDialog
      useCreateCategory={useCreateProductCategory}
      slugFallbackPrefix="product-category"
      entityLabel="فئة منتج جديدة"
      namePlaceholderAr="مثال: إلكترونيات"
      namePlaceholderEn="e.g. Electronics"
      iconPlaceholder="e.g. cpu"
    />
  );
}
