'use client';

import { memo } from 'react';
import { toast } from 'sonner';
import { MoreVertical, Copy, Pin, Star, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/shared/ui/DropdownMenu';
import type { DisplayMessage } from './messageTypes';

type Props = {
  message: DisplayMessage;
  markPending: boolean;
  onMarkMessage: (input: { messageId: string; kind: 'star' | 'pin'; active: boolean }) => void;
  onDeleteRequest: (messageId: string) => void;
};

export const MessageActionsMenu = memo(function MessageActionsMenu({ message, markPending, onMarkMessage, onDeleteRequest }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity w-6 h-6 flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted shrink-0" aria-label="خيارات الرسالة">
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem className="flex items-center gap-2 cursor-pointer" disabled={markPending} onClick={() => onMarkMessage({ messageId: message.id, kind: 'star', active: !message.isStarredByMe })}>
          <Star className={cn('h-4 w-4', message.isStarredByMe && 'fill-current')} />
          {message.isStarredByMe ? 'إلغاء التمييز' : 'تمييز الرسالة'}
        </DropdownMenuItem>
        <DropdownMenuItem className="flex items-center gap-2 cursor-pointer" disabled={markPending} onClick={() => onMarkMessage({ messageId: message.id, kind: 'pin', active: !message.isPinned })}>
          <Pin className={cn('h-4 w-4', message.isPinned && 'fill-current')} />
          {message.isPinned ? 'إلغاء تثبيت الرسالة' : 'تثبيت الرسالة'}
        </DropdownMenuItem>
        <DropdownMenuItem className="flex items-center gap-2 cursor-pointer" onClick={async () => { try { await navigator.clipboard.writeText(message.body); toast.success('تم نسخ الرسالة'); } catch { toast.error('تعذّر النسخ'); } }}>
          <Copy className="h-4 w-4" />نسخ
        </DropdownMenuItem>
        <DropdownMenuItem className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive" onClick={() => onDeleteRequest(message.id)}>
          <Trash2 className="h-4 w-4" />حذف الرسالة
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
