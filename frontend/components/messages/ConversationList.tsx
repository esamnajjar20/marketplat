'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { AlertTriangle, MessageSquare, Loader2 } from 'lucide-react';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { Button } from '@/components/shared/ui/Button';
import { useMyConversations } from '@/hooks/queries/useConversations';
import { usePresence } from '@/hooks/queries/usePresence';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';
import { formatRelativeTime } from '@/lib/formatters';
import { getAvatarUrl } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import type { Conversation } from '@/types/conversation.types';

/** Whichever side the caller ISN'T — the person this thread is with. */
function otherParty(conversation: Conversation, userId: string | undefined) {
  return conversation.buyerId === userId ? conversation.seller : conversation.buyer;
}

const PAGE_SIZE = 20;

interface Props {
  /**
   * DESKTOP-SPLIT-01: the currently-open conversation's id, when this
   * list is rendered inside (protected)/messages/layout.tsx's `lg:`
   * sidebar alongside an already-open ChatWindow. Highlights the
   * active row the same way a mail client highlights the open thread,
   * so the list doesn't look inert while a conversation sits open
   * beside it. undefined on the plain /messages inbox route (no row
   * is "open" there — mobile always lands here first).
   */
  selectedId?: string;
}

/**
 * ConversationList — Epic 5, the inbox view at /messages. Replaces the
 * "ميزة المراسلة قيد التطوير" placeholder that's been there since
 * FIX AUDIT-V4-03 (see that page's own comment for why it was pulled).
 *
 * DESKTOP-SPLIT-01: previously every row was a plain Link to
 * /messages/:id, which was correct on mobile (full-screen navigation)
 * but meant desktop lost the entire inbox the moment a thread opened
 * — no split-view like the chat apps this UI otherwise mirrors
 * (WhatsApp Web, Telegram Web). ChatWindow's own back-button already
 * carried a stray sm:hidden with no matching sidebar to hide it for;
 * this file plus the new (protected)/messages/layout.tsx are what
 * that class was actually waiting on. Rows are still real <Link>s
 * (no onClick-based selection) — the layout for >=lg renders both
 * panes from the same URL segment, so navigation alone is enough to
 * keep the list mounted while swapping ChatWindow's content.
 *
 * FIX UX-GAP-02: this used to fetch a flat `limit: 20` with no way to
 * see anything past the 20 most recently active threads — the same
 * silent-cap pattern the homepage's FeaturedAds/DashboardStats had.
 * A "تحميل المزيد" button raises `limit` (not `page`) on click: since
 * this list also polls (CACHE_TTL.conversations) to surface newly
 * active threads without a refresh, paging by page-number risks
 * boundary drift/duplicates the moment a poll reorders results
 * between page fetches — bumping the single window's size instead
 * keeps "most recently active first" correct at any point regardless
 * of what the poll just refreshed underneath it.
 */
export function ConversationList({ selectedId }: Props = {}) {
  const user = useAuthStore(selectUser);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const { data, isLoading, isError, refetch, isFetching } = useMyConversations({ page: 1, limit });

  const items = data?.items ?? [];
  const hasMore = Boolean(data?.meta?.hasNextPage);
  // isFetching (not isLoading) so the "تحميل المزيد" button itself shows
  // a pending state on click without the whole list dropping back to
  // the full-page spinner — isLoading is only true before any data has
  // ever loaded.
  const loadingMore = isFetching && !isLoading;

  // One bulk presence lookup for every row's other party at once,
  // rather than each row polling on its own — same "single request for
  // the whole visible set" idea as ChatWindow's single-id usage of the
  // same hook. Backend caps bulk lookups at 50 ids — FIX UX-GAP-02:
  // this list's own limit can now grow past that via "تحميل المزيد",
  // so this trims to the most recent 50 rather than assuming the two
  // caps always match.
  const otherPartyIds = items.slice(0, 50).map((c) => otherParty(c, user?.id).id);
  const { data: onlineMap } = usePresence(otherPartyIds);

  if (isLoading) {
    return <div className="flex justify-center py-12"><LoadingSpinner /></div>;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل المحادثات</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquare className="h-10 w-10" />}
        title="لا توجد محادثات"
        description="ستظهر هنا محادثاتك مع البائعين والمشترين"
      />
    );
  }

  return (
    // DESKTOP-SPLIT-01: rounded-xl shadow card matches every other
    // standalone card in this app (mobile, and this same list under lg
    // where it's still its own free-standing block). At >=lg it's
    // mounted inside messages/layout.tsx's <aside>, which already draws
    // its own border-e — the lg:rounded-none lg:border-0 lg:shadow-none
    // here drops this component's own frame there so the two don't
    // double up.
    <div className="flex flex-col rounded-xl bg-card shadow-sm overflow-hidden lg:rounded-none lg:shadow-none">
      {items.map((conversation, index) => {
        const party = otherParty(conversation, user?.id);
        const avatar = getAvatarUrl(party.avatarUrl ?? '', 56);
        const isLast = index === items.length - 1;

        return (
          <Link
            key={conversation.id}
            href={ROUTES.conversationDetail(conversation.id)}
            aria-current={conversation.id === selectedId ? 'page' : undefined}
            className={cn(
              'group relative flex items-center gap-3 p-4 transition-colors active:scale-[0.99] touch-manipulation hover:bg-muted/40',
              conversation.id === selectedId && 'bg-muted/60'
            )}
          >
            <div className="relative shrink-0">
              <div className="w-14 h-14 rounded-full overflow-hidden bg-muted border-2 border-card shadow-sm">
                <SafeImage variant="avatar" src={avatar} alt={party.name} fill className="object-cover" sizes="56px" />
              </div>
              {onlineMap?.[party.id] && (
                <span
                  className="absolute bottom-0 end-0 w-3.5 h-3.5 rounded-full bg-online ring-2 ring-card"
                  aria-label="متصل الآن"
                  title="متصل الآن"
                />
              )}
              {/* FIX UX-15: unreadCount badge — was previously nowhere
                  in this list at all (only an aggregate total existed
                  on the backend, unused by any endpoint). Positioned
                  opposite the online dot (top-end vs bottom-end) so
                  the two never collide on the same corner. */}
              {conversation.unreadCount > 0 && (
                <span
                  className="absolute -top-1 -end-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground ring-2 ring-card"
                  aria-label={`${conversation.unreadCount} رسالة غير مقروءة`}
                >
                  {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <p className={cn('text-sm line-clamp-1', conversation.unreadCount > 0 ? 'font-bold' : 'font-semibold')}>
                  {party.name}
                </p>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatRelativeTime(conversation.updatedAt)}
                </span>
              </div>
              <p
                className={cn(
                  'text-xs line-clamp-1',
                  conversation.unreadCount > 0 ? 'font-medium text-foreground' : 'text-muted-foreground',
                  !conversation.ad && 'italic'
                )}
              >
                {conversation.ad ? conversation.ad.title : 'محادثة عامة'}
              </p>
            </div>
            {!isLast && (
              <div className="absolute bottom-0 inset-x-4 h-px bg-border" />
            )}
          </Link>
        );
      })}
      {hasMore && (
        <div className="flex justify-center border-t p-3">
          <Button variant="ghost" size="sm" disabled={loadingMore} onClick={() => setLimit((l) => l + PAGE_SIZE)}>
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : 'تحميل المزيد'}
          </Button>
        </div>
      )}
    </div>
  );
}
