'use client';

/**
 * شريط قوائم المفضلة — أزرار التعديل/الحذف في نهاية الصف (لا تغطي الاسم).
 */

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FolderPlus, Pencil, Trash2, List } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { useFavoriteLists } from '@/hooks/queries/useFavoriteLists';
import {
  useCreateFavoriteList,
  useRenameFavoriteList,
  useDeleteFavoriteList,
} from '@/hooks/mutations/useFavoriteListMutations';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';

export function FavoriteListsSidebar({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const sp = useSearchParams();
  const activeListId = sp.get('list') ?? null;

  const { data: lists, isLoading } = useFavoriteLists();
  const createList = useCreateFavoriteList();
  const renameList = useRenameFavoriteList();
  const deleteList = useDeleteFavoriteList();

  const [newName, setNewName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  function selectList(listId: string | null) {
    const params = new URLSearchParams(sp.toString());
    if (listId) params.set('list', listId);
    else params.delete('list');
    params.delete('page');
    const qs = params.toString();
    // switching lists within /favorites is a
    // refinement of the same view — using push made Back require N
    // presses after N list switches. Matches the admin tables' pattern.
    router.replace(qs ? `${ROUTES.favorites}?${qs}` : ROUTES.favorites);
  }

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    createList.mutate(name, {
      onSuccess: (created) => {
        setNewName('');
        setShowCreate(false);
        // افتح القائمة الجديدة فورًا ليرى المستخدم محتواها (فارغة أولاً)
        if (created?.id) selectList(created.id);
      },
    });
  }

  function onRename(e: React.FormEvent) {
    e.preventDefault();
    if (!renameId || !renameValue.trim()) return;
    renameList.mutate(
      { listId: renameId, name: renameValue.trim() },
      { onSuccess: () => setRenameId(null) }
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  const items = lists ?? [];

  return (
    <aside
      className={cn(
        embedded
          ? 'space-y-3'
          : 'space-y-3 rounded-2xl border border-border/70 bg-card p-4 shadow-xs lg:sticky lg:top-24',
      )}
      aria-label="قوائم المفضلة"
    >
      {!embedded && (
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-extrabold">قوائمي</h2>
            <p className="text-xs text-muted-foreground">نظّم العناصر المحفوظة ضمن قوائمك الخاصة.</p>
          </div>
          <Button
            type="button"
            size="sm"
            className="h-9 gap-1 rounded-xl font-bold"
            onClick={() => setShowCreate((v) => !v)}
          >
            <FolderPlus className="h-3.5 w-3.5" />
            جديدة
          </Button>
        </div>
      )}

      {embedded && (
        <Button
          type="button"
          size="sm"
          className="h-10 w-full gap-1.5 rounded-xl font-bold"
          onClick={() => setShowCreate((v) => !v)}
        >
          <FolderPlus className="h-4 w-4" />
          جديدة
        </Button>
      )}

      {showCreate && (
        <form onSubmit={onCreate} className="flex gap-2 rounded-xl border border-border bg-background p-1.5">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="مثلاً: سيارات"
            maxLength={40}
            className="h-10 border-0 shadow-none focus-visible:ring-0"
            autoFocus
          />
          <Button
            type="submit"
            size="sm"
            className="h-10 shrink-0 rounded-xl font-bold"
            disabled={createList.isPending || !newName.trim()}
          >
            إضافة
          </Button>
        </form>
      )}

      <nav className="overflow-hidden rounded-2xl border border-border/70 bg-card divide-y divide-border/60" aria-label="قوائم المفضلة">
        <button
          type="button"
          onClick={() => selectList(null)}
          className={cn(
            'flex w-full items-center justify-between gap-2 px-3.5 py-3 text-sm transition-colors',
            !activeListId
              ? 'bg-primary-soft font-bold text-primary'
              : 'font-medium text-foreground hover:bg-muted/40',
          )}
        >
          <span className="flex items-center gap-2">
            <List className="h-4 w-4 shrink-0 opacity-70" />
            الكل
          </span>
        </button>

        {items.map((list) => (
          <div key={list.id}>
            {renameId === list.id ? (
              <form onSubmit={onRename} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="h-10 min-w-0 flex-1 rounded-xl text-sm"
                  maxLength={40}
                  autoFocus
                />
                <Button type="submit" size="sm" className="h-9 rounded-xl font-bold" disabled={renameList.isPending}>
                  حفظ
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-xl"
                  onClick={() => setRenameId(null)}
                >
                  إلغاء
                </Button>
              </form>
            ) : (
              <div
                className={cn(
                  'flex items-center gap-1 px-1.5 py-1',
                  activeListId === list.id && 'bg-primary-soft/60',
                )}
              >
                <button
                  type="button"
                  onClick={() => selectList(list.id)}
                  className={cn(
                    'min-w-0 flex-1 truncate rounded-xl px-2 py-2.5 text-start text-sm',
                    activeListId === list.id
                      ? 'font-bold text-primary'
                      : 'font-medium text-foreground',
                  )}
                >
                  {list.name}
                  <span className="ms-1.5 tabular-nums text-xs text-muted-foreground">
                    {list.itemsCount}
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-0.5 pe-1">
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`إعادة تسمية ${list.name}`}
                    title="إعادة تسمية"
                    onClick={() => {
                      setRenameId(list.id);
                      setRenameValue(list.name);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`حذف ${list.name}`}
                    title="حذف القائمة"
                    onClick={() => setDeleteTarget({ id: list.id, name: list.name })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </nav>

      {items.length === 0 && !showCreate && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          أنشئ قائمة (مثل «هواتف») ثم من شبكة المفضلة اضغط «نقل إلى قائمة».
        </p>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="حذف القائمة؟"
        description={
          deleteTarget
            ? `سيتم حذف «${deleteTarget.name}». العناصر تبقى في «الكل».`
            : undefined
        }
        confirmLabel="حذف"
        destructive
        isPending={deleteList.isPending}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteList.mutate(deleteTarget.id, {
            onSuccess: () => {
              if (activeListId === deleteTarget.id) selectList(null);
              setDeleteTarget(null);
            },
          });
        }}
      />
    </aside>
  );
}
