'use client';

/**
 * EditServiceCategoryButton.
 *
 * FIX SEC-4.3: thin wrapper around the shared EditEntityCategoryDialog
 * (was previously a full ~115-line near-duplicate of
 * EditProductCategoryButton.tsx).
 */

import { useUpdateServiceCategory } from '@/hooks/mutations/useServiceCategoryMutations';
import { EditEntityCategoryDialog } from '@/components/admin/EditEntityCategoryDialog';
import type { ServiceCategory } from '@/types/service.types';

interface Props {
  category: ServiceCategory;
}

export function EditServiceCategoryButton({ category }: Props) {
  return (
    <EditEntityCategoryDialog
      category={category}
      useUpdateCategory={useUpdateServiceCategory}
      slugFallbackPrefix="service-category"
      dialogTitle="تعديل فئة الخدمة"
      namePlaceholderAr="مثال: كهرباء"
      namePlaceholderEn="e.g. Electrical"
      iconPlaceholder="e.g. zap"
    />
  );
}
