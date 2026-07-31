'use client';

/**
 * AdminServiceCategoriesTree — Epic 1.2.
 *
 * The report's finding: service-categories had full admin CRUD on the
 * backend (create/update/delete, all requireAdmin-protected) with zero
 * frontend UI — "no admin page for services/service-categories/
 * service-providers/service-listings management... despite
 * service-categories having admin-only create/update/delete routes."
 * This tree is that missing UI, closely mirroring AdminCategoriesTree.tsx
 * (same expand/collapse, edit, delete pattern) with two differences
 * ServiceCategory has that the ad Category doesn't:
 *   1. isActive — categories aren't hard-deleted from the public tree,
 *      they're deactivated; shown as a badge + one-click toggle here.
 *   2. Fetches via useServiceCategoriesForAdmin (not the public
 *      useServiceCategories), since the admin view must include
 *      inactive categories the public tree filters out.
 */

import { ChevronDown, ChevronRight, Wrench, Trash2, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useServiceCategoriesForAdmin } from '@/hooks/queries/useServiceCategories';
import { useDeleteServiceCategory, useToggleServiceCategoryActive } from '@/hooks/mutations/useServiceCategoryMutations';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EditServiceCategoryButton } from '@/components/admin/EditServiceCategoryButton';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import type { ServiceCategory } from '@/types/service.types';

export function AdminServiceCategoriesTree() {
  const { data: categories, isLoading, isError, refetch } = useServiceCategoriesForAdmin();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<ServiceCategory | null>(null);
  const deleteCategory = useDeleteServiceCategory();
  const toggleActive   = useToggleServiceCategoryActive();

  if (isLoading) return <div className="flex justify-center py-6"><LoadingSpinner size="sm" /></div>;

  // Same UX-FIX P1-9 reasoning as AdminCategoriesTree: a failed fetch
  // must not render as an empty tree.
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center rounded-lg border">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل فئات الخدمات</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  // GET /service-categories/admin/all already returns only root
  // categories with `children` nested (service-categories.repository.ts's
  // findManyForAdmin filters `where: { parentId: null }` and includes
  // children) — no client-side root-filtering needed here.
  const roots = categories ?? [];

  function renderRow(cat: ServiceCategory, isChild: boolean) {
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
              : <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            <span className="flex-1">{cat.nameAr}</span>
          </button>
        ) : (
          <div className="flex flex-1 items-center gap-2 text-sm text-muted-foreground">
            <Wrench className="h-3 w-3 shrink-0" />
            <span className="flex-1">{cat.nameAr}</span>
          </div>
        )}

        {!cat.isActive && (
          <Badge variant="secondary" className="text-xs">مخفية</Badge>
        )}
        {cat._count && (
          <span className="text-xs text-muted-foreground">{cat._count.listings} خدمة</span>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title={cat.isActive ? 'إخفاء الفئة' : 'إظهار الفئة'}
          aria-label={cat.isActive ? `إخفاء ${cat.nameAr}` : `إظهار ${cat.nameAr}`}
          disabled={toggleActive.isPending && toggleActive.variables?.id === cat.id}
          onClick={() => toggleActive.mutate({ id: cat.id, isActive: !cat.isActive })}
        >
          {cat.isActive
            ? <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
        </Button>
        <EditServiceCategoryButton category={cat} />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive"
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
          لا توجد فئات خدمات بعد — ابدأ بإنشاء أول فئة.
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`حذف "${deleteTarget?.nameAr}"؟`}
        description="لا يمكن التراجع عن هذا الإجراء. لا يمكن حذف فئة تحتوي على خدمات مرتبطة بها — أخفِها بدلاً من ذلك إذا أردت إيقافها مؤقتاً."
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
