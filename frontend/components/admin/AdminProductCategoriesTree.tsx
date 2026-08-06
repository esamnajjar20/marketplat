'use client';

/**
 * AdminProductCategoriesTree.
 *
 * Closes the audit report's finding: product-categories had full admin
 * CRUD on the backend (create/update/delete, all requireAdmin-protected)
 * with zero frontend UI, despite an exact precedent — the same gap was
 * already fixed for service-categories (see AdminServiceCategoriesTree,
 * "EPIC 1.2"). This tree mirrors AdminServiceCategoriesTree.tsx closely
 * (same expand/collapse, edit, delete, isActive-toggle pattern), swapping
 * only the products-specific data source, count field, and icon:
 *   - Fetches via useProductCategoriesForAdmin (admin view must include
 *     inactive categories the public tree filters out), not the public
 *     useProductCategories.
 *   - _count.products instead of _count.listings.
 *   - Package icon instead of Wrench, to visually distinguish the
 *     products tree from the services tree in the admin nav.
 */

import { ChevronDown, ChevronRight, Package, Trash2, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useProductCategoriesForAdmin } from '@/hooks/queries/useProductCategories';
import { useDeleteProductCategory, useToggleProductCategoryActive } from '@/hooks/mutations/useProductCategoryMutations';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EditProductCategoryButton } from '@/components/admin/EditProductCategoryButton';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import type { ProductCategory } from '@/types/product.types';

export function AdminProductCategoriesTree() {
  const { data: categories, isLoading, isError, refetch } = useProductCategoriesForAdmin();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<ProductCategory | null>(null);
  const deleteCategory = useDeleteProductCategory();
  const toggleActive   = useToggleProductCategoryActive();

  if (isLoading) return <div className="flex justify-center py-6"><LoadingSpinner size="sm" /></div>;

  // Same UX-FIX P1-9 reasoning as AdminCategoriesTree/AdminServiceCategoriesTree:
  // a failed fetch must not render as an empty tree.
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center rounded-lg border">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل فئات المنتجات</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  // GET /product-categories/admin/all already returns only root
  // categories with `children` nested (product-categories.repository.ts's
  // findManyForAdmin filters `where: { parentId: null }` and includes
  // children) — no client-side root-filtering needed here.
  const roots = categories ?? [];

  function renderRow(cat: ProductCategory, isChild: boolean) {
    const isOpen = expanded.has(cat.id);
    const hasChildren = (cat.children?.length ?? 0) > 0;
    return (
      <div
        key={cat.id}
        className={`flex items-center gap-2 p-3 hover:bg-muted/50 transition-colors ${isChild ? 'ps-8 border-t' : ''}`}
      >
        {!isChild ? (
          <button
            onClick={() => setExpanded((s) => { const n = new Set(s); if (isOpen) {
      n.delete(cat.id);
    } else {
      n.add(cat.id);
    } return n; })}
            aria-expanded={hasChildren ? isOpen : undefined}
            aria-label={hasChildren ? `${cat.nameAr} — ${isOpen ? 'إغلاق' : 'فتح'} الفئات الفرعية` : cat.nameAr}
            className="flex flex-1 items-center gap-2 text-sm font-medium text-start"
          >
            {hasChildren
              ? (isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />)
              : <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            <span className="flex-1">{cat.nameAr}</span>
          </button>
        ) : (
          <div className="flex flex-1 items-center gap-2 text-sm text-muted-foreground">
            <Package className="h-3 w-3 shrink-0" />
            <span className="flex-1">{cat.nameAr}</span>
          </div>
        )}

        {!cat.isActive && (
          <Badge variant="secondary" className="text-xs">مخفية</Badge>
        )}
        {cat._count && (
          <span className="text-xs text-muted-foreground">{cat._count.products} منتج</span>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          title={cat.isActive ? 'إخفاء الفئة' : 'إظهار الفئة'}
          aria-label={cat.isActive ? `إخفاء ${cat.nameAr}` : `إظهار ${cat.nameAr}`}
          disabled={toggleActive.isPending && toggleActive.variables?.id === cat.id}
          onClick={() => toggleActive.mutate({ id: cat.id, isActive: !cat.isActive })}
        >
          {cat.isActive
            ? <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
        </Button>
        <EditProductCategoryButton category={cat} />
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-destructive"
          aria-label={`حذف ${cat.nameAr}`}
          onClick={() => setDeleteTarget(cat)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border divide-y">
      {roots.map((cat) => {
        const isOpen = expanded.has(cat.id);
        const hasChildren = (cat.children?.length ?? 0) > 0;
        return (
          <div key={cat.id}>
            {renderRow(cat, false)}
            {isOpen && hasChildren && (
              <div className="bg-muted/20">
                {cat.children!.map((child) => renderRow(child, true))}
              </div>
            )}
          </div>
        );
      })}

      {roots.length === 0 && (
        <div className="p-8 text-center text-sm text-muted-foreground">
          لا توجد فئات منتجات بعد — ابدأ بإنشاء أول فئة.
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`حذف "${deleteTarget?.nameAr}"؟`}
        description="لا يمكن التراجع عن هذا الإجراء. لا يمكن حذف فئة تحتوي على منتجات مرتبطة بها — أخفِها بدلاً من ذلك إذا أردت إيقافها مؤقتاً."
        confirmLabel="حذف"
        destructive
        isPending={deleteCategory.isPending}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteCategory.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
        }}
      />
    </div>
  );
}
