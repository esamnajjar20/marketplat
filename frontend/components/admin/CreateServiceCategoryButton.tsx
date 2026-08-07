'use client';

/**
 * CreateServiceCategoryButton.
 *
 * FIX SEC-4.3: thin wrapper around the shared CreateEntityCategoryDialog
 * (was previously a full ~95-line near-duplicate of
 * CreateProductCategoryButton.tsx).
 */

import { useCreateServiceCategory } from '@/hooks/mutations/useServiceCategoryMutations';
import { CreateEntityCategoryDialog } from '@/components/admin/CreateEntityCategoryDialog';

export function CreateServiceCategoryButton() {
  return (
    <CreateEntityCategoryDialog
      useCreateCategory={useCreateServiceCategory}
      slugFallbackPrefix="service-category"
      entityLabel="فئة خدمة جديدة"
      namePlaceholderAr="مثال: كهرباء"
      namePlaceholderEn="e.g. Electrical"
      iconPlaceholder="e.g. zap"
    />
  );
}
