'use client';

import { ChevronDown, ChevronRight, Trash2, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { useState, type ComponentType, type ReactNode } from 'react';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';

/**
 * FIX SEC-4.2: AdminProductCategoriesTree.tsx and
 * AdminServiceCategoriesTree.tsx were ~95% identical — same
 * expand/collapse, isActive-toggle, edit, delete logic, differing only
 * in the data source, the entity noun in copy, the icon, and the
 * _count field name (`products` vs `listings`). This generic component
 * is that shared implementation; the two call sites below just supply
 * the parts that actually differ.
 *
 * AdminCategoriesTree.tsx (ad categories) is intentionally NOT folded
 * into this — it has no isActive/toggle concept at all (ad Category
 * doesn't carry that field), so forcing it through this shape would
 * mean threading optional-everything through the generic just for one
 * caller that doesn't use most of it.
 */

interface BaseCategory {
  id: string;
  nameAr: string;
  isActive: boolean;
  children?: BaseCategory[];
}

interface EditButtonProps<TCategory> {
  category: TCategory;
}

export interface AdminEntityCategoriesTreeProps<TCategory extends BaseCategory> {
  useCategories: () => { data: TCategory[] | undefined; isLoading: boolean; isError: boolean; refetch: () => void };
  useDeleteCategory: () => { mutate: (id: string, opts?: { onSuccess?: () => void }) => void; isPending: boolean };
  useToggleActive: () => {
    mutate: (vars: { id: string; isActive: boolean }) => void;
    isPending: boolean;
    variables?: { id: string };
  };
  EditButton: ComponentType<EditButtonProps<TCategory>>;
  /** Icon shown on a root row (h-3.5 w-3.5) when it has no children. */
  icon: ReactNode;
  /** Icon shown on a child row — slightly smaller (h-3 w-3) in the original markup. */
  childIcon: ReactNode;
  /** e.g. "منتج" for "3 منتج" under a category row. */
  countLabel: (category: TCategory) => ReactNode;
  loadErrorText: string;
  emptyText: string;
  deleteBlockedDescription: string;
}

export function AdminEntityCategoriesTree<TCategory extends BaseCategory>({
  useCategories,
  useDeleteCategory,
  useToggleActive,
  EditButton,
  icon,
  childIcon,
  countLabel,
  loadErrorText,
  emptyText,
  deleteBlockedDescription,
}: AdminEntityCategoriesTreeProps<TCategory>) {
  const { data: categories, isLoading, isError, refetch } = useCategories();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<TCategory | null>(null);
  const deleteCategory = useDeleteCategory();
  const toggleActive = useToggleActive();

  if (isLoading) return <div className="flex justify-center py-6"><LoadingSpinner size="sm" /></div>;

  // Same UX-FIX P1-9 reasoning across all three category trees: a
  // failed fetch must not render as an empty tree.
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center rounded-lg border">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-destructive">{loadErrorText}</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  // Admin "all" endpoints already return root categories with nested
  // children (repository's findManyForAdmin filters parentId: null) —
  // no client-side root-filtering needed.
  const roots = categories ?? [];

  function renderRow(cat: TCategory, isChild: boolean) {
    const isOpen = expanded.has(cat.id);
    const hasChildren = (cat.children?.length ?? 0) > 0;
    return (
      <div
        key={cat.id}
        className={`flex items-center gap-2 p-3 hover:bg-muted/50 transition-colors ${isChild ? 'ps-8 border-t' : ''}`}
      >
        {!isChild ? (
          <button
            onClick={() => setExpanded((s) => {
              const n = new Set(s);
              if (isOpen) { n.delete(cat.id); } else { n.add(cat.id); }
              return n;
            })}
            aria-expanded={hasChildren ? isOpen : undefined}
            aria-label={hasChildren ? `${cat.nameAr} — ${isOpen ? 'إغلاق' : 'فتح'} الفئات الفرعية` : cat.nameAr}
            className="flex flex-1 items-center gap-2 text-sm font-medium text-start"
          >
            {hasChildren
              ? (isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />)
              : icon}
            <span className="flex-1">{cat.nameAr}</span>
          </button>
        ) : (
          <div className="flex flex-1 items-center gap-2 text-sm text-muted-foreground">
            {childIcon}
            <span className="flex-1">{cat.nameAr}</span>
          </div>
        )}

        {!cat.isActive && <Badge variant="secondary" className="text-xs">مخفية</Badge>}
        <span className="text-xs text-muted-foreground">{countLabel(cat)}</span>

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
        <EditButton category={cat} />
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
                {(cat.children as TCategory[]).map((child) => renderRow(child, true))}
              </div>
            )}
          </div>
        );
      })}

      {roots.length === 0 && (
        <div className="p-8 text-center text-sm text-muted-foreground">{emptyText}</div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`حذف "${deleteTarget?.nameAr}"؟`}
        description={deleteBlockedDescription}
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
