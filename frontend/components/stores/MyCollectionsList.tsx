'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Layers, Plus, Pencil, Trash2, ChevronUp, ChevronDown, PackagePlus, AlertTriangle, EyeOff, Check, Square, CheckSquare, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { AdListItemSkeleton } from '@/components/shared/skeletons/AdListItemSkeleton';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { CollectionForm } from './CollectionForm';
import { useMyCollections } from '@/hooks/queries/useCollections';
import { useDeleteCollection, useReorderCollections } from '@/hooks/mutations/useCollectionMutations';
import { getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { ROUTES } from '@/lib/constants';
import type { StoreCollectionWithCount } from '@/types/collection.types';

/**
 * COLLECTIONS (P1): owner-facing collections tab — mirrors
 * MyPromotionsList.tsx's structure (skeleton/error/empty states, row
 * actions, create dialog reused for edit). No pagination, same "MVP
 * list size" reasoning promotions.api.ts's getMine() gives — a store's
 * collection count is expected to stay small.
 *
 * Reordering uses move-up/move-down buttons rather than drag-and-drop:
 * there is no drag library anywhere else in this codebase (see
 * ImageUpload.tsx's own reorder, which is native HTML5 DnD plus the
 * same keyboard-reachable move buttons as the fallback path) — buttons
 * alone keep this consistent and fully keyboard/screen-reader
 * reachable without adding a new dependency for four-or-so rows.
 */
export function MyCollectionsList() {
  const { data: collections, isLoading, isError, refetch } = useMyCollections();
  const deleteCollection = useDeleteCollection();
  const reorder = useReorderCollections();

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StoreCollectionWithCount | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  // BULK-COLLECTIONS-01: multi-select + bulk delete.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => <AdListItemSkeleton key={i} />)}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل المجموعات</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const items = collections ?? [];

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const orderedIds = items.map((c) => c.id);
    const current = orderedIds[index];
    const swapped = orderedIds[target];
    if (current === undefined || swapped === undefined) return;
    orderedIds[index] = swapped;
    orderedIds[target] = current;
    reorder.mutate({ orderedIds });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkDelete() {
    setConfirmBulkDelete(false);
    setBulkBusy(true);
    const ids = Array.from(selected);
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      try {
        await deleteCollection.mutateAsync(id);
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    setBulkBusy(false);
    setSelected(new Set());
    setSelectionMode(false);
    if (fail === 0) toast.success(`حُذف ${ok} مجموعة`);
    else toast.error(`حُذف ${ok} · فشل ${fail}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-semibold">مجموعات المتجر</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => { setSelectionMode((v) => !v); setSelected(new Set()); }}
          >
            {selectionMode ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            {selectionMode ? 'إلغاء التحديد' : 'تحديد'}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => { setEditTarget(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4" />مجموعة جديدة
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Layers className="h-10 w-10" />}
          title="لا توجد مجموعات"
          description="نظّم منتجاتك في مجموعات (مثل تشكيلة موسمية أو فئة مميزة) لتظهر في صفحة متجرك"
          action={<Button onClick={() => setFormOpen(true)}>مجموعة جديدة</Button>}
        />
      ) : (
        <div className="space-y-3">
          {items.map((collection, index) => {
            const cover = collection.imageUrl ? getThumbnailUrl(collection.imageUrl, 96, 96) : PLACEHOLDER_SVG;
            return (
              <div
                key={collection.id}
                onClick={selectionMode ? () => toggleSelect(collection.id) : undefined}
                className={`flex flex-col gap-3 p-3 rounded-lg border bg-card sm:flex-row sm:items-center sm:justify-between ${selectionMode ? 'cursor-pointer' : ''} ${selected.has(collection.id) ? 'border-primary/40 bg-primary/10' : ''}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {selectionMode && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleSelect(collection.id); }}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded border bg-background"
                      aria-label={selected.has(collection.id) ? 'إلغاء التحديد' : 'تحديد'}
                    >
                      {selected.has(collection.id) && <Check className="h-4 w-4" />}
                    </button>
                  )}
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                    <SafeImage src={cover} alt="" fill className="object-cover" sizes="56px" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{collection.name}</span>
                      {!collection.isActive && (
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <EyeOff className="h-3 w-3" />مخفية
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {collection._count.products} منتج{collection.description ? ` · ${collection.description}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
                  <div className="flex flex-col">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={index === 0 || reorder.isPending}
                      onClick={() => move(index, -1)}
                      aria-label="نقل لأعلى"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={index === items.length - 1 || reorder.isPending}
                      onClick={() => move(index, 1)}
                      aria-label="نقل لأسفل"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>
                  <Link href={ROUTES.myStoreCollectionManage(collection.id)}>
                    <Button variant="ghost" size="sm" className="gap-1.5">
                      <PackagePlus className="h-3.5 w-3.5" />المنتجات
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => { setEditTarget(collection); setFormOpen(true); }}
                    aria-label="تعديل"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteTargetId(collection.id)}
                    aria-label="حذف"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectionMode && (
        <div className="sticky bottom-2 z-10 flex items-center justify-between gap-2 rounded-lg border bg-card p-2 shadow-lg">
          <span className="text-sm font-medium">{selected.size} محدد</span>
          <div className="flex gap-1">
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => setConfirmBulkDelete(true)}
              disabled={bulkBusy || selected.size === 0}
            >
              {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              حذف
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSelectionMode(false); setSelected(new Set()); }}
              disabled={bulkBusy}
            >
              إلغاء
            </Button>
          </div>
        </div>
      )}

      <CollectionForm open={formOpen} onOpenChange={setFormOpen} collection={editTarget} />

      <ConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}
        title="حذف المجموعة؟"
        description="سيتم حذف المجموعة نهائياً. المنتجات نفسها تبقى في متجرك ولن يتم حذفها."
        confirmLabel="حذف المجموعة"
        destructive
        isPending={deleteCollection.isPending}
        onConfirm={() => {
          if (!deleteTargetId) return;
          deleteCollection.mutate(deleteTargetId, { onSuccess: () => setDeleteTargetId(null) });
        }}
      />

      <ConfirmDialog
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        title={`حذف ${selected.size} مجموعة؟`}
        description="سيتم حذف المجموعات نهائياً. المنتجات نفسها تبقى في متجرك."
        confirmLabel="حذف المجموعات"
        destructive
        isPending={bulkBusy}
        onConfirm={() => void bulkDelete()}
      />
    </div>
  );
}
