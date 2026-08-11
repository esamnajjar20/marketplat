'use client';

import { useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
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
      <div className="bg-card/90 backdrop-blur-md px-4 py-3 text-center text-sm text-muted-foreground">
        لا يمكنك مراسلة هذا المستخدم
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-card/90 backdrop-blur-md px-3 py-3">
      <div className="flex items-end gap-2 bg-muted rounded-3xl p-1.5 shadow-inner focus-within:ring-2 focus-within:ring-primary/20 transition-all">
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
          className="flex-1 resize-none bg-transparent border-none outline-none px-3 py-2 text-sm placeholder:text-muted-foreground max-h-32"
        />
        {/* FIX BUG-XX: icon-only button had no aria-label — every other
            icon-only button in the codebase has one (see AdDetail's
            favorite button, ShareAdButton, etc.). Without it, a screen
            reader announces only "button", not what it does. */}
        <button
          type="submit"
          aria-label="إرسال"
          disabled={!body.trim() || sendMessage.isPending}
          className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-all disabled:opacity-40 disabled:pointer-events-none hover:shadow-lg"
        >
          <Send className="h-4 w-4 rtl:-scale-x-100" />
        </button>
      </div>
    </form>
  );
}
