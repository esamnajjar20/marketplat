'use client';

import Link from 'next/link';
import { Folder, FolderInput } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/shared/ui/DropdownMenu';
import { useFavoriteLists } from '@/hooks/queries/useFavoriteLists';
import { useMoveFavoritesToList } from '@/hooks/mutations/useFavoriteListMutations';
import { ROUTES } from '@/lib/constants';

import { Spinner } from '@/components/ui/spinner';
interface Props {
  favoriteIds: string[];
  currentListId?: string | null;
  disabled?: boolean;
}

/**
 * Bulk-only list movement. Deliberately lives in the selection toolbar so
 * normal card browsing has no secondary "move" action on every card.
 */
export function MoveSelectedToListMenu({ favoriteIds, currentListId = null, disabled = false }: Props) {
  const { data: lists } = useFavoriteLists();
  const move = useMoveFavoritesToList();
  const items = lists ?? [];
  const count = favoriteIds.length;

  function moveTo(listId: string | null) {
    if (count === 0 || move.isPending || currentListId === listId) return;
    move.mutate({ favoriteIds, listId });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || count === 0}
          className="h-11 flex-1 gap-1.5 rounded-xl font-bold text-primary"
        >
          {move.isPending ? <Spinner size="xs" /> : <FolderInput className="h-4 w-4" aria-hidden />}
          نقل إلى قائمة
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 rounded-2xl p-1.5 shadow-lg">
        <DropdownMenuLabel className="px-2.5 py-2 text-sm font-bold">
          نقل {count} عنصر إلى
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={currentListId === null || move.isPending}
          onSelect={() => moveTo(null)}
          className="gap-2.5 rounded-xl px-2.5 py-2.5"
        >
          <Folder className="h-4 w-4 text-muted-foreground" />
          الكل (بدون قائمة)
        </DropdownMenuItem>
        {items.map((list) => (
          <DropdownMenuItem
            key={list.id}
            disabled={currentListId === list.id || move.isPending}
            onSelect={() => moveTo(list.id)}
            className="max-w-full gap-2.5 rounded-xl px-2.5 py-2.5"
          >
            <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{list.name}</span>
          </DropdownMenuItem>
        ))}
        {items.length === 0 && (
          <DropdownMenuItem asChild className="rounded-xl">
            <Link href={ROUTES.favorites}>لا قوائم — أنشئ قائمة من المفضلة</Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
