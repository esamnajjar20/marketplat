'use client';

/**
 * EditServiceCategoryButton.
 *
 * FIX SEC-4.3: thin wrapper around the shared EditEntityCategoryDialog
 * (was previously a full ~115-line near-duplicate of
 * EditProductCategoryButton.tsx).
 */

import { useUpdateServiceCategory } from '@/hooks/mutations/useServiceCategoryMutations';
import { useServiceTypes } from '@/hooks/queries/useServiceTypes';
import { EditEntityCategoryDialog } from '@/components/admin/EditEntityCategoryDialog';
import type { ServiceCategory } from '@/types/service.types';

interface Props {
  category: ServiceCategory;
}

export function EditServiceCategoryButton({ category }: Props) {
  const { data: serviceTypes = [] } = useServiceTypes();
  return (
    <EditEntityCategoryDialog
      category={category}
      useUpdateCategory={useUpdateServiceCategory}
      slugFallbackPrefix="service-category"
      dialogTitle="تعديل فئة الخدمة"
      namePlaceholderAr="مثال: كهرباء"
      namePlaceholderEn="e.g. Electrical"
      iconPlaceholder="e.g. zap"
      serviceTypes={serviceTypes.map((type) => ({ id: type.id, nameAr: type.nameAr }))}
    />
  );
}
