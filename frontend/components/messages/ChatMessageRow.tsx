'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';
import { messageDayLabel } from '@/lib/messageUtils';
import { classifyHttpConflict } from '@/lib/conflictResolver';
import { MessageActionsMenu } from './MessageActionsMenu';
import { MessageMedia } from './MessageMedia';
import { MessageQueuedActions } from './MessageQueuedActions';
import { MessageStatusBar } from './MessageStatusBar';
import type { DisplayMessage } from './messageTypes';

export type { DisplayMessage } from './messageTypes';

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

  return (
    <div className={cn('[content-visibility:auto] [contain-intrinsic-size:auto_320px] flex w-full flex-col', tight ? 'mt-0.5' : 'mt-0')}>
      {showDay && <div className="my-3 flex justify-center"><span className="rounded-full border bg-card/90 px-3 py-0.5 text-2xs-tight font-medium text-muted-foreground shadow-sm">{messageDayLabel(message.createdAt)}</span></div>}
      <div className={cn('group flex flex-col gap-1 max-w-[min(92%,28rem)] sm:max-w-[min(88%,32rem)]', isMine ? 'items-end self-end' : 'items-start self-start')}>
        <div className="flex items-center gap-1">
          {isMine && !isDeleted && !isLocalOnly && <MessageActionsMenu message={message} markPending={markPending} onMarkMessage={onMarkMessage} onDeleteRequest={onDeleteRequest} />}
          <div className={cn('rounded-2xl px-4 py-2.5 text-sm shadow-sm transition-opacity', isDeleted ? 'bg-muted text-muted-foreground italic' : isMine ? 'rounded-ee-sm bg-primary text-primary-foreground shadow-xs' : 'rounded-es-sm border border-border/80 bg-card text-foreground shadow-xs', isOptimistic && 'opacity-60', clientStatus === 'queued' && 'opacity-100', clientStatus === 'failed' && 'opacity-80 ring-1 ring-destructive/40')}>
            <MessageMedia message={message} conversationId={conversationId} isMine={isMine} />
          </div>
        </div>
        <MessageStatusBar message={message} isMine={isMine} />
        <MessageQueuedActions message={message} isRetrying={isRetrying} onRetryQueued={onRetryQueued} onDiscardQueued={onDiscardQueued} onCancelQueued={onCancelQueued} onEditQueued={onEditQueued} />
        {clientStatus === 'failed' && message.lastError && (
          <p className="px-1 text-2xs text-destructive/80">
            {classifyHttpConflict(message.lastError.status, message.lastError.message).message}
          </p>
        )}
      </div>
    </div>
  );
});
