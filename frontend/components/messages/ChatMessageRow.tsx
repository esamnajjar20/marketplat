'use client';

import { memo } from 'react';
import { toast } from 'sonner';
import { SafeImg } from '@/components/shared/ui/SafeImg';
import { AlertTriangle, MoreVertical, Check, CheckCheck, Clock, Trash2, Copy, Pin, Star, RotateCw } from 'lucide-react';
import { classifyHttpConflict } from '@/lib/conflictResolver';
import { messageDayLabel, splitMessageBody } from '@/lib/messageUtils';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import { MediaDownloadButton } from './MediaDownloadButton';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/formatters';
import { getThumbnailUrl } from '@/lib/cloudinary';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/shared/ui/DropdownMenu';
import type { Message } from '@/types/conversation.types';

export type DisplayMessage = Message & {
  clientStatus?: 'sending' | 'queued' | 'failed' | 'cancelled';
  queueId?: number;
  lastError?: { status: number; message?: string };
  clientHasImage?: boolean;
  clientHasAudio?: boolean;
  clientHasFile?: boolean;
  clientFileName?: string;
};

interface Props {
  message: DisplayMessage;
  showDay: boolean;
  tight: boolean;
  isMine: boolean;
  conversationId: string;
  isRetrying: boolean;
  markPending: boolean;
  onMarkMessage: (input: { messageId: string; kind: 'star' | 'pin'; active: boolean }) => void;
  onDeleteRequest: (messageId: string) => void;
  onRetryQueued: (queueId: number) => void;
  onDiscardQueued: (queueId: number) => void;
  onCancelQueued: (queueId: number) => void;
  onEditQueued: (message: DisplayMessage) => void;
}

export const ChatMessageRow = memo(function ChatMessageRow({ message, showDay, tight, isMine, conversationId, isRetrying, markPending, onMarkMessage, onDeleteRequest, onRetryQueued, onDiscardQueued, onCancelQueued, onEditQueued }: Props) {
  const isDeleted = Boolean(message.deletedAt);
  const isOptimistic = message.id.startsWith('optimistic-');
  const clientStatus = message.clientStatus;
  const isLocalOnly = isOptimistic || clientStatus === 'queued' || clientStatus === 'failed' || clientStatus === 'cancelled';

  function renderQueuedActions() {
    if ((clientStatus !== 'failed' && clientStatus !== 'cancelled') || message.queueId == null) return null;
    const conflict = classifyHttpConflict(message.lastError?.status, message.lastError?.message);
    return (
      <div className="flex flex-wrap items-center gap-2 ms-1">
        <button type="button" onClick={() => onRetryQueued(message.queueId!)} disabled={isRetrying || (clientStatus === 'failed' && conflict.isTerminal)} className="flex items-center gap-0.5 text-2xs font-medium text-primary hover:underline disabled:opacity-50" title={conflict.isTerminal ? conflict.message : 'إعادة الإرسال'}>
          <RotateCw className={cn('h-3 w-3', isRetrying && 'animate-spin')} />إعادة الإرسال
        </button>
        <button type="button" onClick={() => onEditQueued(message)} className="text-2xs font-medium text-primary hover:underline">تعديل</button>
        {clientStatus === 'failed' ? (
          <button type="button" onClick={() => { onCancelQueued(message.queueId!); toast.message('تم إيقاف الإرسال', { description: 'المحتوى محفوظ على جهازك ويمكنك إعادة إرساله لاحقًا.' }); }} className="text-2xs font-medium text-muted-foreground hover:text-foreground">إلغاء الإرسال</button>
        ) : (
          <button type="button" onClick={() => onDiscardQueued(message.queueId!)} className="text-2xs font-medium text-muted-foreground hover:text-destructive">حذف نهائي</button>
        )}
      </div>
    );
  }

            return (
              <div key={message.id} className={cn('[content-visibility:auto] [contain-intrinsic-size:auto_320px] flex w-full flex-col', tight ? 'mt-0.5' : 'mt-0')}>
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
                        {!isDeleted && (
                          <>
                            <DropdownMenuItem
                              className="flex items-center gap-2 cursor-pointer"
                              disabled={markPending}
                              onClick={() => onMarkMessage({ messageId: message.id, kind: 'star', active: !message.isStarredByMe })}
                            >
                              <Star className={cn('h-4 w-4', message.isStarredByMe && 'fill-current')} />
                              {message.isStarredByMe ? 'إلغاء التمييز' : 'تمييز الرسالة'}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="flex items-center gap-2 cursor-pointer"
                              disabled={markPending}
                              onClick={() => onMarkMessage({ messageId: message.id, kind: 'pin', active: !message.isPinned })}
                            >
                              <Pin className={cn('h-4 w-4', message.isPinned && 'fill-current')} />
                              {message.isPinned ? 'إلغاء تثبيت الرسالة' : 'تثبيت الرسالة'}
                            </DropdownMenuItem>
                          </>
                        )}
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
                          onClick={() => onDeleteRequest(message.id)}
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
                      isOptimistic && 'opacity-60',
                      clientStatus === 'queued' && 'opacity-100',
                      clientStatus === 'failed' && 'opacity-80 ring-1 ring-destructive/40'
                    )}
                  >
                    {!isDeleted && (message.isPinned || message.isStarredByMe) && (
                      <div className={cn('mb-1.5 flex items-center gap-1 text-2xs', isMine ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                        {message.isPinned && <><Pin className="h-3 w-3" /> <span>مثبتة</span></>}
                        {message.isPinned && message.isStarredByMe && <span>·</span>}
                        {message.isStarredByMe && <><Star className="h-3 w-3 fill-current" /> <span>مميزة</span></>}
                      </div>
                    )}
                    {!isDeleted && message.audioUrl && (
                      <div className="mb-2">
                        <VoiceMessagePlayer
                          src={message.audioUrl}
                          variant={isMine ? 'mine' : 'theirs'}
                        />
                        <MediaDownloadButton conversationId={conversationId} messageId={message.id} kind="audio" label="تحميل التسجيل" className="mt-1" />
                      </div>
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
                          src={getThumbnailUrl(message.imageUrl, 480, 360)}
                          alt="صورة مرفقة"
                          className="max-h-56 max-w-full object-cover"
                        />
                      </a>
                    )}
                    {!isDeleted && message.fileUrl && (
                      <div className="mb-2 flex max-w-[280px] items-center gap-3 rounded-xl border border-border/70 bg-black/5 p-3 dark:bg-white/5">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">📎</div>
                        <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold" title={message.fileName ?? undefined}>{message.fileName ?? 'ملف مرفق'}</p>{message.fileSize ? <p className="text-2xs text-muted-foreground">{message.fileSize < 1048576 ? `${Math.round(message.fileSize / 1024)} KB` : `${(message.fileSize / 1048576).toFixed(1)} MB`}</p> : null}</div>
                        <div className="flex shrink-0 items-center gap-1"><a href={message.fileUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg p-2 text-xs text-primary hover:bg-muted">فتح</a><MediaDownloadButton conversationId={conversationId} messageId={message.id} kind="file" fileName={message.fileName} label="تحميل" className="h-9 min-h-9 px-2" /></div>
                      </div>
                    )}
                    {!isDeleted && !message.imageUrl && message.clientHasImage && (
                      <div
                        className="mb-2 flex h-28 max-w-[12rem] items-center justify-center rounded-xl bg-muted/80 text-2xl"
                        aria-label="صورة بانتظار الإرسال"
                      >
                        📷
                      </div>
                    )}
                    {!isDeleted && !message.fileUrl && message.clientHasFile && (
                      <div className="mb-2 flex min-w-[12rem] items-center gap-2 rounded-xl bg-muted/80 px-3 py-2 text-sm"><span aria-hidden>📎</span><span className="truncate">{message.clientFileName ?? 'ملف'}</span></div>
                    )}
                    {!isDeleted && !message.audioUrl && message.clientHasAudio && (
                      <div
                        className="mb-2 flex min-w-[12rem] items-center gap-2 rounded-xl bg-muted/80 px-3 py-2 text-sm"
                        aria-label="رسالة صوتية بانتظار الإرسال"
                      >
                        <span aria-hidden>🎤</span>
                        <span>رسالة صوتية</span>
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
                    {clientStatus === 'failed' ? 'تعذّر الإرسال' : clientStatus === 'cancelled' ? 'الإرسال ملغى — المحتوى محفوظ' : formatTime(message.createdAt)}
                  </span>
                  {isMine && !isDeleted && (
                    isOptimistic || clientStatus === 'queued'
                      ? <Clock className="h-3 w-3 text-muted-foreground" aria-label={clientStatus === 'queued' ? 'بانتظار الاتصال' : 'جارٍ الإرسال'} />
                      : clientStatus === 'failed' || clientStatus === 'cancelled'
                        ? <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-label="فشل الإرسال" />
                        : message.readAt
                          ? <CheckCheck className="h-3.5 w-3.5 text-primary" aria-label="تمت القراءة" />
                          : <Check className="h-3.5 w-3.5 text-muted-foreground" aria-label="تم الإرسال" />
                  )}
                  {/* FEAT-OFFLINE-MSG: رسالة فشلت نهائيًا (4xx عند إعادة
                      المحاولة، مثلًا حظر الطرف الآخر أثناء الانقطاع) —
                      القرار (إعادة محاولة/حذف) يُترك للمستخدم صراحة بدل
                      إسقاطها بصمت (انظر FIX CONFLICT-01 بـ sw.js). */}
                  {renderQueuedActions()}
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
              </div>
            );
});
