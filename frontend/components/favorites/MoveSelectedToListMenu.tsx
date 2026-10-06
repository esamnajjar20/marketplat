'use client';

import Link from 'next/link';
import { FolderInput, Loader2 } from 'lucide-react';
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
          size="sm"
          variant="outline"
          disabled={disabled || count === 0}
          className="gap-1.5"
        >
          {move.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderInput className="h-3.5 w-3.5" aria-hidden />}
          نقل إلى قائمة
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-60">
        <DropdownMenuLabel>نقل {count} عنصر إلى</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={currentListId === null || move.isPending}
          onSelect={() => moveTo(null)}
        >
          الكل (بدون قائمة)
        </DropdownMenuItem>
        {items.map((list) => (
          <DropdownMenuItem
            key={list.id}
            disabled={currentListId === list.id || move.isPending}
            onSelect={() => moveTo(list.id)}
            className="max-w-full"
          >
            <span className="truncate">{list.name}</span>
            <span className="ms-auto text-xs text-muted-foreground">{list.itemsCount}</span>
          </DropdownMenuItem>
        ))}
        {items.length === 0 && (
          <DropdownMenuItem asChild>
            <Link href={ROUTES.favorites}>لا قوائم — أنشئ قائمة من المفضلة</Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
