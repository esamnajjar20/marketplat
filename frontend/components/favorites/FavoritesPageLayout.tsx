'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FolderOpen, Plus } from 'lucide-react';
import { FavoriteListsSidebar } from '@/components/favorites/FavoriteListsSidebar';
import { FavoritesTabs } from '@/components/profile/FavoritesTabs';
import { useFavoriteLists } from '@/hooks/queries/useFavoriteLists';
import { useCreateFavoriteList } from '@/hooks/mutations/useFavoriteListMutations';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/shared/ui/Sheet';

function ListChipsBar({ onOpenLists }: { onOpenLists: () => void }) {
  const router = useRouter();
  const sp = useSearchParams();
  const activeListId = sp.get('list') ?? null;
  const { data: lists } = useFavoriteLists();
  const createList = useCreateFavoriteList();
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [newName, setNewName] = useState('');

  const items = lists ?? [];

  function selectList(listId: string | null) {
    const params = new URLSearchParams(sp.toString());
    if (listId) params.set('list', listId);
    else params.delete('list');
    params.delete('page');
    const qs = params.toString();
    router.replace(qs ? `${ROUTES.favorites}?${qs}` : ROUTES.favorites);
  }

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    createList.mutate(name, {
      onSuccess: (created) => {
        setNewName('');
        setShowQuickCreate(false);
        if (created?.id) selectList(created.id);
      },
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => selectList(null)}
          className={cn(
            'h-9 shrink-0 rounded-full border px-3.5 text-xs font-bold transition-colors',
            !activeListId
              ? 'border-primary bg-primary text-primary-foreground shadow-xs'
              : 'border-border bg-card text-muted-foreground hover:text-foreground',
          )}
        >
          الكل
        </button>
        {items.map((list) => (
          <button
            key={list.id}
            type="button"
            onClick={() => selectList(list.id)}
            className={cn(
              'h-9 shrink-0 rounded-full border px-3.5 text-xs font-bold transition-colors',
              activeListId === list.id
                ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            {list.name}
            {typeof list.itemsCount === 'number' ? ` (${list.itemsCount})` : ''}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowQuickCreate((v) => !v)}
          className="flex h-9 shrink-0 items-center gap-1 rounded-full border border-dashed border-border bg-card px-3 text-xs font-bold text-muted-foreground hover:border-primary/40 hover:text-primary"
        >
          <Plus className="h-3.5 w-3.5" />
          جديدة
        </button>
      </div>

      {showQuickCreate && (
        <form onSubmit={onCreate} className="flex max-w-md gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="مثلاً: سيارات"
            maxLength={40}
            className="h-10 rounded-xl"
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

      {/* Mobile only — on lg the sticky sidebar replaces this entry point */}
      <div className="flex items-center justify-between gap-2 lg:hidden">
        <button
          type="button"
          onClick={onOpenLists}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-bold text-foreground shadow-xs hover:border-primary/30"
        >
          <FolderOpen className="h-3.5 w-3.5 text-primary" />
          قوائمي
        </button>
      </div>
    </div>
  );
}

function ActiveListBanner() {
  const sp = useSearchParams();
  const listId = sp.get('list');
  const { data: lists } = useFavoriteLists();
  if (!listId || !lists) return null;
  const list = lists.find((l) => l.id === listId);
  if (!list) return null;

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-primary-soft px-3.5 py-2.5 text-sm"
      role="status"
    >
      <span className="font-bold text-primary">القائمة الحالية: {list.name}</span>
      <span className="rounded-full bg-card/80 px-2.5 py-0.5 text-xs font-bold text-primary">
        {list.itemsCount} عنصر
      </span>
    </div>
  );
}

export function FavoritesPageLayout() {
  const [listsOpen, setListsOpen] = useState(false);

  // Close mobile lists sheet when viewport crosses into desktop (lg).
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => {
      if (mq.matches) setListsOpen(false);
    };
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return (
    <div className="space-y-4 sm:space-y-5">
      <Suspense>
        <ListChipsBar onOpenLists={() => setListsOpen(true)} />
      </Suspense>

      <Suspense>
        <ActiveListBanner />
      </Suspense>

      {/* Desktop: sidebar + content | Mobile: content only (lists via sheet) */}
      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start lg:gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <Suspense>
            <FavoriteListsSidebar />
          </Suspense>
        </aside>

        <section className="min-w-0" aria-label="محتوى المفضلة">
          <Suspense>
            <FavoritesTabs />
          </Suspense>
        </section>
      </div>

      {/* Mobile sheet for managing lists — only mount when open to avoid desktop overlay edge cases */}
      <Sheet open={listsOpen} onOpenChange={setListsOpen}>
        <SheetContent className="max-h-[85vh] rounded-t-3xl px-0 pb-6">
          <SheetHeader className="px-4 text-start">
            <SheetTitle className="text-lg font-extrabold">قوائمي</SheetTitle>
            <SheetDescription>نظّم العناصر المحفوظة ضمن قوائمك الخاصة.</SheetDescription>
          </SheetHeader>
          <div className="mt-3 max-h-[65vh] overflow-y-auto px-4">
            <Suspense>
              <FavoriteListsSidebar embedded />
            </Suspense>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
