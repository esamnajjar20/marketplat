'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { SafeImg } from '@/components/shared/ui/SafeImg';
import { AlertTriangle, ChevronRight, ChevronDown, MoreVertical, UserX, UserCheck, Check, CheckCheck, Clock, Trash2, Loader2, ShieldAlert, RotateCw, X as XIcon, Copy, Pin, Archive } from 'lucide-react';
import { toast } from 'sonner';
import { onTypingEvent } from '@/lib/typingStore';
import { classifyHttpConflict } from '@/lib/conflictResolver';
import { useSetConversationFlags } from '@/hooks/mutations/useConversationMutations';
import {
  messageDayLabel,
  sameCalendarDay,
  isTightFollowUp,
  splitMessageBody,
} from '@/lib/messageUtils';
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
import { usePendingMessages } from '@/hooks/queries/usePendingMessages';
import { retryQueuedMessage, discardQueuedMessage } from '@/lib/offlineMessagesQueue';
import { useIsUserBlocked } from '@/hooks/queries/useBlockedUsers';
import { useToggleUserBlock } from '@/hooks/mutations/useBlockedUsersMutations';
import { useDeleteMessage } from '@/hooks/mutations/useConversationMutations';
import { useUserPresence } from '@/hooks/queries/usePresence';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';
import { formatTime, formatRelativeTime } from '@/lib/formatters';
import { getAvatarUrl, getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
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
 * FEAT-OFFLINE-MSG: رسالة معروضة قد تكون حقيقية (من useMessages) أو
 * محلية بحتة — إما تفاؤلية (useSendMessage's onMutate، id بادئتها
 * `optimistic-`) أو مُصفّفة أوفلاين حقًا (usePendingMessages، id بادئتها
 * `queued-`، مصدرها IndexedDB عبر sw.js لا الذاكرة، فتنجو من إعادة تحميل
 * الصفحة). clientStatus يميّز الحالة الثانية عن رسالة حقيقية مؤكَّدة؛
 * queueId/lastError لا يُستخدَمان إلا لحالتَي queued/failed لتفعيل زر
 * إعادة المحاولة/الحذف.
 */
type DisplayMessage = Message & {
  clientStatus?: 'sending' | 'queued' | 'failed';
  queueId?: number;
  lastError?: { status: number; message?: string };
  /** Offline image upload still in SW queue (no preview URL available). */
  clientHasImage?: boolean;
};

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
  const [showSafetyTip, setShowSafetyTip] = useState(false);
  const {
    data: conversation,
    isLoading: conversationLoading,
    isError: conversationError,
  } = useConversation(conversationId);
  const {
    data: messagesPage,
    isLoading: messagesLoading,
    isError: messagesError,
    refetch: refetchMessages,
    isFetching: messagesFetching,
  } = useMessages(conversationId, {
    limit: MESSAGES_PAGE_SIZE,
  });
  const party = conversation ? otherParty(conversation, user?.id) : null;
  const isBlocked = useIsUserBlocked(party?.id ?? '');
  const partyPresence = useUserPresence(party?.id);
  const isPartyOnline = partyPresence.online;
  const { mutate: toggleBlock, isPending: togglingBlock } = useToggleUserBlock();
  const { mutate: deleteMessage, isPending: deletingMessage } = useDeleteMessage(conversationId);
  const [confirmDeleteMessageId, setConfirmDeleteMessageId] = useState<string | null>(null);
  const [partyTyping, setPartyTyping] = useState(false);
  const { mutate: setFlags, isPending: flagsPending } = useSetConversationFlags();
  const pendingQueued = usePendingMessages(conversationId);

  // Show the safety reminder once when entering a thread, then remove it
  // automatically so it never becomes permanent visual noise. sessionStorage
  // keeps it from reappearing when the user briefly remounts the thread.
  useEffect(() => {
    if (typeof window === 'undefined' || !conversationId) return;
    const key = `chat-safety-tip:${conversationId}`;
    if (window.sessionStorage.getItem(key)) return;
    setShowSafetyTip(true);
    window.sessionStorage.setItem(key, '1');
    const timer = window.setTimeout(() => setShowSafetyTip(false), 9000);
    return () => window.clearTimeout(timer);
  }, [conversationId]);
  useEffect(() => {
    setPartyTyping(false);
    let clearTimer: ReturnType<typeof setTimeout> | null = null;
    return onTypingEvent((ev) => {
      if (ev.conversationId !== conversationId) return;
      if (ev.userId === user?.id) return;
      setPartyTyping(ev.isTyping);
      if (clearTimer) clearTimeout(clearTimer);
      if (ev.isTyping) {
        clearTimer = setTimeout(() => setPartyTyping(false), 4000);
      }
    });
  }, [conversationId, user?.id]);

  const [retryingQueueId, setRetryingQueueId] = useState<number | null>(null);

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
  // FEAT-OFFLINE-MSG: rسائل مُصفّفة أوفلاين (pending/failed) تُلحَق دائمًا
  // بالنهاية — قوائم الطابور مرتّبة أصلاً بـ queuedAt تصاعديًا (انظر
  // listQueuedMessages)، وهي بالضرورة أحدث من أي رسالة حقيقية مؤكَّدة
  // وصلت السيرفر فعلاً.
  const queuedMessages: DisplayMessage[] = pendingQueued.map((q) => ({
    id: `queued-${q.queueId}`,
    conversationId,
    senderId: user?.id ?? '',
    body: q.body,
    // Offline image bodies live as FormData in the SW queue — no blob URL
    // here; hasImage surfaces a placeholder chip in the bubble.
    imageUrl: null,
    readAt: null,
    deletedAt: null,
    createdAt: new Date(q.queuedAt).toISOString(),
    clientStatus: q.status === 'pending' ? 'queued' : q.status,
    queueId: q.queueId,
    lastError: q.lastError,
    // DisplayMessage allows extra fields via intersection; stamp for UI.
    ...(q.hasImage ? { clientHasImage: true as const } : {}),
  })) as DisplayMessage[];
  const messages: DisplayMessage[] = [
    ...olderMessages.filter((m) => !liveIds.has(m.id)),
    ...liveMessages,
    ...queuedMessages,
  ];

  function handleRetryQueued(queueId: number) {
    setRetryingQueueId(queueId);
    retryQueuedMessage(queueId).finally(() => setRetryingQueueId(null));
  }

  function handleDiscardQueued(queueId: number) {
    discardQueuedMessage(queueId);
  }
  // Whether an older page beyond whichever page was fetched last is
  // still available: before any click, that's the live page-1 fetch's
  // own hasNextPage; after a click, it's the latest older-page fetch's
  // hasNextPage, since that one's now the frontier of what's loaded.
  const hasMoreOlder = Boolean((olderPage === null ? messagesPage : olderPageData)?.meta?.hasNextPage);

  // SW-FIX-CHAT-SCROLL-ANCHOR: the old version measured scrollHeight before
  // the setOlderPage state change and tried to restore the offset inside a
  // requestAnimationFrame — but that rAF fired before the network fetch for
  // the older page had even settled, so scrollHeight was unchanged, the
  // offset restoration was a no-op, and when the fetch actually arrived
  // ~300ms later the DOM grew above the user's reading position and threw
  // them forward. Anchor + useLayoutEffect keyed to olderMessages.length
  // runs synchronously after the commit that includes the new rows, before
  // paint, with the correct post-prepend scrollHeight.
  const pendingScrollAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);

  function handleLoadOlder() {
    const el = scrollRef.current;
    if (el) {
      pendingScrollAnchorRef.current = {
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
      };
    }
    setOlderPage((p) => (p ?? 1) + 1);
  }

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const anchor = pendingScrollAnchorRef.current;
    if (!el || !anchor) return;
    el.scrollTop = anchor.scrollTop + (el.scrollHeight - anchor.scrollHeight);
    pendingScrollAnchorRef.current = null;
  }, [olderMessages.length]);

  // FIX CHAT-AUTOSCROLL-CONTEXT-01: only auto-scroll to the newest
  // message when the user is already near the bottom. The previous
  // version called scrollIntoView unconditionally on every new-message
  // event, which in an active conversation yanked the user away from
  // whatever they were reading — e.g. scrolling back through a long
  // negotiation while the other party keeps sending. That's the same
  // bug Slack/WhatsApp/Telegram all solved long ago with exactly this
  // guard. Refs (not state) so the scroll listener doesn't cause a
  // re-render on every scroll event.
  const isNearBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const prevLiveCountRef = useRef(0);

  // FIX CHAT-SWITCH-OLDER-LEAK-01: older pagination state is local and
  // must not survive navigation between threads (A's page-3 rows would
  // otherwise merge into B). Also reset near-bottom so the new thread
  // opens following the latest messages.
  useEffect(() => {
    setOlderPage(null);
    setOlderMessages([]);
    isNearBottomRef.current = true;
    setShowJumpToLatest(false);
    prevLiveCountRef.current = 0;
  }, [conversationId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      // 150px threshold — generous enough that a small accidental
      // scroll doesn't disable the "follow new messages" behaviour,
      // tight enough that reading history definitely does.
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const near = distanceFromBottom < 150;
      isNearBottomRef.current = near;
      if (near) setShowJumpToLatest(false);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const total = liveMessages.length + queuedMessages.length;
    const grew = total > prevLiveCountRef.current;
    prevLiveCountRef.current = total;
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      setShowJumpToLatest(false);
    } else if (grew) {
      // FIX CHAT-JUMP-LATEST-01: user is reading history — offer a control
      // instead of yanking scroll.
      setShowJumpToLatest(true);
    }
    // FEAT-OFFLINE-MSG: a message queued while offline (usePendingMessages)
    // should scroll into view the same way a normally-sent one does —
    // still gated by the same near-bottom check above.
  }, [liveMessages.length, queuedMessages.length]);

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

  const contextCard = conversation
    ? conversation.context ?? (conversation.ad
        ? {
            type: 'ad' as const,
            id: conversation.ad.id,
            title: conversation.ad.title,
            imageUrl: conversation.ad.images?.[0] ?? null,
            url: ROUTES.adDetail(conversation.ad.id),
          }
        : conversation.serviceRequest?.listing
          ? {
              type: 'service' as const,
              id: conversation.serviceRequest.listing.id,
              title: conversation.serviceRequest.listing.title,
              imageUrl: conversation.serviceRequest.listing.images?.[0] ?? null,
              url: ROUTES.serviceDetail(conversation.serviceRequest.listing.id),
            }
          : null)
    : null;

  return (
    <div className="flex h-full flex-col bg-background">
      {contextCard && (
        <Link
          prefetch={false}
          href={contextCard.url}
          className="flex shrink-0 items-center gap-3 border-b border-border/70 bg-card px-3 py-2.5 transition-colors hover:bg-muted/40"
        >
          <div className="relative w-11 h-11 shrink-0 overflow-hidden rounded-lg bg-muted">
            <SafeImage
              src={contextCard.imageUrl ? getThumbnailUrl(contextCard.imageUrl, 88, 88) : PLACEHOLDER_SVG}
              alt={contextCard.title}
              fill
              className="object-cover"
              sizes="44px"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-2xs-tight text-muted-foreground">{contextCard.type === 'ad' ? 'بخصوص الإعلان' : contextCard.type === 'product' ? 'بخصوص المنتج' : 'بخصوص الخدمة'}</p>
            <p className="text-sm font-medium line-clamp-1">{contextCard.title}</p>
          </div>
        </Link>
      )}
      {showSafetyTip && (
        <div
          role="note"
          className="flex shrink-0 items-start gap-2 border-b border-warning/25 bg-warning-soft px-3 py-2 text-xs text-muted-foreground transition-opacity"
        >
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
          <p className="min-w-0 flex-1">
            نصيحة أمان: تفاوض داخل المنصة، ولا تدفع مقدّماً خارجها.
          </p>
          <button
            type="button"
            onClick={() => setShowSafetyTip(false)}
            className="-my-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-warning/10 hover:text-foreground"
            aria-label="إخفاء نصيحة الأمان"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/70 bg-card/90 px-3 py-3 shadow-xs backdrop-blur-md">
        {/* SW-FIX-CHAT-MOBILE-BACK: previously a <Link> that pushed a new
            /messages entry — every "back" then landed the user one step
            deeper in history instead of out of the thread. router.back()
            matches what the OS back button does on the same page. */}
        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined' && window.history.length > 1) {
              window.history.back();
            } else {
              window.location.href = ROUTES.messages;
            }
          }}
          className="lg:hidden flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
          aria-label="رجوع للمحادثات"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        <Link
          prefetch={false}
          href={ROUTES.userProfile(party.id)}
          className="flex items-center gap-3 min-w-0 flex-1 hover:opacity-80 transition-opacity"
        >
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
            {/* DESIGN-PASS MSG-01: "بخصوص: {title}" dropped here — the
                ad-context strip above (when conversation.ad exists)
                already shows that title next to a thumbnail, so this
                second line would repeat it verbatim right below.
                Online status now always gets this line when the ad
                strip is showing, instead of losing it to the ad
                condition it used to share an else-if with. */}
            {isPartyOnline ? (
              <p className="text-xs text-online line-clamp-1">متصل الآن</p>
            ) : partyPresence.lastSeenAt ? (
              <p className="text-xs text-muted-foreground line-clamp-1">آخر ظهور {formatRelativeTime(partyPresence.lastSeenAt)}</p>
            ) : null}
          </div>
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="shrink-0 flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors"
              aria-label="خيارات المحادثة — حظر أو إدارة"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={flagsPending}
              className="flex items-center gap-2 cursor-pointer"
              onClick={() =>
                setFlags({ id: conversationId, pinned: !conversation.pinnedAt })
              }
            >
              <Pin className="h-4 w-4" />
              {conversation.pinnedAt ? 'إلغاء التثبيت' : 'تثبيت المحادثة'}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={flagsPending}
              className="flex items-center gap-2 cursor-pointer"
              onClick={() =>
                setFlags({ id: conversationId, archived: !conversation.archivedAt })
              }
            >
              <Archive className="h-4 w-4" />
              {conversation.archivedAt ? 'إلغاء الأرشفة' : 'أرشفة المحادثة'}
            </DropdownMenuItem>
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

      <div
        ref={scrollRef}
        className="relative flex flex-1 flex-col gap-3 overflow-y-auto bg-surface-1/50 px-4 py-5"
        role="log"
        aria-relevant="additions"
        aria-label="سجل الرسائل"
      >
        {messagesLoading ? (
          <div className="flex justify-center py-8"><LoadingSpinner /></div>
        ) : messagesError && messages.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertTriangle className="h-10 w-10 text-muted-foreground" />
            <p className="text-destructive">تعذّر تحميل الرسائل</p>
            <Button
              variant="outline"
              size="sm"
              disabled={messagesFetching}
              onClick={() => void refetchMessages()}
            >
              {messagesFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'إعادة المحاولة'}
            </Button>
          </div>
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
            {messages.map((message, index) => {
              const isMine = message.senderId === user?.id;
              const isDeleted = Boolean(message.deletedAt);
              const prev = index > 0 ? messages[index - 1] : null;
              const showDay =
                !prev || !sameCalendarDay(prev.createdAt, message.createdAt);
              const tight = isTightFollowUp(prev, message);
              // UX-FIX (perceived-latency): useSendMessage's onMutate
              // (useConversationMutations.ts) writes a temporary message
              // with a client-generated `optimistic-...` id straight into
              // this same cache so it appears the instant "إرسال" is
              // pressed, before the server has responded. Flagged here
              // purely by id shape (no new field on Message itself) so
              // it renders as "sending" (faded, clock icon, no delete
              // menu — there's no real id to delete yet) instead of a
              // confirmed sent/read message until the real one replaces
              // it on refetch.
              const isOptimistic = message.id.startsWith('optimistic-');
              // FEAT-OFFLINE-MSG: a message sourced from usePendingMessages
              // (id `queued-...`) has no real server id — same "not a real,
              // persisted message yet" bucket as isOptimistic for the
              // purposes of the delete-message menu below.
              const clientStatus = message.clientStatus;
              const isLocalOnly = isOptimistic || clientStatus === 'queued' || clientStatus === 'failed';
              return (
                <div key={message.id} className={cn('flex w-full flex-col', tight ? 'mt-0.5' : 'mt-0')}>
                  {showDay && (
                    <div className="my-3 flex justify-center">
                      <span className="rounded-full border bg-card/90 px-3 py-0.5 text-2xs-tight font-medium text-muted-foreground shadow-sm">
                        {messageDayLabel(message.createdAt)}
                      </span>
                    </div>
                  )}
                <div
                  className={cn('group flex flex-col gap-1 max-w-[min(92%,28rem)] sm:max-w-[min(88%,32rem)]', isMine ? 'items-end self-end' : 'items-start self-start')}
                >
                  <div className="flex items-center gap-1">
                    {isMine && !isDeleted && !isLocalOnly && (
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
                            className="flex items-center gap-2 cursor-pointer"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(message.body);
                                toast.success('تم نسخ الرسالة');
                              } catch {
                                toast.error('تعذّر النسخ');
                              }
                            }}
                          >
                            <Copy className="h-4 w-4" />
                            نسخ
                          </DropdownMenuItem>
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
                        'rounded-2xl px-4 py-2.5 text-sm shadow-sm transition-opacity',
                        // FIX BUG-XX: rounded-br-sm/rounded-bl-sm are physical
                        // (bottom-right/bottom-left) in a dir="rtl" app
                        // (app/layout.tsx), so the "pointed" corner sat on the
                        // wrong side of the bubble. rounded-ee-sm/rounded-es-sm
                        // are logical (bottom-end/bottom-start) and follow the
                        // actual text direction instead.
                        isDeleted
                          ? 'bg-muted text-muted-foreground italic'
                          : isMine
                            ? 'rounded-ee-sm bg-primary text-primary-foreground shadow-xs'
                            : 'rounded-es-sm border border-border/80 bg-card text-foreground shadow-xs',
                        (isOptimistic || clientStatus === 'queued') && 'opacity-60',
                        clientStatus === 'failed' && 'opacity-80 ring-1 ring-destructive/40'
                      )}
                    >
                      {!isDeleted && message.audioUrl && (
                        <audio
                          controls
                          preload="metadata"
                          src={message.audioUrl}
                          className="mb-2 max-w-[260px] w-full"
                          aria-label="رسالة صوتية"
                        />
                      )}
                      {!isDeleted && message.imageUrl && (
                        <a
                          href={message.imageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mb-2 block overflow-hidden rounded-xl"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <SafeImg
                            src={message.imageUrl}
                            alt="صورة مرفقة"
                            className="max-h-56 max-w-full object-cover"
                          />
                        </a>
                      )}
                      {!isDeleted && !message.imageUrl && message.clientHasImage && (
                        <div
                          className="mb-2 flex h-28 max-w-[12rem] items-center justify-center rounded-xl bg-muted/80 text-2xl"
                          aria-label="صورة بانتظار الإرسال"
                        >
                          📷
                        </div>
                      )}
                      <p className="whitespace-pre-wrap break-words">
                        {isDeleted
                          ? 'تم حذف هذه الرسالة'
                          : message.body && message.body !== '📷' && message.body !== '🎤 رسالة صوتية'
                            ? splitMessageBody(message.body).map((part, i) =>
                                part.type === 'link' && part.href ? (
                                  <a
                                    key={i}
                                    href={part.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={cn(
                                      'underline underline-offset-2',
                                      isMine ? 'text-primary-foreground/95' : 'text-primary',
                                    )}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {part.value}
                                  </a>
                                ) : (
                                  <span key={i}>{part.value}</span>
                                ),
                              )
                            : null}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 px-1">
                    <span className="text-2xs text-muted-foreground">
                      {clientStatus === 'failed' ? 'فشل الإرسال' : formatTime(message.createdAt)}
                    </span>
                    {isMine && !isDeleted && (
                      isOptimistic || clientStatus === 'queued'
                        ? <Clock className="h-3 w-3 text-muted-foreground" aria-label={clientStatus === 'queued' ? 'بانتظار الاتصال' : 'جارٍ الإرسال'} />
                        : clientStatus === 'failed'
                          ? <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-label="فشل الإرسال" />
                          : message.readAt
                            ? <CheckCheck className="h-3.5 w-3.5 text-primary" aria-label="تمت القراءة" />
                            : <Check className="h-3.5 w-3.5 text-muted-foreground" aria-label="تم الإرسال" />
                    )}
                    {/* FEAT-OFFLINE-MSG: رسالة فشلت نهائيًا (4xx عند إعادة
                        المحاولة، مثلًا حظر الطرف الآخر أثناء الانقطاع) —
                        القرار (إعادة محاولة/حذف) يُترك للمستخدم صراحة بدل
                        إسقاطها بصمت (انظر FIX CONFLICT-01 بـ sw.js). */}
                    {clientStatus === 'failed' && message.queueId != null && (() => {
                      const conflict = classifyHttpConflict(
                        message.lastError?.status,
                        message.lastError?.message,
                      );
                      const showRetry = conflict.primaryAction === 'retry' || conflict.primaryAction === 'edit';
                      return (
                      <div className="flex items-center gap-2 ms-1">
                        {showRetry ? (
                        <button
                          type="button"
                          onClick={() => handleRetryQueued(message.queueId!)}
                          disabled={retryingQueueId === message.queueId || conflict.isTerminal}
                          title={conflict.isTerminal ? conflict.message : 'إعادة المحاولة'}
                          className="flex items-center gap-0.5 text-2xs font-medium text-primary hover:underline disabled:opacity-50"
                        >
                          <RotateCw className={cn('h-3 w-3', retryingQueueId === message.queueId && 'animate-spin')} />
                          {conflict.isTerminal ? 'تعارض' : 'إعادة المحاولة'}
                        </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleDiscardQueued(message.queueId!)}
                          className="flex items-center gap-0.5 text-2xs font-medium text-muted-foreground hover:text-destructive"
                        >
                          <XIcon className="h-3 w-3" />
                          {conflict.primaryAction === 'discard' ? 'تجاهل' : 'حذف'}
                        </button>
                      </div>
                      );
                    })()}
                  </div>
                  {/* CHATWINDOW-LASTERROR-GUARD-01: only render the
                      error line when lastError exists. Before this,
                      a failed message with no lastError (rare but
                      possible — the field is optional) went through
                      classifyHttpConflict(undefined, undefined), which
                      returns the 'network' kind, so the user saw a
                      misleading 'لا يوجد اتصال' for what might have
                      been a server-side rejection. `.status` below is
                      accessed without `?.` because the guard above
                      guarantees presence. */}
                  {clientStatus === 'failed' && message.lastError && (
                    <p className="px-1 text-2xs text-destructive/80">
                      {classifyHttpConflict(message.lastError.status, message.lastError.message).message}
                    </p>
                  )}
                </div>
                </div>
              );
            })}
          </>
        )}
        <div ref={bottomRef} />
        {showJumpToLatest && (
          <div className="sticky bottom-2 z-10 flex justify-center pointer-events-none">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="pointer-events-auto shadow-md gap-1.5 rounded-full"
              onClick={() => {
                isNearBottomRef.current = true;
                setShowJumpToLatest(false);
                bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
              }}
              aria-label="الانتقال إلى أحدث الرسائل"
            >
              <ChevronDown className="h-4 w-4" />
              رسائل جديدة
            </Button>
          </div>
        )}
      </div>

      {partyTyping && (
        <p aria-live="polite" className="border-t border-border/40 px-4 py-1.5 text-2xs-tight text-muted-foreground">
          يكتب الآن…
        </p>
      )}
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
