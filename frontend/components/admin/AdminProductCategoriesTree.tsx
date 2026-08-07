'use client';

/**
 * AdminProductCategoriesTree.
 *
 * Closes the audit report's finding: product-categories had full admin
 * CRUD on the backend (create/update/delete, all requireAdmin-protected)
 * with zero frontend UI, despite an exact precedent — the same gap was
 * already fixed for service-categories (see AdminServiceCategoriesTree,
 * "EPIC 1.2").
 *
 * FIX SEC-4.2: this used to be a ~165-line near-duplicate of
 * AdminServiceCategoriesTree.tsx. Both are now thin wrappers around the
 * shared AdminEntityCategoriesTree, supplying only what's actually
 * product-specific: the data/mutation hooks, the Package icon, the
 * _count.products field, and the Arabic copy.
 */

import { Package } from 'lucide-react';
import { useProductCategoriesForAdmin } from '@/hooks/queries/useProductCategories';
import { useDeleteProductCategory, useToggleProductCategoryActive } from '@/hooks/mutations/useProductCategoryMutations';
import { EditProductCategoryButton } from '@/components/admin/EditProductCategoryButton';
import { AdminEntityCategoriesTree } from '@/components/admin/AdminEntityCategoriesTree';
import type { ProductCategory } from '@/types/product.types';

export function AdminProductCategoriesTree() {
  return (
    <AdminEntityCategoriesTree<ProductCategory>
      useCategories={useProductCategoriesForAdmin}
      useDeleteCategory={useDeleteProductCategory}
      useToggleActive={useToggleProductCategoryActive}
      EditButton={EditProductCategoryButton}
      icon={<Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      childIcon={<Package className="h-3 w-3 shrink-0" />}
      countLabel={(cat) => cat._count ? `${cat._count.products} منتج` : null}
      loadErrorText="حدث خطأ أثناء تحميل فئات المنتجات"
      emptyText="لا توجد فئات منتجات بعد — ابدأ بإنشاء أول فئة."
      deleteBlockedDescription="لا يمكن التراجع عن هذا الإجراء. لا يمكن حذف فئة تحتوي على منتجات مرتبطة بها — أخفِها بدلاً من ذلك إذا أردت إيقافها مؤقتاً."
    />
  );
}
