'use client';

import { useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { useSendMessage } from '@/hooks/mutations/useConversationMutations';

interface Props {
  conversationId: string;
  /** Disables the composer entirely — used when the other party is
   * blocked (either direction), since sendMessage would just 403 with
   * USER_BLOCKED anyway. Keeps that state visible in the UI instead of
   * only surfacing it as an error toast after a failed send. */
  disabled?: boolean;
}

const MAX_LENGTH = 2000;

/** MessageInput — Epic 5, the composer bar at the bottom of ChatWindow. */
export function MessageInput({ conversationId, disabled }: Props) {
  const [body, setBody] = useState('');
  const sendMessage = useSendMessage(conversationId);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || sendMessage.isPending || disabled) return;
    sendMessage.mutate({ body: trimmed }, { onSuccess: () => setBody('') });
  }

  if (disabled) {
    return (
      <div className="border-t p-3 text-center text-sm text-muted-foreground">
        لا يمكنك مراسلة هذا المستخدم
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t p-3">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
          }
        }}
        maxLength={MAX_LENGTH}
        rows={1}
        placeholder="اكتب رسالتك..."
        className="flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-h-32"
      />
      <Button type="submit" size="icon" disabled={!body.trim() || sendMessage.isPending}>
        <Send className="h-4 w-4" />
      </Button>
    </form>
  );
}
