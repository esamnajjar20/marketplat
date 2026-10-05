'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { AlertTriangle, MessageSquare, Loader2, Search, X, Pin, Archive, Trash2, MoreVertical, BellOff, Bell } from 'lucide-react';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { Button } from '@/components/shared/ui/Button';
import { useMyConversations } from '@/hooks/queries/useConversations';
import { usePresence } from '@/hooks/queries/usePresence';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { useDeleteConversation, useSetConversationFlags } from '@/hooks/mutations/useConversationMutations';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/shared/ui/DropdownMenu';
import { ROUTES } from '@/lib/constants';
import { formatRelativeTimeShort } from '@/lib/formatters';
import { getAvatarUrl } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import type { Conversation, ConversationListItem } from '@/types/conversation.types';

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

function previewText(conversation: ConversationListItem, userId: string | undefined): string {
  const last = conversation.lastMessage;
  if (!last) {
    return contextLabel(conversation) ?? 'محادثة عامة';
  }
  if (last.deletedAt) return 'تم حذف هذه الرسالة';
  const mine = userId && last.senderId === userId;
  const body = last.body.trim() || '…';
  return mine ? `أنت: ${body}` : body;
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
  const { mutate: setFlags, isPending: flagsPending } = useSetConversationFlags();
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

  const otherPartyIds = items.slice(0, 50).map((c) => otherParty(c, user?.id).id);
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
          <div key={i} className="flex items-center gap-3 p-4 animate-pulse">
            <div className="h-14 w-14 shrink-0 rounded-full bg-muted" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3.5 w-1/3 rounded bg-muted" />
              <div className="h-3 w-2/3 rounded bg-muted/70" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center px-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <p className="font-medium text-destructive">حدث خطأ أثناء تحميل المحادثات</p>
        <p className="text-sm text-muted-foreground">تحقق من الاتصال ثم أعد المحاولة</p>
        <Button type="button" size="sm" variant="outline" onClick={() => refetch()}>
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquare className="h-10 w-10" />}
        title="لا توجد محادثات بعد"
        description="ابدأ من إعلان أو خدمة عبر «راسل البائع» — المحادثات تظهر هنا مع آخر رسالة وعدد غير المقروء."
        action={
          <div className="flex flex-col items-center gap-2 sm:flex-row">
            {/* SW-FIX-MSG-PREFETCH-MALFORM: `prefetch={false}` was placed
                after the closing </Link> — as JSX text it rendered the literal
                string "prefetch=" next to the button. Same malformed pattern
                fixed in RecentAds. */}
            <Button asChild size="sm">
              <Link prefetch={false} href={`${ROUTES.search}?type=ads`}>تصفّح الإعلانات</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link prefetch={false} href={ROUTES.ads}>كل الإعلانات</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href={ROUTES.home}>الرئيسية</Link>
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <div className="flex flex-col rounded-xl bg-card shadow-sm overflow-hidden md:rounded-none md:shadow-none md:h-full">
      {/* Desktop sticky header */}
      <div className="hidden md:flex sticky top-0 z-10 flex-col gap-2 border-b bg-card/95 backdrop-blur-sm px-3 py-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="text-sm font-semibold">الرسائل</h2>
          {totalUnread > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-2xs-tight font-semibold text-primary">
              {totalUnread} غير مقروءة
            </span>
          )}
        </div>
        <div className="flex gap-1.5 px-1 overflow-x-auto [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="مصدر المحادثة">
          {([['all', 'الكل'], ['users', 'شخصي'], ['stores', 'متجر']] as const).map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={inbox === value} onClick={() => setInbox(value)} className={inbox === value ? 'min-h-10 rounded-full bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground' : 'min-h-10 rounded-full border px-3.5 py-2 text-xs text-muted-foreground hover:text-foreground'}>{label}</button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث في المحادثات…"
            className="w-full min-h-11 rounded-full border bg-muted/50 py-2.5 pe-9 ps-9 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/40 focus:bg-background focus-visible:ring-2 focus-visible:ring-primary/15"
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
        <div className="flex gap-1.5 px-1">
          <button
            type="button"
            onClick={() => {
              setUnreadOnly(false);
              setArchivedOnly(false);
            }}
            className={
              !unreadOnly && !archivedOnly
                ? 'min-h-10 rounded-full bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground'
                : 'min-h-10 rounded-full border px-3.5 py-2 text-xs text-muted-foreground hover:text-foreground'
            }
          >
            الكل
          </button>
          <button
            type="button"
            onClick={() => {
              setUnreadOnly(true);
              setArchivedOnly(false);
            }}
            className={
              unreadOnly && !archivedOnly
                ? 'min-h-10 rounded-full bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground'
                : 'min-h-10 rounded-full border px-3.5 py-2 text-xs text-muted-foreground hover:text-foreground'
            }
          >
            غير مقروء{totalUnread > 0 ? ` (${totalUnread})` : ''}
          </button>
          <button
            type="button"
            onClick={() => {
              setArchivedOnly(true);
              setUnreadOnly(false);
            }}
            className={
              archivedOnly
                ? 'min-h-10 rounded-full bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground'
                : 'min-h-10 rounded-full border px-3.5 py-2 text-xs text-muted-foreground hover:text-foreground'
            }
          >
            الأرشيف
          </button>
        </div>
      </div>

      {/* Mobile search */}
      <div className="md:hidden space-y-2 border-b px-3 py-2">
        <div className="flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="مصدر المحادثة">
          {([['all', 'الكل'], ['users', 'شخصي'], ['stores', 'متجر']] as const).map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={inbox === value} onClick={() => setInbox(value)} className={inbox === value ? 'min-h-10 rounded-full bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground' : 'min-h-10 rounded-full border px-3 py-2 text-xs text-muted-foreground'}>{label}</button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث…"
            className="w-full rounded-full border bg-muted/40 py-2 pe-3 ps-9 text-sm outline-none focus:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15"
            aria-label="بحث في المحادثات"
          />
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setUnreadOnly(false)}
            className={
              !unreadOnly
                ? 'min-h-10 rounded-full bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground'
                : 'rounded-full border px-3 py-1 text-2xs-tight text-muted-foreground'
            }
          >
            الكل
          </button>
          <button
            type="button"
            onClick={() => setUnreadOnly(true)}
            className={
              unreadOnly
                ? 'min-h-10 rounded-full bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground'
                : 'rounded-full border px-3 py-1 text-2xs-tight text-muted-foreground'
            }
          >
            غير مقروء{totalUnread > 0 ? ` (${totalUnread})` : ''}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 px-4 text-center">
          <Search className="h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm font-medium">
            {query.trim()
              ? `لا نتائج لـ «${query}»`
              : unreadOnly
                ? 'لا محادثات غير مقروءة'
                : inbox === 'stores'
                  ? 'لا توجد محادثات مع المتاجر'
                  : inbox === 'users'
                    ? 'لا توجد محادثات مع المستخدمين'
                    : 'لا نتائج'}
          </p>
          {(query || unreadOnly || inbox !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setUnreadOnly(false);
                setInbox('all');
              }}
              className="text-sm text-primary hover:underline"
            >
              إظهار الكل
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col md:overflow-y-auto md:flex-1">
          {filtered.map((conversation, index) => {
            const party = otherParty(conversation, user?.id);
            const avatar = getAvatarUrl(party.avatarUrl ?? '', 56);
            const isSelected = conversation.id === selectedId;
            const hasUnread = conversation.unreadCount > 0;
            const ctx = contextLabel(conversation);
            const isLast = index === filtered.length - 1;
            const settings = conversation.mySettings;
            const muted = Boolean(settings?.mutedUntil && new Date(settings.mutedUntil).getTime() > Date.now());

            return (
              <div key={conversation.id} className={cn('group relative flex min-h-[4.5rem] items-center gap-2 px-2 py-2.5 transition-colors', 'hover:bg-muted/50', isSelected && 'bg-primary/5 dark:bg-primary/10', hasUnread && !isSelected && 'bg-primary/[0.03]')}>
                <Link
                  href={ROUTES.conversationDetail(conversation.id)}
                  aria-current={isSelected ? 'page' : undefined}
                  className="flex min-w-0 flex-1 items-center gap-3 px-2 py-1 touch-manipulation"
                >
                  {isSelected && <span className="absolute inset-y-2 start-0 w-1 rounded-e-full bg-primary" aria-hidden />}
                  <div className="relative shrink-0">
                    <div className={cn('relative h-14 w-14 overflow-hidden rounded-full bg-muted shadow-sm', isSelected ? 'ring-2 ring-primary/30' : 'ring-2 ring-card')}>
                      <SafeImage variant="avatar" src={avatar} alt={party.name} fill className="object-cover" sizes="56px" />
                    </div>
                    {onlineMap?.[party.id]?.online && <span className="absolute bottom-0 end-0 h-3.5 w-3.5 rounded-full bg-online ring-2 ring-card" aria-label="متصل الآن" title="متصل الآن" />}
                    {hasUnread && <span className="absolute -top-1 -end-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-2xs-tight font-semibold text-primary-foreground ring-2 ring-card">{conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-baseline justify-between gap-2">
                      <p className={cn('flex items-center gap-1 text-sm line-clamp-1', hasUnread ? 'font-bold text-foreground' : 'font-semibold text-foreground/90')}>
                        {settings?.pinnedAt && <Pin className="h-3 w-3 shrink-0 text-primary" aria-label="مثبّتة" />}
                        {party.name}
                      </p>
                      <span className={cn('shrink-0 text-2xs leading-tight tabular-nums', hasUnread ? 'font-semibold text-primary' : 'text-muted-foreground')}>{formatRelativeTimeShort(conversation.updatedAt)}</span>
                    </div>
                    <p className={cn('text-xs line-clamp-1 leading-relaxed', hasUnread ? 'font-medium text-foreground/80' : 'text-muted-foreground')}>{previewText(conversation, user?.id)}</p>
                    <div className="mt-1 flex items-center gap-1.5 text-2xs text-muted-foreground/80">
                      {muted && <span className="inline-flex items-center gap-0.5"><BellOff className="h-3 w-3" /> عدم الإزعاج</span>}
                      {ctx && conversation.lastMessage && <span className="line-clamp-1">{muted ? '· ' : ''}بخصوص: {ctx}</span>}
                    </div>
                  </div>
                </Link>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-100 hover:bg-muted hover:text-foreground" aria-label={`خيارات محادثة ${party.name}`} onClick={(e) => e.stopPropagation()}>
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-48">
                    <DropdownMenuItem disabled={flagsPending} onClick={() => setFlags({ id: conversation.id, pinned: !settings?.pinnedAt })}>
                      <Pin className="h-4 w-4" />{settings?.pinnedAt ? 'إلغاء تثبيت المحادثة' : 'تثبيت المحادثة'}
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={flagsPending} onClick={() => setFlags({ id: conversation.id, archived: !settings?.archivedAt })}>
                      <Archive className="h-4 w-4" />{settings?.archivedAt ? 'إلغاء الأرشفة' : 'أرشفة المحادثة'}
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={flagsPending} onClick={() => setFlags({ id: conversation.id, mutedUntil: muted ? null : new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() })}>
                      {muted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                      {muted ? 'تشغيل الإشعارات' : 'عدم الإزعاج لمدة 8 ساعات'}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteId(conversation.id)}>
                      <Trash2 className="h-4 w-4" />حذف المحادثة
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {!isLast && <div className="absolute bottom-0 inset-x-4 h-px bg-border/80" />}
              </div>
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
                {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
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
  );
}
