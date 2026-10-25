'use client';

import { memo } from 'react';
import { AlertTriangle, Check, CheckCheck, Clock } from 'lucide-react';
import { formatTime } from '@/lib/formatters';
import { classifyHttpConflict } from '@/lib/conflictResolver';
import type { DisplayMessage } from './messageTypes';

type Props = { message: DisplayMessage; isMine: boolean };

export const MessageStatusBar = memo(function MessageStatusBar({ message, isMine }: Props) {
  const isOptimistic = message.id.startsWith('optimistic-');
  const status = message.clientStatus;
  const outgoingStatus = !isMine || message.deletedAt
    ? null
    : status === 'queued'
      ? 'بانتظار الاتصال'
      : status === 'sending' || isOptimistic
        ? 'جارٍ الإرسال'
        : status === 'failed'
          ? 'تعذّر الإرسال'
          : status === 'cancelled'
            ? 'الإرسال ملغى — المحتوى محفوظ'
            : message.readAt
              ? 'تمت القراءة'
              : 'تم الإرسال';
  const announceStatus = status === 'queued' || status === 'sending' || status === 'failed' || status === 'cancelled' || isOptimistic;

  return <div className="flex items-center gap-1 px-1">
    <span className="text-2xs text-muted-foreground">{status === 'failed' ? 'تعذّر الإرسال' : status === 'cancelled' ? 'الإرسال ملغى — المحتوى محفوظ' : formatTime(message.createdAt)}</span>
    {outgoingStatus && <>
      <span className="sr-only" role={announceStatus ? 'status' : undefined} aria-live={announceStatus ? 'polite' : undefined} aria-atomic={announceStatus ? 'true' : undefined}>{outgoingStatus}</span>
      {(status === 'queued' || status === 'sending' || isOptimistic) && <Clock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />}
      {(status === 'failed' || status === 'cancelled') && <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />}
      {(!status || (status !== 'queued' && status !== 'sending' && status !== 'failed' && status !== 'cancelled' && !isOptimistic)) && (message.readAt ? <CheckCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> : <Check className="h-3 w-3 text-muted-foreground" aria-hidden="true" />)}
    </>}
    {status === 'failed' && message.lastError && <p className="px-1 text-2xs text-destructive/80">{classifyHttpConflict(message.lastError.status, message.lastError.message).message}</p>}
  </div>;
});
