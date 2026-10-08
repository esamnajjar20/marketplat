'use client';

import { memo } from 'react';
import { SafeImg } from '@/components/shared/ui/SafeImg';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import { MediaDownloadButton } from './MediaDownloadButton';
import { cn } from '@/lib/utils';
import { getThumbnailUrl } from '@/lib/cloudinary';
import { splitMessageBody } from '@/lib/messageUtils';
import type { DisplayMessage } from './messageTypes';

type Props = { message: DisplayMessage; conversationId: string; isMine: boolean };

export const MessageMedia = memo(function MessageMedia({ message, conversationId, isMine }: Props) {
  if (message.deletedAt) return <p className="whitespace-pre-wrap break-words">تم حذف هذه الرسالة</p>;
  return (
    <>
      {(message.isPinned || message.isStarredByMe) && (
        <div className={cn('mb-1.5 flex items-center gap-1 text-2xs', isMine ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
          {message.isPinned && <><span aria-hidden>📌</span><span>مثبتة</span></>}
          {message.isPinned && message.isStarredByMe && <span>·</span>}
          {message.isStarredByMe && <><span aria-hidden>⭐</span><span>مميزة</span></>}
        </div>
      )}
      {message.audioUrl && <div className="mb-2"><VoiceMessagePlayer src={message.audioUrl} variant={isMine ? 'mine' : 'theirs'} /><MediaDownloadButton conversationId={conversationId} messageId={message.id} kind="audio" label="تحميل التسجيل" className="mt-1" /></div>}
      {message.imageUrl && <a href={message.imageUrl} target="_blank" rel="noopener noreferrer" className="mb-2 block overflow-hidden rounded-xl" onClick={(e) => e.stopPropagation()}><SafeImg src={getThumbnailUrl(message.imageUrl, 480, 360)} alt="صورة مرفقة" className="max-h-56 max-w-full object-cover" /></a>}
      {message.fileUrl && <div className="mb-2 flex max-w-[280px] items-center gap-3 rounded-xl border border-border/70 bg-black/5 p-3 dark:bg-white/5"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">📎</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold" title={message.fileName ?? undefined}>{message.fileName ?? 'ملف مرفق'}</p>{message.fileSize ? <p className="text-2xs text-muted-foreground">{message.fileSize < 1048576 ? `${Math.round(message.fileSize / 1024)} KB` : `${(message.fileSize / 1048576).toFixed(1)} MB`}</p> : null}</div><div className="flex shrink-0 items-center gap-1"><a href={message.fileUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg p-2 text-xs text-primary hover:bg-muted">فتح</a><MediaDownloadButton conversationId={conversationId} messageId={message.id} kind="file" fileName={message.fileName} label="تحميل" className="h-9 min-h-9 px-2" /></div></div>}
      {!message.imageUrl && message.clientHasImage && <div className="mb-2 flex h-28 max-w-[12rem] items-center justify-center rounded-xl bg-muted/80 text-2xl" aria-label="صورة بانتظار الإرسال">📷</div>}
      {!message.fileUrl && message.clientHasFile && <div className="mb-2 flex min-w-[12rem] items-center gap-2 rounded-xl bg-muted/80 px-3 py-2 text-sm"><span aria-hidden>📎</span><span className="truncate">{message.clientFileName ?? 'ملف'}</span></div>}
      {!message.audioUrl && message.clientHasAudio && <div className="mb-2 flex min-w-[12rem] items-center gap-2 rounded-xl bg-muted/80 px-3 py-2 text-sm" aria-label="رسالة صوتية بانتظار الإرسال"><span aria-hidden>🎤</span><span>رسالة صوتية</span></div>}
      <p className="whitespace-pre-wrap break-words">{message.body && message.body !== '📷' && message.body !== '🎤 رسالة صوتية' ? splitMessageBody(message.body).map((part, i) => part.type === 'link' && part.href ? <a key={i} href={part.href} target="_blank" rel="noopener noreferrer" className={cn('underline underline-offset-2', isMine ? 'text-primary-foreground/95' : 'text-primary')} onClick={(e) => e.stopPropagation()}>{part.value}</a> : <span key={i}>{part.value}</span>) : null}</p>
    </>
  );
});
