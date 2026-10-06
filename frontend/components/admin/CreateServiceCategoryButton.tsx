'use client';

/**
 * CreateServiceCategoryButton.
 *
 * thin wrapper around the shared CreateEntityCategoryDialog
 * (was previously a full ~95-line near-duplicate of
 * CreateProductCategoryButton.tsx).
 */

import { useCreateServiceCategory } from '@/hooks/mutations/useServiceCategoryMutations';
import { useServiceTypes } from '@/hooks/queries/useServiceTypes';
import { CreateEntityCategoryDialog } from '@/components/admin/CreateEntityCategoryDialog';

export function CreateServiceCategoryButton() {
  const { data: serviceTypes = [] } = useServiceTypes();
  return (
    <CreateEntityCategoryDialog
      useCreateCategory={useCreateServiceCategory}
      slugFallbackPrefix="service-category"
      entityLabel="فئة خدمة جديدة"
      namePlaceholderAr="مثال: كهرباء"
      namePlaceholderEn="e.g. Electrical"
      iconPlaceholder="e.g. zap"
      serviceTypes={serviceTypes.map((type) => ({ id: type.id, nameAr: type.nameAr }))}
    />
  );
}
