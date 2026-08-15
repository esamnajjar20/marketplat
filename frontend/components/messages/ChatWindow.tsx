'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { AlertTriangle, ChevronRight, MoreVertical, UserX, UserCheck, Check, CheckCheck, Trash2, Loader2 } from 'lucide-react';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { Button } from '@/components/shared/ui/Button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/shared/ui/DropdownMenu';
import { MessageInput } from './MessageInput';
import { useConversation, useMessages } from '@/hooks/queries/useConversations';
import { useIsUserBlocked } from '@/hooks/queries/useBlockedUsers';
import { useToggleUserBlock } from '@/hooks/mutations/useBlockedUsersMutations';
import { useDeleteMessage } from '@/hooks/mutations/useConversationMutations';
import { useIsUserOnline } from '@/hooks/queries/usePresence';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';
import { formatTime } from '@/lib/formatters';
import { getAvatarUrl } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import type { Conversation, Message } from '@/types/conversation.types';

const MESSAGES_PAGE_SIZE = 50;

interface Props {
  conversationId: string;
}

function otherParty(conversation: Conversation, userId: string | undefined) {
  return conversation.buyerId === userId ? conversation.seller : conversation.buyer;
}

/**
 * ChatWindow — Epic 5, the thread view at /messages/:id. Replaces the
 * redirect-to-/messages stub that's been there since FIX AUDIT-V4-03
 * (see app/(protected)/messages/[id]/page.tsx's own comment).
 *
 * Trust & safety follow-up: adds a block/unblock action for the other
 * party, since sendMessage/startFromAd both 403 with USER_BLOCKED once
 * either side has blocked the other (conversations.service.ts) — the
 * composer disables itself the moment that's true, rather than only
 * surfacing it as an error toast after a failed send.
 *
 * DESKTOP-SPLIT-01: this used to own its own border/rounded/height
 * frame, correct when it was the only thing on the page (mobile, or
 * desktop before the split-view existed). It's now rendered inside
 * (protected)/messages/layout.tsx's right-hand pane on >=lg, which
 * already provides that frame for both panes together — a nested
 * border here would double up. The h-full below fills whatever height
 * the caller's wrapper provides instead of computing its own from the
 * viewport, so it behaves the same standalone (viewport-derived
 * wrapper on mobile) or inside the split layout (flex-derived wrapper
 * on desktop) without ChatWindow needing to know which.
 *
 * The back-button's lg:hidden (was sm:hidden) is the other half of
 * this change: below lg there's no sidebar to return to visually, so
 * back navigation matters; at lg and above the sidebar in
 * messages/layout.tsx is already on screen, so a back arrow inside
 * the thread itself would be redundant.
 *
 * FIX UX-GAP-03: this used to fetch only the latest 50 messages with
 * no way to reach anything older — a long negotiation thread just
 * lost its own beginning with no signal that earlier messages
 * existed. "تحميل رسائل أقدم" fetches subsequent backend pages (the
 * API returns newest-first — page 2 is the next-older 50, not a
 * bigger page 1) and merges them into the live page-1 result, deduped
 * by message id since the live page keeps polling and could overlap
 * with an older page at the boundary. Scroll position is anchored on
 * the height delta so prepending older messages doesn't yank the
 * user's current reading position down the thread.
 */
export function ChatWindow({ conversationId }: Props) {
  const user = useAuthStore(selectUser);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [confirmBlockOpen, setConfirmBlockOpen] = useState(false);
  const {
    data: conversation,
    isLoading: conversationLoading,
    isError: conversationError,
  } = useConversation(conversationId);
  const { data: messagesPage, isLoading: messagesLoading } = useMessages(conversationId, {
    limit: MESSAGES_PAGE_SIZE,
  });
  const party = conversation ? otherParty(conversation, user?.id) : null;
  const isBlocked = useIsUserBlocked(party?.id ?? '');
  const isPartyOnline = useIsUserOnline(party?.id);
  const { mutate: toggleBlock, isPending: togglingBlock } = useToggleUserBlock();
  const { mutate: deleteMessage, isPending: deletingMessage } = useDeleteMessage(conversationId);
  const [confirmDeleteMessageId, setConfirmDeleteMessageId] = useState<string | null>(null);

  // FIX UX-GAP-03: `page` starts at null (unused — the live query above
  // already covers page 1) and only becomes a real second fetch once
  // "تحميل رسائل أقدم" is clicked, via the `enabled`-equivalent branch
  // below (page argument only set once olderPage is non-null).
  const [olderPage, setOlderPage] = useState<number | null>(null);
  const [olderMessages, setOlderMessages] = useState<Message[]>([]);

  const { data: olderPageData, isFetching: fetchingOlder } = useMessages(
    conversationId,
    olderPage !== null ? { page: olderPage, limit: MESSAGES_PAGE_SIZE } : { limit: MESSAGES_PAGE_SIZE },
  );

  useEffect(() => {
    if (olderPage === null || !olderPageData) return;
    setOlderMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const fresh = olderPageData.items.filter((m) => !seen.has(m.id));
      return fresh.length ? [...fresh, ...prev] : prev;
    });
  }, [olderPage, olderPageData]);

  const liveMessages = messagesPage?.items ?? [];
  // FIX UX-GAP-03 (dedup bug): the effect above only deduped a newly
  // fetched older page against `olderMessages`' own prior state — it
  // never checked against `liveMessages`, so a message id present in
  // both (e.g. the live page's oldest item lands on an older page's
  // newest slot, a real possibility since both are independent fetches
  // hitting a list that can shift between them) rendered twice. Filter
  // olderMessages against the live set here, where both are actually
  // known together, rather than trying to guess it inside the effect.
  const liveIds = new Set(liveMessages.map((m) => m.id));
  const messages = [...olderMessages.filter((m) => !liveIds.has(m.id)), ...liveMessages];
  // Whether an older page beyond whichever page was fetched last is
  // still available: before any click, that's the live page-1 fetch's
  // own hasNextPage; after a click, it's the latest older-page fetch's
  // hasNextPage, since that one's now the frontier of what's loaded.
  const hasMoreOlder = Boolean((olderPage === null ? messagesPage : olderPageData)?.meta?.hasNextPage);

  function handleLoadOlder() {
    if (!scrollRef.current) {
      setOlderPage((p) => (p ?? 1) + 1);
      return;
    }
    const el = scrollRef.current;
    const prevScrollHeight = el.scrollHeight;
    const prevScrollTop = el.scrollTop;
    setOlderPage((p) => (p ?? 1) + 1);
    // Runs after the DOM updates with the newly prepended messages —
    // requestAnimationFrame (not useLayoutEffect keyed to state, which
    // would fire before the new rows are actually measurable) restores
    // the same visual scroll offset the user had before older content
    // was added above it.
    requestAnimationFrame(() => {
      const newScrollHeight = el.scrollHeight;
      el.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
    });
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [liveMessages.length]);

  if (conversationLoading) {
    return <div className="flex justify-center py-12"><LoadingSpinner /></div>;
  }

  if (conversationError || !conversation || !party) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        <p className="text-destructive">تعذّر تحميل المحادثة</p>
        <Link href={ROUTES.messages} className="text-sm text-primary hover:underline">
          العودة للمحادثات
        </Link>
      </div>
    );
  }

  const avatar = getAvatarUrl(party.avatarUrl ?? '', 40);

  function handleToggleBlock() {
    if (!party) return;
    // Unblocking needs no confirmation (reversible, low-stakes); only
    // blocking — which also cuts off this thread — is confirmed first.
    if (isBlocked) {
      toggleBlock(party.id);
    } else {
      setConfirmBlockOpen(true);
    }
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center gap-3 bg-card/90 backdrop-blur-md shadow-sm px-3 py-3 sticky top-0 z-10">
        <Link
          href={ROUTES.messages}
          className="lg:hidden w-9 h-9 flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors shrink-0"
        >
          <ChevronRight className="h-5 w-5" />
        </Link>
        <div className="relative w-11 h-11 rounded-full overflow-hidden bg-muted shrink-0">
          <SafeImage variant="avatar" src={avatar} alt={party.name} fill className="object-cover" sizes="44px" />
          {isPartyOnline && (
            <span
              className="absolute bottom-0 end-0 w-3 h-3 rounded-full bg-online ring-2 ring-card"
              aria-label="متصل الآن"
              title="متصل الآن"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm line-clamp-1">{party.name}</p>
          {conversation.ad ? (
            <p className="text-xs text-muted-foreground line-clamp-1">بخصوص: {conversation.ad.title}</p>
          ) : isPartyOnline ? (
            <p className="text-xs text-online line-clamp-1">متصل الآن</p>
          ) : null}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors"
              aria-label="خيارات المحادثة"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={togglingBlock}
              onClick={handleToggleBlock}
              className={cn(
                'flex items-center gap-2 cursor-pointer',
                !isBlocked && 'text-destructive focus:text-destructive'
              )}
            >
              {isBlocked ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
              {isBlocked ? 'إلغاء حظر المستخدم' : 'حظر المستخدم'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-3">
        {messagesLoading ? (
          <div className="flex justify-center py-8"><LoadingSpinner /></div>
        ) : messages.length === 0 ? (
          <EmptyState
            className="py-8"
            title="ابدأ المحادثة"
            description="أرسل أول رسالة لبدء الحديث"
          />
        ) : (
          <>
            {hasMoreOlder && (
              <div className="flex justify-center pb-1">
                <Button variant="ghost" size="sm" disabled={fetchingOlder} onClick={handleLoadOlder}>
                  {fetchingOlder ? <Loader2 className="h-4 w-4 animate-spin" /> : 'تحميل رسائل أقدم'}
                </Button>
              </div>
            )}
            {messages.map((message) => {
              const isMine = message.senderId === user?.id;
              const isDeleted = Boolean(message.deletedAt);
              return (
                <div
                  key={message.id}
                  className={cn('group flex flex-col gap-1 max-w-[85%]', isMine ? 'items-end self-end' : 'items-start self-start')}
                >
                  <div className="flex items-center gap-1">
                    {isMine && !isDeleted && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity w-6 h-6 flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted shrink-0"
                            aria-label="خيارات الرسالة"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
                            onClick={() => setConfirmDeleteMessageId(message.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                            حذف الرسالة
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    <div
                      className={cn(
                        'rounded-2xl px-4 py-2.5 text-sm shadow-sm',
                        // FIX BUG-XX: rounded-br-sm/rounded-bl-sm are physical
                        // (bottom-right/bottom-left) in a dir="rtl" app
                        // (app/layout.tsx), so the "pointed" corner sat on the
                        // wrong side of the bubble. rounded-ee-sm/rounded-es-sm
                        // are logical (bottom-end/bottom-start) and follow the
                        // actual text direction instead.
                        isDeleted
                          ? 'bg-muted text-muted-foreground italic'
                          : isMine
                            ? 'bg-primary text-primary-foreground rounded-ee-sm'
                            : 'bg-card text-foreground rounded-es-sm'
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">
                        {isDeleted ? 'تم حذف هذه الرسالة' : message.body}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 px-1">
                    <span className="text-[10px] text-muted-foreground">
                      {formatTime(message.createdAt)}
                    </span>
                    {isMine && !isDeleted && (
                      message.readAt
                        ? <CheckCheck className="h-3.5 w-3.5 text-primary" aria-label="تمت القراءة" />
                        : <Check className="h-3.5 w-3.5 text-muted-foreground" aria-label="تم الإرسال" />
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      <MessageInput conversationId={conversationId} disabled={isBlocked} />

      <ConfirmDialog
        open={confirmBlockOpen}
        onOpenChange={setConfirmBlockOpen}
        title={`حظر ${party.name}؟`}
        description="لن يتمكن هذا المستخدم من مراسلتك، ولن تتمكن من مراسلته حتى تلغي الحظر."
        confirmLabel="حظر"
        destructive
        isPending={togglingBlock}
        onConfirm={() =>
          toggleBlock(party.id, { onSuccess: () => setConfirmBlockOpen(false) })
        }
      />

      <ConfirmDialog
        open={Boolean(confirmDeleteMessageId)}
        onOpenChange={(open) => !open && setConfirmDeleteMessageId(null)}
        title="حذف هذه الرسالة؟"
        description="سيظهر للطرف الآخر أن الرسالة محذوفة، ولا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف"
        destructive
        isPending={deletingMessage}
        onConfirm={() => {
          if (!confirmDeleteMessageId) return;
          deleteMessage(confirmDeleteMessageId, {
            onSuccess: () => setConfirmDeleteMessageId(null),
          });
        }}
      />
    </div>
  );
}
