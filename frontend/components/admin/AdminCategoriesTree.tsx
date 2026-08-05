'use client';

import { ChevronDown, ChevronRight, Tag, Trash2, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { useCategories } from '@/hooks/queries/useCategories';
import { useDeleteCategory } from '@/hooks/mutations/useCategoryMutations';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EditCategoryButton } from '@/components/admin/EditCategoryButton';
import { Button } from '@/components/shared/ui/Button';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import type { Category } from '@/types/category.types';

/**
 * FIX INTEG-06: previously read-only despite useUpdateCategory /
 * useDeleteCategory (useCategoryMutations.ts) and their backend
 * endpoints being fully implemented and tested — nothing in this tree
 * ever called them. Edit opens a dialog (EditCategoryButton); delete
 * goes through the shared ConfirmDialog rather than window.confirm(),
 * consistent with the rest of the admin UI (see MyAdsList, AdminAdsTable).
 */
export function AdminCategoriesTree() {
  const { data: categories, isLoading, isError, refetch } = useCategories();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const deleteCategory = useDeleteCategory();

  if (isLoading) return <div className="flex justify-center py-6"><LoadingSpinner size="sm" /></div>;

  // UX-FIX P1-9 (admin variant): a failed fetch must not render as an
  // empty tree — an admin seeing zero categories could be misled into
  // thinking the taxonomy was wiped and try to recreate it from scratch.
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center rounded-lg border">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل الفئات</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const roots = (categories ?? []).filter((c) => !c.parentId);

  return (
    <div className="rounded-lg border divide-y">
      {roots.map((cat) => {
        const isOpen = expanded.has(cat.id);
        const hasChildren = (cat.children?.length ?? 0) > 0;
        return (
          <div key={cat.id}>
            <div className="flex items-center gap-2 p-3 hover:bg-muted/50 transition-colors">
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
                  : <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                <span className="flex-1">{cat.nameAr}</span>
                {cat._count && <span className="text-xs text-muted-foreground">{cat._count.ads} إعلان</span>}
              </button>
              <EditCategoryButton category={cat} />
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
            {isOpen && hasChildren && (
              <div className="border-t divide-y bg-muted/20">
                {cat.children!.map((child) => (
                  <div key={child.id} className="flex items-center gap-2 p-3 ps-8 text-sm text-muted-foreground">
                    <Tag className="h-3 w-3 shrink-0" />
                    <span className="flex-1">{child.nameAr}</span>
                    {child._count && <span className="text-xs">{child._count.ads} إعلان</span>}
                    <EditCategoryButton category={child} />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-destructive"
                      aria-label={`حذف ${child.nameAr}`}
                      onClick={() => setDeleteTarget(child)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`حذف "${deleteTarget?.nameAr}"؟`}
        description="لا يمكن التراجع عن هذا الإجراء. لا يمكن حذف فئة تحتوي على إعلانات نشطة."
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
