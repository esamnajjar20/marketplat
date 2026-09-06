'use client';

import { useState } from 'react';
import { FolderInput } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { useFavoriteLists } from '@/hooks/queries/useFavoriteLists';
import { useMoveFavoriteToList } from '@/hooks/mutations/useFavoriteListMutations';
import Link from 'next/link';
import { ROUTES } from '@/lib/constants';

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
        variant="outline"
        className="h-8 gap-1 px-2 text-xs"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <FolderInput className="h-3.5 w-3.5" />
        نقل إلى قائمة
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
            className="absolute end-0 z-20 min-w-[12rem] rounded-md border bg-card py-1 text-sm shadow-md"
          >
            <li className="border-b px-3 py-1.5 text-xs text-muted-foreground">اختر قائمة</li>
            <li>
              <button
                type="button"
                role="menuitem"
                disabled={currentListId == null || move.isPending}
                className="block w-full px-3 py-2 text-start hover:bg-muted disabled:opacity-50"
                onClick={() => {
                  move.mutate({ favoriteId, listId: null }, { onSuccess: () => setOpen(false) });
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
                  className="block w-full px-3 py-2 text-start hover:bg-muted disabled:opacity-50"
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
              <li className="px-3 py-2 text-xs text-muted-foreground">
                لا قوائم بعد —{' '}
                <Link href={ROUTES.favorites} className="text-primary hover:underline" onClick={() => setOpen(false)}>
                  أنشئ من المفضلة
                </Link>
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
