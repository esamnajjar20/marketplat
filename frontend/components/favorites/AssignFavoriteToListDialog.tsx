'use client';

/**
 * بعد إضافة إعلان للمفضلة: خيار اختياري لتعيين قائمة.
 * «تخطي» = يبقى في «الكل».
 */

import { useEffect, useState } from 'react';
import { FolderPlus } from 'lucide-react';
import { favoritesApi } from '@/api/favorites.api';
import { useFavoriteLists } from '@/hooks/queries/useFavoriteLists';
import { useCreateFavoriteList, useMoveFavoriteToList } from '@/hooks/mutations/useFavoriteListMutations';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { toast } from 'sonner';

interface Props {
  adId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** يدعم getAll سواء أرجعت صفحة مفكوكة أو AxiosResponse */
function extractFavoriteItems(page: unknown): Array<{ id: string; ad?: { id: string }; adId?: string }> {
  if (!page || typeof page !== 'object') return [];
  const p = page as Record<string, unknown>;

  // unwrapPaginated shape: { items, meta }
  if (Array.isArray(p.items)) return p.items as Array<{ id: string; ad?: { id: string }; adId?: string }>;

  // AxiosResponse: { data: ApiResponse<...> }
  const data = p.data as Record<string, unknown> | undefined;
  if (data && typeof data === 'object') {
    const inner = data.data as unknown;
    if (Array.isArray(inner)) {
      return inner as Array<{ id: string; ad?: { id: string }; adId?: string }>;
    }
    if (inner && typeof inner === 'object' && Array.isArray((inner as { items?: unknown }).items)) {
      return (inner as { items: Array<{ id: string; ad?: { id: string }; adId?: string }> }).items;
    }
    if (Array.isArray(data.items)) {
      return data.items as Array<{ id: string; ad?: { id: string }; adId?: string }>;
    }
  }

  return [];
}

export function AssignFavoriteToListDialog({ adId, open, onOpenChange }: Props) {
  const { data: lists, isLoading } = useFavoriteLists();
  const createList = useCreateFavoriteList();
  const move = useMoveFavoriteToList();
  const [favoriteId, setFavoriteId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [newName, setNewName] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!open || !adId) {
      setFavoriteId(null);
      return;
    }
    let cancelled = false;
    setResolving(true);
    void favoritesApi
      .getAll({ page: 1, limit: 50 })
      .then((page) => {
        if (cancelled) return;
        const items = extractFavoriteItems(page);
        const row = items.find((f) => f.ad?.id === adId || f.adId === adId);
        setFavoriteId(row?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setFavoriteId(null);
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, adId]);

  if (!open) return null;

  function assign(listId: string | null) {
    if (!favoriteId) {
      toast.message('تم الحفظ في المفضلة', {
        description: 'يمكنك نقل العنصر لاحقًا من صفحة المفضلة',
      });
      onOpenChange(false);
      return;
    }
    move.mutate(
      { favoriteId, listId },
      {
        onSuccess: () => onOpenChange(false),
      }
    );
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    createList.mutate(name, {
      onSuccess: (list) => {
        setNewName('');
        setShowCreate(false);
        if (list?.id) assign(list.id);
      },
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="إغلاق"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-labelledby="assign-list-title"
        className="relative z-10 w-full max-w-md rounded-t-2xl border bg-card p-4 shadow-xl sm:rounded-2xl"
      >
        <h2 id="assign-list-title" className="text-base font-semibold">
          إضافة إلى قائمة؟
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          اختياري — يمكنك التخطي والإبقاء في «الكل»، أو اختيار قائمة الآن.
        </p>

        {isLoading || resolving ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : (
          <ul className="mt-4 max-h-56 space-y-1 overflow-y-auto">
            <li>
              <button
                type="button"
                className="w-full rounded-lg px-3 py-2.5 text-start text-sm hover:bg-muted"
                onClick={() => assign(null)}
                disabled={move.isPending}
              >
                الكل (بدون قائمة)
              </button>
            </li>
            {(lists ?? []).map((list) => (
              <li key={list.id}>
                <button
                  type="button"
                  className="w-full rounded-lg px-3 py-2.5 text-start text-sm hover:bg-muted"
                  onClick={() => assign(list.id)}
                  disabled={move.isPending}
                >
                  {list.name}
                  <span className="ms-1 text-xs text-muted-foreground">({list.itemsCount})</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {showCreate ? (
          <form onSubmit={handleCreate} className="mt-3 flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="اسم القائمة"
              maxLength={40}
              className="h-9"
              autoFocus
            />
            <Button type="submit" size="sm" disabled={createList.isPending || !newName.trim()}>
              إنشاء
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 gap-1"
            onClick={() => setShowCreate(true)}
          >
            <FolderPlus className="h-4 w-4" />
            قائمة جديدة
          </Button>
        )}

        <div className="mt-4 flex justify-end gap-2 border-t pt-3">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            تخطي
          </Button>
        </div>
      </div>
    </div>
  );
}

