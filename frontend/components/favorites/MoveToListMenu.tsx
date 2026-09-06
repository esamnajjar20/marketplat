'use client';

/**
 * قائمة منسدلة بسيطة لنقل عنصر مفضلة إلى قائمة.
 * تُستخدم على كل بطاقة في FavoritesList.
 */

import { useState } from 'react';
import { FolderInput } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { useFavoriteLists } from '@/hooks/queries/useFavoriteLists';
import { useMoveFavoriteToList } from '@/hooks/mutations/useFavoriteListMutations';

interface Props {
  favoriteId: string;
  currentListId?: string | null;
  className?: string;
}

export function MoveToListMenu({ favoriteId, currentListId = null, className }: Props) {
  const { data: lists } = useFavoriteLists();
  const move = useMoveFavoriteToList();
  const [open, setOpen] = useState(false);

  const items = lists ?? [];

  return (
    <div className={`relative ${className ?? ''}`}>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 gap-1 px-2 text-xs"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <FolderInput className="h-3.5 w-3.5" />
        نقل
      </Button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            aria-label="إغلاق"
            onClick={() => setOpen(false)}
          />
          <ul
            role="menu"
            className="absolute end-0 z-20 min-w-[10rem] rounded-md border bg-card py-1 text-sm shadow-md"
          >
            <li>
              <button
                type="button"
                role="menuitem"
                disabled={currentListId == null || move.isPending}
                className="block w-full px-3 py-1.5 text-start hover:bg-muted disabled:opacity-50"
                onClick={() => {
                  move.mutate(
                    { favoriteId, listId: null },
                    { onSuccess: () => setOpen(false) }
                  );
                }}
              >
                الكل (بدون قائمة)
              </button>
            </li>
            {items.map((list) => (
              <li key={list.id}>
                <button
                  type="button"
                  role="menuitem"
                  disabled={currentListId === list.id || move.isPending}
                  className="block w-full px-3 py-1.5 text-start hover:bg-muted disabled:opacity-50"
                  onClick={() => {
                    move.mutate(
                      { favoriteId, listId: list.id },
                      { onSuccess: () => setOpen(false) }
                    );
                  }}
                >
                  {list.name}
                </button>
              </li>
            ))}
            {items.length === 0 && (
              <li className="px-3 py-2 text-xs text-muted-foreground">لا توجد قوائم بعد</li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
