'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { AlertTriangle, MessageSquare, Loader2, Search, X } from 'lucide-react';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { Button } from '@/components/shared/ui/Button';
import { useMyConversations } from '@/hooks/queries/useConversations';
import { usePresence } from '@/hooks/queries/usePresence';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';
import { formatRelativeTime } from '@/lib/formatters';
import { getAvatarUrl } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import type { Conversation, ConversationListItem } from '@/types/conversation.types';

/** Whichever side the caller ISN'T — the person this thread is with. */
function otherParty(conversation: Conversation, userId: string | undefined) {
  return conversation.buyerId === userId ? conversation.seller : conversation.buyer;
}

function contextLabel(conversation: ConversationListItem): string | null {
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
  const { data, isLoading, isError, refetch, isFetching } = useMyConversations({ page: 1, limit });

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const hasMore = Boolean(data?.meta?.hasNextPage);
  const loadingMore = isFetching && !isLoading;

  const otherPartyIds = items.slice(0, 50).map((c) => otherParty(c, user?.id).id);
  const { data: onlineMap } = usePresence(otherPartyIds);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => {
      const party = otherParty(c, user?.id);
      const ctx = contextLabel(c) ?? '';
      const preview = c.lastMessage?.body ?? '';
      return (
        party.name.toLowerCase().includes(q) ||
        ctx.toLowerCase().includes(q) ||
        preview.toLowerCase().includes(q)
      );
    });
  }, [items, query, user?.id]);

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
        description="ابدأ من إعلان أو ملف بائع عبر «راسل البائع» — ستظهر محادثاتك هنا."
        action={
          <div className="flex flex-col items-center gap-2 sm:flex-row">
            <Button asChild size="sm">
              <Link href={`${ROUTES.search}?type=ads`}>تصفّح الإعلانات</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={ROUTES.home}>العودة للرئيسية</Link>
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
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
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
            placeholder="بحث في المحادثات…"
            className="w-full rounded-full border bg-muted/50 py-2 pe-9 ps-9 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/40 focus:bg-background focus:ring-2 focus:ring-primary/15"
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
      </div>

      {/* Mobile search */}
      <div className="md:hidden border-b px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث…"
            className="w-full rounded-full border bg-muted/40 py-2 pe-3 ps-9 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
            aria-label="بحث في المحادثات"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 px-4 text-center">
          <Search className="h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm font-medium">لا نتائج لـ «{query}»</p>
          <button type="button" onClick={() => setQuery('')} className="text-sm text-primary hover:underline">
            مسح البحث
          </button>
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

            return (
              <Link
                key={conversation.id}
                href={ROUTES.conversationDetail(conversation.id)}
                aria-current={isSelected ? 'page' : undefined}
                className={cn(
                  'group relative flex items-center gap-3 px-4 py-3.5 transition-colors active:scale-[0.99] touch-manipulation',
                  'hover:bg-muted/50',
                  isSelected && 'bg-primary/5 hover:bg-primary/8 dark:bg-primary/10 dark:hover:bg-primary/15',
                  hasUnread && !isSelected && 'bg-primary/[0.03]',
                )}
              >
                {/* Selected accent bar (RTL-aware via border-s) */}
                {isSelected && (
                  <span className="absolute inset-y-2 start-0 w-1 rounded-e-full bg-primary" aria-hidden />
                )}

                <div className="relative shrink-0">
                  <div
                    className={cn(
                      'relative h-14 w-14 overflow-hidden rounded-full bg-muted shadow-sm',
                      isSelected ? 'ring-2 ring-primary/30' : 'ring-2 ring-card',
                    )}
                  >
                    <SafeImage
                      variant="avatar"
                      src={avatar}
                      alt={party.name}
                      fill
                      className="object-cover"
                      sizes="56px"
                    />
                  </div>
                  {onlineMap?.[party.id] && (
                    <span
                      className="absolute bottom-0 end-0 h-3.5 w-3.5 rounded-full bg-online ring-2 ring-card"
                      aria-label="متصل الآن"
                      title="متصل الآن"
                    />
                  )}
                  {hasUnread && (
                    <span
                      className="absolute -top-1 -end-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground ring-2 ring-card"
                      aria-label={`${conversation.unreadCount} رسالة غير مقروءة`}
                    >
                      {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-baseline justify-between gap-2">
                    <p
                      className={cn(
                        'text-sm line-clamp-1',
                        hasUnread ? 'font-bold text-foreground' : 'font-semibold text-foreground/90',
                      )}
                    >
                      {party.name}
                    </p>
                    <span
                      className={cn(
                        'shrink-0 text-[11px] tabular-nums',
                        hasUnread ? 'font-semibold text-primary' : 'text-muted-foreground',
                      )}
                    >
                      {formatRelativeTime(conversation.updatedAt)}
                    </span>
                  </div>

                  <p
                    className={cn(
                      'text-xs line-clamp-1 leading-relaxed',
                      hasUnread ? 'font-medium text-foreground/80' : 'text-muted-foreground',
                    )}
                  >
                    {previewText(conversation, user?.id)}
                  </p>

                  {ctx && conversation.lastMessage && (
                    <p className="mt-1 line-clamp-1 text-[10px] text-muted-foreground/80">
                      بخصوص: {ctx}
                    </p>
                  )}
                </div>

                {!isLast && <div className="absolute bottom-0 inset-x-4 h-px bg-border/80" />}
              </Link>
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
    </div>
  );
}
