'use client';

/**
 * AdminServiceCategoriesTree — Epic 1.2.
 *
 * The report's finding: service-categories had full admin CRUD on the
 * backend (create/update/delete, all requireAdmin-protected) with zero
 * frontend UI.
 *
 * FIX SEC-4.2: this used to be a ~165-line near-duplicate of
 * AdminProductCategoriesTree.tsx. Both are now thin wrappers around the
 * shared AdminEntityCategoriesTree, supplying only what's actually
 * service-specific: the data/mutation hooks, the Wrench icon, the
 * _count.listings field, and the Arabic copy.
 */

import { Wrench } from 'lucide-react';
import { useServiceCategoriesForAdmin } from '@/hooks/queries/useServiceCategories';
import { useDeleteServiceCategory, useToggleServiceCategoryActive } from '@/hooks/mutations/useServiceCategoryMutations';
import { EditServiceCategoryButton } from '@/components/admin/EditServiceCategoryButton';
import { AdminEntityCategoriesTree } from '@/components/admin/AdminEntityCategoriesTree';
import type { ServiceCategory } from '@/types/service.types';

export function AdminServiceCategoriesTree() {
  return (
    <AdminEntityCategoriesTree<ServiceCategory>
      useCategories={useServiceCategoriesForAdmin}
      useDeleteCategory={useDeleteServiceCategory}
      useToggleActive={useToggleServiceCategoryActive}
      EditButton={EditServiceCategoryButton}
      icon={<Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      childIcon={<Wrench className="h-3 w-3 shrink-0" />}
      countLabel={(cat) => cat._count ? `${cat._count.listings} خدمة` : null}
      loadErrorText="حدث خطأ أثناء تحميل فئات الخدمات"
      emptyText="لا توجد فئات خدمات بعد — ابدأ بإنشاء أول فئة."
      deleteBlockedDescription="لا يمكن التراجع عن هذا الإجراء. لا يمكن حذف فئة تحتوي على خدمات مرتبطة بها — أخفِها بدلاً من ذلك إذا أردت إيقافها مؤقتاً."
    />
  );
}
