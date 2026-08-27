'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { AlertTriangle, ChevronRight, MoreVertical, UserX, UserCheck, Check, CheckCheck, Clock, Trash2, Loader2, ShieldAlert, X } from 'lucide-react';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
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
import { ReportUserButtonGate } from '@/components/profile/ReportUserButtonGate';
import { useConversation, useMessages } from '@/hooks/queries/useConversations';
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
  const [showSafetyTip, setShowSafetyTip] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      return sessionStorage.getItem('msg-safety-tip-dismissed') !== '1';
    } catch {
      return true;
    }
  });

  // FIX UX-GAP-03: `page` starts at null (unused — the live query above
  // already covers page 1) and only becomes a real second fetch once
  // "تحميل رسائل أقدم" is clicked, via the `enabled`-equivalent branch
  // below (page argument only set once olderPage is non-null).
  const [olderPage, setOlderPage] = useState<number | null>(null);
  const [olderMessages, setOlderMessages] = useState<Message[]>([]);
  // FIX UX-GAP-03c: store scroll anchor until older messages actually land
  // in the DOM (the previous rAF ran before the fetch finished).
  const scrollAnchorRef = useRef<{ height: number; top: number } | null>(null);

  const { data: olderPageData, isFetching: fetchingOlder } = useMessages(
    conversationId,
    { page: olderPage ?? 2, limit: MESSAGES_PAGE_SIZE },
    { enabled: olderPage !== null },
  );

  useEffect(() => {
    if (olderPage === null || !olderPageData) return;
    setOlderMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const fresh = olderPageData.items.filter((m) => !seen.has(m.id));
      return fresh.length ? [...fresh, ...prev] : prev;
    });
  }, [olderPage, olderPageData]);

  // Restore scroll after older messages are committed to the DOM.
  useLayoutEffect(() => {
    const anchor = scrollAnchorRef.current;
    const el = scrollRef.current;
    if (!anchor || !el) return;
    el.scrollTop = anchor.top + (el.scrollHeight - anchor.height);
    scrollAnchorRef.current = null;
  }, [olderMessages]);

  const liveMessages = messagesPage?.items ?? [];
  const liveIds = new Set(liveMessages.map((m) => m.id));
  const messages = [...olderMessages.filter((m) => !liveIds.has(m.id)), ...liveMessages];
  const hasMoreOlder = Boolean((olderPage === null ? messagesPage : olderPageData)?.meta?.hasNextPage);

  function handleLoadOlder() {
    if (scrollRef.current) {
      scrollAnchorRef.current = {
        height: scrollRef.current.scrollHeight,
        top: scrollRef.current.scrollTop,
      };
    }
    setOlderPage((p) => (p ?? 1) + 1);
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
          className="flex items-center gap-3 border-b bg-card px-3 py-2.5 shrink-0 hover:bg-muted/40 transition-colors"
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
      {!conversation.ad && conversation.serviceRequest && (
        <Link
          href={ROUTES.serviceRequestDetail(conversation.serviceRequest.id)}
          className="flex items-center gap-3 border-b bg-card px-3 py-2.5 shrink-0 hover:bg-muted/40 transition-colors"
        >
          <div className="relative w-11 h-11 shrink-0 overflow-hidden rounded-lg bg-muted">
            <SafeImage
              src={conversation.serviceRequest.listing?.images?.[0] ? getThumbnailUrl(conversation.serviceRequest.listing.images[0], 88, 88) : PLACEHOLDER_SVG}
              alt={conversation.serviceRequest.listing?.title ?? 'طلب خدمة'}
              fill
              className="object-cover"
              sizes="44px"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium line-clamp-1">
              {conversation.serviceRequest.listing?.title ?? 'طلب خدمة'}
            </p>
            <p className="text-xs text-muted-foreground line-clamp-1">بخصوص طلب خدمة</p>
          </div>
        </Link>
      )}

      {/* Trust tip — dismissible per session */}
      {showSafetyTip && (
        <div
          role="note"
          className="flex items-start gap-2 border-b border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground"
        >
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <p className="flex-1 leading-relaxed">
            نصيحة أمان: تفاوض داخل المنصة، ولا تدفع مقدّماً خارجها. إن شعرت بشيء مريب استخدم «خيارات المحادثة».
          </p>
          <button
            type="button"
            className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-amber-500/10 hover:text-foreground"
            aria-label="إخفاء النصيحة"
            onClick={() => {
              setShowSafetyTip(false);
              try { sessionStorage.setItem('msg-safety-tip-dismissed', '1'); } catch { /* ignore */ }
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 bg-card/90 backdrop-blur-md shadow-sm px-3 py-3 sticky top-0 z-10">
        <Link
          href={ROUTES.messages}
          className="lg:hidden w-9 h-9 flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors shrink-0"
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
            <p className={cn('text-xs line-clamp-1', isPartyOnline ? 'text-online' : 'text-muted-foreground')}>
              {isPartyOnline ? 'متصل الآن' : isBlocked ? 'محظور' : 'آخر ظهور غير معروف'}
            </p>
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
            {party && (
              <div className="px-2 py-1.5 border-t mt-1">
                <ReportUserButtonGate targetUserId={party.id} />
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 flex flex-col gap-1.5 bg-muted/30 dark:bg-muted/15"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, hsl(var(--border) / 0.4) 1px, transparent 0)',
          backgroundSize: '18px 18px',
        }}
      >
        {messagesLoading ? (
          <div className="flex justify-center py-8"><LoadingSpinner /></div>
        ) : messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldAlert className="h-6 w-6" aria-hidden />
            </div>
            <div className="space-y-1 max-w-xs">
              <p className="font-semibold text-foreground">ابدأ المحادثة</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                أرسل أول رسالة — يمكنك استخدام القوالب السريعة بالأسفل.
              </p>
            </div>
          </div>
        ) : (
          <>
            {hasMoreOlder && (
              <div className="flex justify-center py-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={fetchingOlder}
                  onClick={handleLoadOlder}
                  className="gap-2 rounded-full shadow-sm"
                >
                  {fetchingOlder ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  تحميل رسائل أقدم
                </Button>
              </div>
            )}
            {messages.map((message, index) => {
              const isMine = message.senderId === user?.id;
              const isDeleted = Boolean(message.deletedAt);
              const isOptimistic = message.id.startsWith('optimistic-');
              const prev = index > 0 ? messages[index - 1] : null;
              const showDateSep = (() => {
                if (!prev) return true;
                const a = new Date(prev.createdAt).toDateString();
                const b = new Date(message.createdAt).toDateString();
                return a !== b;
              })();
              const tight = prev && prev.senderId === message.senderId && !showDateSep;

              return (
                <div key={message.id} className="contents">
                  {showDateSep && (
                    <div className="flex justify-center py-3">
                      <span className="rounded-full bg-background/90 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm border">
                        {new Date(message.createdAt).toLocaleDateString('ar', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </div>
                  )}
                  <div
                    className={cn(
                      'group flex flex-col max-w-[min(85%,28rem)]',
                      isMine ? 'items-end self-end' : 'items-start self-start',
                      tight ? 'mt-0.5' : 'mt-2',
                    )}
                  >
                    <div className={cn('flex items-end gap-1', isMine && 'flex-row-reverse')}>
                      {isMine && !isDeleted && !isOptimistic && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted shrink-0"
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
                          'rounded-2xl px-3.5 py-2 text-sm shadow-sm transition-opacity leading-relaxed',
                          isDeleted
                            ? 'bg-muted/80 text-muted-foreground italic border border-border/50'
                            : isMine
                              ? 'bg-primary text-primary-foreground rounded-ee-md'
                              : 'bg-card text-foreground rounded-es-md border border-border/60 dark:bg-card dark:border-border/80 dark:shadow-none',
                          isOptimistic && 'opacity-60',
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">
                          {isDeleted ? 'تم حذف هذه الرسالة' : message.body}
                        </p>
                      </div>
                    </div>
                    <div className={cn('flex items-center gap-1 px-1.5 mt-0.5', isMine && 'flex-row-reverse')}>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {formatTime(message.createdAt)}
                      </span>
                      {isMine && !isDeleted && (
                        isOptimistic
                          ? <Clock className="h-3 w-3 text-muted-foreground" aria-label="جارٍ الإرسال" />
                          : message.readAt
                            ? <CheckCheck className="h-3.5 w-3.5 text-primary" aria-label="تمت القراءة" />
                            : <Check className="h-3.5 w-3.5 text-muted-foreground" aria-label="تم الإرسال" />
                      )}
                    </div>
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
