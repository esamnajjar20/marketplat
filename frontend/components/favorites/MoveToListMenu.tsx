'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const items = lists ?? [];

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const menuWidth = 200;
    let left = r.left;
    if (left + menuWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - menuWidth - 8);
    }
    // افتح للأعلى إن لم تسع المساحة تحت
    const spaceBelow = window.innerHeight - r.bottom;
    const top = spaceBelow < 220 ? Math.max(8, r.top - 200) : r.bottom + 4;
    setPos({ top, left });
  }, [open]);

  const menu =
    open &&
    typeof document !== 'undefined' &&
    createPortal(
      <>
        <button
          type="button"
          className="fixed inset-0 z-[200] cursor-default"
          aria-label="إغلاق"
          onClick={() => setOpen(false)}
        />
        <ul
          role="menu"
          className="fixed z-[210] min-w-[12rem] max-h-56 overflow-y-auto rounded-md border bg-card py-1 text-sm shadow-lg"
          style={{ top: pos.top, left: pos.left }}
        >
          {/* SW-FIX-MTLM-LI-ROLE: ARIA spec requires children of a
              role="menu" list to be menuitem or presentation. The
              header <li> had neither — some screen readers skipped it
              or announced it oddly. aria-hidden removes it from the
              a11y tree entirely, since the menuitems themselves are
              self-explanatory ("الكل بدون قائمة", list names). */}
          <li role="presentation" aria-hidden className="border-b px-3 py-1.5 text-xs text-muted-foreground">اختر قائمة</li>
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
              لا قوائم —{' '}
              <Link href={ROUTES.favorites} className="text-primary hover:underline">
                أنشئ من المفضلة
              </Link>
            </li>
          )}
        </ul>
      </>,
      document.body
    );

  return (
    <div className={className}>
      <Button
        ref={btnRef}
        type="button"
        size="sm"
        variant="outline"
        className="h-8 w-full gap-1 px-2 text-xs"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <FolderInput className="h-3.5 w-3.5" />
        نقل إلى قائمة
      </Button>
      {menu}
    </div>
  );
}
