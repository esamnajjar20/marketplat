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
  return <div className="flex items-center gap-1 px-1">
    <span className="text-2xs text-muted-foreground">{status === 'failed' ? 'تعذّر الإرسال' : status === 'cancelled' ? 'الإرسال ملغى — المحتوى محفوظ' : formatTime(message.createdAt)}</span>
    {isMine && !message.deletedAt && (isOptimistic || status === 'queued' ? <Clock className="h-3 w-3 text-muted-foreground" aria-label={status === 'queued' ? 'بانتظار الاتصال' : 'جارٍ الإرسال'} /> : status === 'failed' || status === 'cancelled' ? <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-label="فشل الإرسال" /> : message.readAt ? <CheckCheck className="h-3.5 w-3.5 text-primary" aria-label="تمت القراءة" /> : <Check className="h-3 w-3 text-muted-foreground" aria-label="تم الإرسال" />)}
    {status === 'failed' && message.lastError && <p className="px-1 text-2xs text-destructive/80">{classifyHttpConflict(message.lastError.status, message.lastError.message).message}</p>}
  </div>;
});
