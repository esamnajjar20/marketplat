'use client';

import { memo } from 'react';
import { toast } from 'sonner';
import { RotateCw } from 'lucide-react';
import { classifyHttpConflict } from '@/lib/conflictResolver';
import { cn } from '@/lib/utils';
import type { DisplayMessage } from './messageTypes';

type Props = { message: DisplayMessage; isRetrying: boolean; onRetryQueued: (queueId: number) => void; onDiscardQueued: (queueId: number) => void; onCancelQueued: (queueId: number) => void; onEditQueued: (message: DisplayMessage) => void };

export const MessageQueuedActions = memo(function MessageQueuedActions({ message, isRetrying, onRetryQueued, onDiscardQueued, onCancelQueued, onEditQueued }: Props) {
  if ((message.clientStatus !== 'failed' && message.clientStatus !== 'cancelled') || message.queueId == null) return null;
  const conflict = classifyHttpConflict(message.lastError?.status, message.lastError?.message);
  return <div className="flex flex-wrap items-center gap-2 ms-1">
    <button type="button" onClick={() => onRetryQueued(message.queueId!)} disabled={isRetrying || (message.clientStatus === 'failed' && conflict.isTerminal)} className="flex items-center gap-0.5 text-2xs font-medium text-primary hover:underline disabled:opacity-50" title={conflict.isTerminal ? conflict.message : 'إعادة الإرسال'}><RotateCw className={cn('h-3 w-3', isRetrying && 'animate-spin')} />إعادة الإرسال</button>
    <button type="button" onClick={() => onEditQueued(message)} className="text-2xs font-medium text-primary hover:underline">تعديل</button>
    {message.clientStatus === 'failed' ? <button type="button" onClick={() => { onCancelQueued(message.queueId!); toast.message('تم إيقاف الإرسال', { description: 'المحتوى محفوظ على جهازك ويمكنك إعادة إرساله لاحقًا.' }); }} className="text-2xs font-medium text-muted-foreground hover:text-foreground">إلغاء الإرسال</button> : <button type="button" onClick={() => onDiscardQueued(message.queueId!)} className="text-2xs font-medium text-muted-foreground hover:text-destructive">حذف نهائي</button>}
  </div>;
});
