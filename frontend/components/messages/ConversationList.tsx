'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { MessageSquare, Search, X } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { useMyConversations } from '@/hooks/queries/useConversations';
import { usePresence } from '@/hooks/queries/usePresence';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { useDeleteConversation, useSetConversationFlags } from '@/hooks/mutations/useConversationMutations';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { Conversation, ConversationListItem } from '@/types/conversation.types';
import { ConversationRow } from './ConversationRow';
import { Skeleton } from '@/components/ui/skeleton';

import { Spinner } from '@/components/ui/spinner';
import { PullToRefresh } from '@/components/shared/ui/PullToRefresh';
/** Whichever side the caller ISN'T — the person this thread is with. */
function otherParty(conversation: Conversation, userId: string | undefined) {
  return conversation.buyerId === userId ? conversation.seller : conversation.buyer;
}

function contextLabel(conversation: ConversationListItem): string | null {
  if (conversation.context?.title) return conversation.context.title;
  if (conversation.ad?.title) return conversation.ad.title;
  if (conversation.serviceRequest?.listing?.title) return conversation.serviceRequest.listing.title;
  return null;
}

const PAGE_SIZE = 20;

interface Props {
  selectedId?: string;
}

export function ConversationList({ selectedId }: Props = {}) {
  const user = useAuthStore(selectUser);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [query, setQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [archivedOnly, setArchivedOnly] = useState(false);
  const [inbox, setInbox] = useState<'all' | 'users' | 'stores'>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [pendingFlagId, setPendingFlagId] = useState<string | null>(null);
  const { mutate: setFlags } = useSetConversationFlags();

  // Keep every filter-reset action in sync. In particular, the empty-state
  // action must also clear archivedOnly or the list remains stuck in archive.
  const clearFilters = useCallback(() => {
    setQuery('');
    setUnreadOnly(false);
    setArchivedOnly(false);
    setInbox('all');
  }, []);

  const handleSetFlags = useCallback((input: { id: string; pinned?: boolean; archived?: boolean; mutedUntil?: string | null }) => {
    setPendingFlagId(input.id);
    setFlags(input, { onSettled: () => setPendingFlagId(null) });
  }, [setFlags]);

  const { mutate: deleteConversation, isPending: deletingConversation } = useDeleteConversation();
  const { data, isLoading, isError, refetch, isFetching } = useMyConversations({
    page: 1,
    limit,
    ...(archivedOnly ? { archivedOnly: true } : {}),
  });

  const items = useMemo(() => [...(data?.items ?? [])].sort((a, b) => {
    const ap = Boolean(a.mySettings?.pinnedAt);
    const bp = Boolean(b.mySettings?.pinnedAt);
    if (ap !== bp) return ap ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  }), [data?.items]);
  const hasMore = Boolean(data?.meta?.hasNextPage);
  const loadingMore = isFetching && !isLoading;

  const otherPartyIds = items.slice(0, 50).map((c) => (c.buyerId === user?.id ? c.seller : c.buyer).id);
  const { data: onlineMap } = usePresence(otherPartyIds);

  const filtered = useMemo(() => {
    let list = items;
    if (inbox === 'stores') list = list.filter((c) => c.context?.type === 'product');
    if (inbox === 'users') list = list.filter((c) => c.context?.type !== 'product');
    if (unreadOnly) list = list.filter((c) => c.unreadCount > 0);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => {
      const party = otherParty(c, user?.id);
      const ctx = contextLabel(c) ?? '';
      const preview = c.lastMessage?.body ?? '';
      return (
        party.name.toLowerCase().includes(q) ||
        ctx.toLowerCase().includes(q) ||
        preview.toLowerCase().includes(q)
      );
    });
  }, [items, query, unreadOnly, inbox, user?.id]);

  const totalUnread = useMemo(
    () => items.reduce((sum, c) => sum + (c.unreadCount > 0 ? 1 : 0), 0),
    [items],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-0 divide-y" role="status" aria-label="جارٍ التحميل">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-4">
            <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-4 my-6 rounded-2xl border border-border bg-card p-6 text-center shadow-xs">
        <p className="font-bold text-destructive">حدث خطأ أثناء تحميل المحادثات</p>
        <p className="mt-1.5 text-sm text-muted-foreground">تحقق من الاتصال ثم أعد المحاولة</p>
        <Button type="button" size="sm" variant="outline" className="mt-4 rounded-xl" onClick={() => refetch()}>
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  // Only show the "no conversations yet" onboarding state when no filter is
  // active. `archivedOnly` is applied server-side, so an empty archive also
  // yields `items.length === 0`; returning early there would hide the filter
  // tabs and leave the user stuck in the archive with no way to clear it.
  const hasActiveFilter = archivedOnly || unreadOnly || inbox !== 'all' || query.trim() !== '';
  if (items.length === 0 && !hasActiveFilter) {
    return (
      <div className="mx-4 my-8 rounded-2xl border border-border bg-card p-7 text-center shadow-xs">
        <div className="mx-auto mb-3.5 flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-primary">
          <MessageSquare className="h-7 w-7" />
        </div>
        <h2 className="text-base font-bold text-foreground">لا توجد محادثات بعد</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          ابدأ من إعلان أو خدمة عبر «راسل البائع» — المحادثات تظهر هنا مع آخر رسالة وعدد غير المقروء.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          <Button asChild size="sm" className="rounded-xl">
            <Link prefetch={false} href={`${ROUTES.search}?type=ads`}>تصفّح الإعلانات</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="rounded-xl">
            <Link href={ROUTES.home}>الرئيسية</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={() => refetch()} className="native-inbox-root h-full min-h-0">
    <div className="native-inbox-panel flex flex-col rounded-[var(--radius-card)] border border-border/70 bg-card shadow-xs overflow-hidden md:rounded-none md:border-0 md:shadow-none md:h-full">
      {/* Desktop sticky header — aligned with mobile design language */}
      <div className="hidden md:flex sticky top-0 z-10 flex-col gap-2.5 border-b border-border/60 bg-background/95 backdrop-blur-sm px-3 py-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="text-base font-extrabold tracking-tight">الرسائل</h2>
          {totalUnread > 0 && (
            <span
              aria-label={`${totalUnread} محادثة غير مقروءة`}
              className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary"
            >
              {totalUnread} غير مقروءة
            </span>
          )}
        </div>
        <div className="flex gap-2 px-1 overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="مصدر المحادثة">
          {([['all', 'الكل'], ['users', 'شخصي'], ['stores', 'متجر']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={inbox === value}
              onClick={() => setInbox(value)}
              className={cn(
                'min-h-9 shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors',
                inbox === value
                  ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative px-1">
          <Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث في المحادثات…"
            className="w-full min-h-11 rounded-xl border border-border bg-card py-2.5 pe-9 ps-9 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15"
            aria-label="بحث في المحادثات"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute end-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="مسح البحث"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-5 border-b border-border/80 px-1" role="tablist" aria-label="حالة المحادثة">
          {[
            { value: 'all' as const, label: 'الكل', active: !unreadOnly && !archivedOnly },
            { value: 'unread' as const, label: `غير مقروء${totalUnread > 0 ? ` (${totalUnread})` : ''}`, active: unreadOnly && !archivedOnly },
            { value: 'archived' as const, label: 'الأرشيف', active: archivedOnly },
          ].map(({ value, label, active }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setUnreadOnly(value === 'unread');
                setArchivedOnly(value === 'archived');
              }}
              className={cn(
                'relative min-h-10 shrink-0 pb-2.5 pt-1 text-sm font-semibold transition-colors',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
              {active && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-t-full bg-primary" aria-hidden />}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile header — matches design: title + badge, search, chips, underline tabs */}
      <div className="md:hidden space-y-3 border-b border-border/60 bg-background px-4 pt-4 pb-0">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">الرسائل</h1>
          {totalUnread > 0 && (
            <span
              aria-label={`${totalUnread} محادثة غير مقروءة`}
              className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary"
            >
              {totalUnread} غير مقروءة
            </span>
          )}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث في المحادثات..."
            className="w-full min-h-11 rounded-xl border border-border bg-card py-2.5 pe-9 ps-9 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/40 focus:bg-card focus-visible:ring-2 focus-visible:ring-primary/15"
            aria-label="بحث في المحادثات"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute end-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="مسح البحث"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-0.5 [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="مصدر المحادثة">
          {([['all', 'الكل'], ['users', 'شخصي'], ['stores', 'متجر']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={inbox === value}
              onClick={() => setInbox(value)}
              className={cn(
                'min-h-9 shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors',
                inbox === value
                  ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-5 border-b border-border/80" role="tablist" aria-label="حالة المحادثة">
          {[
            { value: 'all' as const, label: 'الكل', active: !unreadOnly && !archivedOnly },
            { value: 'unread' as const, label: `غير مقروء${totalUnread > 0 ? ` (${totalUnread})` : ''}`, active: unreadOnly && !archivedOnly },
            { value: 'archived' as const, label: 'الأرشيف', active: archivedOnly },
          ].map(({ value, label, active }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setUnreadOnly(value === 'unread');
                setArchivedOnly(value === 'archived');
              }}
              className={cn(
                'relative min-h-10 shrink-0 pb-2.5 pt-1 text-sm font-semibold transition-colors',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
              {active && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-t-full bg-primary" aria-hidden />
              )}
            </button>
          ))}
        </div>
      </div>

      {(query.trim() || unreadOnly || archivedOnly || inbox !== 'all') && filtered.length > 0 && (
        <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{filtered.length}</span>
          <span>محادثة مطابقة للفلاتر الحالية</span>
          <button
            type="button"
            onClick={clearFilters}
            className="ms-auto font-medium text-primary hover:underline"
          >
            مسح الفلاتر
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="mx-4 my-6 rounded-2xl border border-border bg-card p-6 text-center shadow-xs">
          <p className="text-base font-bold text-foreground">
            {query.trim()
              ? `لا نتائج لـ «${query}»`
              : unreadOnly
                ? 'لا محادثات غير مقروءة'
                : archivedOnly
                  ? 'لا توجد محادثات في الأرشيف'
                  : inbox === 'stores'
                  ? 'لا توجد محادثات مع المتاجر'
                  : inbox === 'users'
                    ? 'لا توجد محادثات مع المستخدمين'
                    : 'لا نتائج'}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            محادثة مطابقة للفلاتر الحالية: 0
          </p>
          {(query.trim() || unreadOnly || archivedOnly || inbox !== 'all') && (
            <Button type="button" size="sm" variant="outline" className="mt-4 rounded-xl" onClick={clearFilters}>
              مسح الفلتر
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col md:overflow-y-auto md:flex-1">
          {filtered.map((conversation, index) => {
            const party = conversation.buyerId === user?.id ? conversation.seller : conversation.buyer;
            return (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                userId={user?.id}
                selectedId={selectedId}
                isOnline={Boolean(onlineMap?.[party.id]?.online)}
                isFlagPending={pendingFlagId === conversation.id}
                isLast={index === filtered.length - 1}
                onSetFlags={handleSetFlags}
                onDelete={setDeleteId}
              />
            );
          })}

          {hasMore && !query.trim() && (
            <div className="flex justify-center border-t p-3">
              <Button
                variant="ghost"
                size="sm"
                disabled={loadingMore}
                onClick={() => setLimit((l) => l + PAGE_SIZE)}
                className="gap-2"
              >
                {loadingMore ? <Spinner size="sm" /> : null}
                تحميل المزيد
              </Button>
            </div>
          )}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="حذف المحادثة؟"
        description="ستختفي المحادثة من قائمتك ولن تحذف رسائل الطرف الآخر. يمكنك بدء محادثة جديدة معه لاحقًا."
        confirmLabel="حذف المحادثة"
        destructive
        isPending={deletingConversation}
        onConfirm={() => {
          if (!deleteId) return;
          deleteConversation(deleteId, { onSuccess: () => setDeleteId(null) });
        }}
      />
    </div>
    </PullToRefresh>
  );
}
