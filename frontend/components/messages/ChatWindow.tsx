'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { AlertTriangle, ChevronRight, MoreVertical, UserX, UserCheck, Check, CheckCheck, Clock, Trash2, Loader2, ShieldAlert, RotateCw, X as XIcon, Copy, Pin, Archive } from 'lucide-react';
import { toast } from 'sonner';
import { onTypingEvent } from '@/lib/typingStore';
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
import { ReportAdButton } from '@/components/ads/ReportAdButton';
import { useConversation, useMessages } from '@/hooks/queries/useConversations';
import { usePendingMessages } from '@/hooks/queries/usePendingMessages';
import { retryQueuedMessage, discardQueuedMessage } from '@/lib/offlineMessagesQueue';
import { useIsUserBlocked } from '@/hooks/queries/useBlockedUsers';
import { useToggleUserBlock } from '@/hooks/mutations/useBlockedUsersMutations';
import { useDeleteMessage } from '@/hooks/mutations/useConversationMutations';
import { useIsUserOnline } from '@/hooks/queries/usePresence';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';
import { formatTime } from '@/lib/formatters';
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
  const [partyTyping, setPartyTyping] = useState(false);
  const { mutate: setFlags, isPending: flagsPending } = useSetConversationFlags();
  const pendingQueued = usePendingMessages(conversationId);
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
    imageUrl: null,
    readAt: null,
    deletedAt: null,
    createdAt: new Date(q.queuedAt).toISOString(),
    clientStatus: q.status === "pending" ? "queued" : q.status,
    queueId: q.queueId,
    lastError: q.lastError,
  }));
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
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      // 150px threshold — generous enough that a small accidental
      // scroll doesn't disable the "follow new messages" behaviour,
      // tight enough that reading history definitely does.
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      isNearBottomRef.current = distanceFromBottom < 150;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  return (
    <div className="flex h-full flex-col bg-background">
      {/* DESIGN-PASS MSG-01: ad-context strip — matches the reference
          design's thumbnail+title bar above the party-info row, so a
          reader can tell which listing this thread is about without
          scrolling into the messages themselves. Only title/thumbnail
          are shown, NOT price: ConversationAdSummary (conversation.types.ts)
          carries id/title/images/status only — no price field exists on
          this type or anywhere else this component has access to, so a
          price here would have to be invented rather than real. Hidden
          entirely for a general (non-ad) conversation, same condition
          ConversationList already uses for its "محادثة عامة" fallback. */}
      {conversation.ad && (
        <Link
          href={ROUTES.adDetail(conversation.ad.id)}
          className="flex shrink-0 items-center gap-3 border-b border-border/70 bg-card px-3 py-2.5 transition-colors hover:bg-muted/40"
        >
          <div className="relative w-11 h-11 shrink-0 overflow-hidden rounded-lg bg-muted">
            <SafeImage
              src={conversation.ad.images?.[0] ? getThumbnailUrl(conversation.ad.images[0], 88, 88) : PLACEHOLDER_SVG}
              alt={conversation.ad.title}
              fill
              className="object-cover"
              sizes="44px"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium line-clamp-1">{conversation.ad.title}</p>
            {conversation.ad.status !== 'ACTIVE' && (
              <p className="text-xs text-muted-foreground">
                {conversation.ad.status === 'SOLD' ? 'تم البيع' : 'أُزيل الإعلان'}
              </p>
            )}
          </div>
        </Link>
      )}
      {conversation.ad && conversation.ad.status === 'ACTIVE' && (
        <div className="flex justify-end border-b bg-card/50 px-3 py-1.5">
          <ReportAdButton adId={conversation.ad.id} />
        </div>
      )}

      {/* Trust tip — once per thread, above the sticky party header */}
      <div
        role="note"
        className="flex items-start gap-2 border-b border-warning/25 bg-warning-soft px-3 py-2 text-xs text-muted-foreground"
      >
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
        <p>
          نصيحة أمان: تفاوض داخل المنصة، ولا تدفع مقدّماً خارجها. إن شعرت بشيء مريب استخدم «خيارات المحادثة».
        </p>
      </div>

      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/70 bg-card/90 px-3 py-3 shadow-xs backdrop-blur-md">
        <Link
          href={ROUTES.messages}
          className="lg:hidden flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
        >
          <ChevronRight className="h-5 w-5" />
        </Link>
        <Link
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
            {isPartyOnline && (
              <p className="text-xs text-online line-clamp-1">متصل الآن</p>
            )}
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

      <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto bg-surface-1/50 px-4 py-5">
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
                      <span className="rounded-full border bg-card/90 px-3 py-0.5 text-[11px] font-medium text-muted-foreground shadow-sm">
                        {messageDayLabel(message.createdAt)}
                      </span>
                    </div>
                  )}
                <div
                  className={cn('group flex flex-col gap-1 max-w-[85%]', isMine ? 'items-end self-end' : 'items-start self-start')}
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
                      {!isDeleted && message.imageUrl && (
                        <a
                          href={message.imageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mb-2 block overflow-hidden rounded-xl"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={message.imageUrl}
                            alt=""
                            className="max-h-56 max-w-full object-cover"
                          />
                        </a>
                      )}
                      <p className="whitespace-pre-wrap break-words">
                        {isDeleted
                          ? 'تم حذف هذه الرسالة'
                          : message.body && message.body !== '📷'
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
                    <span className="text-[10px] text-muted-foreground">
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
                    {clientStatus === 'failed' && message.queueId != null && (
                      <div className="flex items-center gap-2 ms-1">
                        <button
                          type="button"
                          onClick={() => handleRetryQueued(message.queueId!)}
                          disabled={retryingQueueId === message.queueId}
                          className="flex items-center gap-0.5 text-[10px] font-medium text-primary hover:underline disabled:opacity-50"
                        >
                          <RotateCw className={cn('h-3 w-3', retryingQueueId === message.queueId && 'animate-spin')} />
                          إعادة المحاولة
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDiscardQueued(message.queueId!)}
                          className="flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground hover:text-destructive"
                        >
                          <XIcon className="h-3 w-3" />
                          حذف
                        </button>
                      </div>
                    )}
                  </div>
                  {clientStatus === 'failed' && message.lastError?.message && (
                    <p className="px-1 text-[10px] text-destructive/80">{message.lastError.message}</p>
                  )}
                </div>
                </div>
              );
            })}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {partyTyping && (
        <p className="border-t border-border/40 px-4 py-1.5 text-[11px] text-muted-foreground">
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
