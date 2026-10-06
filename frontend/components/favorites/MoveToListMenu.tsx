'use client';

import { FolderInput } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/shared/ui/DropdownMenu';
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
  const items = lists ?? [];

  return (
    <div className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-10 w-full gap-1.5 px-2 text-xs sm:min-h-9"
          >
            <FolderInput className="h-3.5 w-3.5" aria-hidden />
            نقل إلى قائمة
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} className="w-56">
          <DropdownMenuLabel>اختر قائمة</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={currentListId == null || move.isPending}
            onSelect={() => move.mutate({ favoriteId, listId: null })}
          >
            الكل (بدون قائمة)
          </DropdownMenuItem>
          {items.map((list) => (
            <DropdownMenuItem
              key={list.id}
              disabled={currentListId === list.id || move.isPending}
              onSelect={() => move.mutate({ favoriteId, listId: list.id })}
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
    </div>
  );
}
