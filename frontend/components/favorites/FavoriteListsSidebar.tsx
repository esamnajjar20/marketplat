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

export function FavoriteListsSidebar() {
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
    <aside className="rounded-xl border bg-surface-1 p-3 sm:p-4 lg:sticky lg:top-24" aria-label="قوائم المفضلة">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">قوائمي</h2>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-h-10 gap-1 px-2.5"
          onClick={() => setShowCreate((v) => !v)}
        >
          <FolderPlus className="h-3.5 w-3.5" />
          جديدة
        </Button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        من صفحة المفضلة: استخدم «نقل إلى قائمة» على أي عنصر. أو أنشئ قائمة ثم انقل العناصر إليها.
      </p>

      {showCreate && (
        <form onSubmit={onCreate} className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="مثلاً: سيارات"
            maxLength={40}
            className="h-9"
            autoFocus
          />
          <Button type="submit" size="sm" disabled={createList.isPending || !newName.trim()}>
            إضافة
          </Button>
        </form>
      )}

      <nav className="space-y-0.5" aria-label="قوائم المفضلة">
        <button
          type="button"
          onClick={() => selectList(null)}
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors',
            !activeListId
              ? 'bg-primary/10 font-medium text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <List className="h-4 w-4 shrink-0" />
          <span className="truncate">الكل</span>
        </button>

        {items.map((list) => (
          <div key={list.id} className="rounded-md">
            {renameId === list.id ? (
              <form onSubmit={onRename} className="flex gap-1 px-1 py-1">
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="h-8 text-sm"
                  maxLength={40}
                  autoFocus
                />
                <Button type="submit" size="sm" className="h-8 shrink-0 px-2" disabled={renameList.isPending}>
                  حفظ
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 shrink-0 px-2"
                  onClick={() => setRenameId(null)}
                >
                  إلغاء
                </Button>
              </form>
            ) : (
              <div
                className={cn(
                  'flex items-center gap-1 rounded-md px-1 py-0.5',
                  activeListId === list.id ? 'bg-primary/10' : 'hover:bg-muted/80'
                )}
              >
                <button
                  type="button"
                  onClick={() => selectList(list.id)}
                  className={cn(
                    'min-w-0 flex-1 truncate rounded-md px-2 py-2 text-start text-sm',
                    activeListId === list.id
                      ? 'font-medium text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {list.name}
                  <span className="ms-1 tabular-nums text-xs opacity-70">({list.itemsCount})</span>
                </button>
                {/* أزرار في نهاية الصف — لا تغطي الاسم */}
                <div className="flex shrink-0 items-center gap-0.5 pe-1">
                  <button
                    type="button"
                    className="min-h-10 min-w-10 rounded-md p-2 text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    className="min-h-10 min-w-10 rounded-md p-2 text-muted-foreground hover:bg-background hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        <p className="text-xs text-muted-foreground">
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
