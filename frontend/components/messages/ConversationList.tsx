'use client';

import Link from 'next/link';
import Image from 'next/image';
import { AlertTriangle, MessageSquare } from 'lucide-react';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useMyConversations } from '@/hooks/queries/useConversations';
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
 */
export function ConversationList({ selectedId }: Props = {}) {
  const user = useAuthStore(selectUser);
  const { data, isLoading, isError, refetch } = useMyConversations({ page: 1, limit: 20 });

  const items = data?.items ?? [];

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
    // DESKTOP-SPLIT-01: rounded-lg border matches every other standalone
    // card in this app (mobile, and this same list under lg where it's
    // still its own free-standing block). At >=lg it's mounted inside
    // messages/layout.tsx's <aside>, which already draws its own
    // border-e — the lg:rounded-none lg:border-0 here drops this
    // component's own frame there so the two don't double up.
    <div className="divide-y rounded-lg border bg-card overflow-hidden lg:rounded-none lg:border-0">
      {items.map((conversation) => {
        const party = otherParty(conversation, user?.id);
        const avatar = getAvatarUrl(party.avatarUrl ?? '', 48);

        return (
          <Link
            key={conversation.id}
            href={ROUTES.conversationDetail(conversation.id)}
            aria-current={conversation.id === selectedId ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors',
              conversation.id === selectedId && 'bg-muted/70'
            )}
          >
            <div className="relative w-11 h-11 rounded-full overflow-hidden bg-muted shrink-0">
              <Image src={avatar} alt={party.name} fill className="object-cover" sizes="44px" />
            </div>
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-sm line-clamp-1">{party.name}</p>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatRelativeTime(conversation.updatedAt)}
                </span>
              </div>
              <p
                className={cn(
                  'text-xs text-muted-foreground line-clamp-1',
                  !conversation.ad && 'italic'
                )}
              >
                {conversation.ad ? conversation.ad.title : 'محادثة عامة'}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
