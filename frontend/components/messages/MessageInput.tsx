'use client';

import { useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { useSendMessage } from '@/hooks/mutations/useConversationMutations';
import { cn } from '@/lib/utils';

interface Props {
  conversationId: string;
  /** Disables the composer entirely — used when the other party is
   * blocked (either direction), since sendMessage would just 403 with
   * USER_BLOCKED anyway. Keeps that state visible in the UI instead of
   * only surfacing it as an error toast after a failed send. */
  disabled?: boolean;
}

const MAX_LENGTH = 2000;
// FIX UX-GAP-05: the counter only needs to earn its place once getting
// cut off is a real possibility — showing "12/2000" on every short
// message is noise. 90% mirrors the threshold this codebase already
// uses for the same purpose (see AdForm's description counter).
const WARN_THRESHOLD = MAX_LENGTH * 0.9;

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

  const nearLimit = body.length >= WARN_THRESHOLD;

  return (
    <form onSubmit={handleSubmit} className="bg-card/90 backdrop-blur-md px-3 py-3">
      <div className="flex items-end gap-2 bg-muted rounded-3xl p-1.5 shadow-inner focus-within:ring-2 focus-within:ring-primary/20 transition-all">
        <div className="flex-1 min-w-0">
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
            className="w-full resize-none bg-transparent border-none outline-none px-3 py-2 text-sm placeholder:text-muted-foreground max-h-32"
          />
          {/* FIX UX-GAP-05: previously nothing signalled the 2000-char
              cap until the user hit it mid-sentence (maxLength just
              silently stops accepting input) — a long negotiation
              message could be cut off with no warning. Only rendered
              once nearLimit is true, matching the "don't show noise
              for short messages" reasoning above. */}
          {nearLimit && (
            <p
              className={cn(
                'px-3 pb-1 text-xs text-end',
                body.length >= MAX_LENGTH ? 'text-destructive font-medium' : 'text-muted-foreground'
              )}
            >
              {body.length}/{MAX_LENGTH}
            </p>
          )}
        </div>
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
