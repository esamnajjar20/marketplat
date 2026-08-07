'use client';

/**
 * EditProductCategoryButton.
 *
 * FIX SEC-4.3: thin wrapper around the shared EditEntityCategoryDialog
 * (was previously a full ~113-line near-duplicate of
 * EditServiceCategoryButton.tsx).
 */

import { useUpdateProductCategory } from '@/hooks/mutations/useProductCategoryMutations';
import { EditEntityCategoryDialog } from '@/components/admin/EditEntityCategoryDialog';
import type { ProductCategory } from '@/types/product.types';

interface Props {
  category: ProductCategory;
}

export function EditProductCategoryButton({ category }: Props) {
  return (
    <EditEntityCategoryDialog
      category={category}
      useUpdateCategory={useUpdateProductCategory}
      slugFallbackPrefix="product-category"
      dialogTitle="تعديل فئة المنتج"
      namePlaceholderAr="مثال: إلكترونيات"
      namePlaceholderEn="e.g. Electronics"
      iconPlaceholder="e.g. cpu"
    />
  );
}
