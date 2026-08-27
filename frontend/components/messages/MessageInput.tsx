'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Send, Ban } from 'lucide-react';
import { useSendMessage } from '@/hooks/mutations/useConversationMutations';
import { cn } from '@/lib/utils';

interface Props {
  conversationId: string;
  /** Disables the composer when the other party is blocked. */
  disabled?: boolean;
}

const MAX_LENGTH = 2000;

const QUICK_TEMPLATES = [
  'هل ما زال متوفراً؟',
  'ما آخر سعر؟',
  'أين مكان الاستلام؟',
  'ممكن صور إضافية؟',
] as const;

const WARN_THRESHOLD = MAX_LENGTH * 0.9;

/** MessageInput — composer bar at the bottom of ChatWindow. */
export function MessageInput({ conversationId, disabled }: Props) {
  const [body, setBody] = useState('');
  const sendMessage = useSendMessage(conversationId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea up to max-height
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [body]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || sendMessage.isPending || disabled) return;
    setBody('');
    sendMessage.mutate({ body: trimmed }, { onError: () => setBody(trimmed) });
    // Keep focus for rapid back-and-forth
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  if (disabled) {
    return (
      <div className="border-t bg-card/95 px-4 py-4">
        <div className="flex items-center justify-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-muted-foreground">
          <Ban className="h-4 w-4 shrink-0 text-destructive/70" aria-hidden />
          <span>لا يمكنك مراسلة هذا المستخدم</span>
        </div>
      </div>
    );
  }

  const nearLimit = body.length >= WARN_THRESHOLD;
  const canSend = Boolean(body.trim()) && !sendMessage.isPending;

  return (
    <div className="border-t border-border/80 bg-card/95 backdrop-blur-md supports-[backdrop-filter]:bg-card/90 dark:bg-card/95">
      {!body.trim() && (
        <div
          className="flex gap-2 overflow-x-auto px-3 pt-2.5 pb-1 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="رسائل سريعة"
        >
          {QUICK_TEMPLATES.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setBody(label);
                requestAnimationFrame(() => textareaRef.current?.focus());
              }}
              className="snap-start shrink-0 rounded-full border border-border/80 bg-background px-3.5 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors min-h-[36px] hover:border-primary/30 hover:bg-primary/5 active:scale-[0.98]"
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="px-3 py-2.5">
        <div
          className={cn(
            'flex items-end gap-2 rounded-3xl border bg-muted/60 p-1.5 shadow-inner transition-all',
            'focus-within:border-primary/30 focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/15',
          )}
        >
          <div className="min-w-0 flex-1">
            <textarea
              ref={textareaRef}
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
              className="w-full resize-none bg-transparent border-none outline-none px-3 py-2.5 text-sm leading-relaxed placeholder:text-muted-foreground max-h-32"
              aria-label="نص الرسالة"
            />
            {nearLimit && (
              <p
                className={cn(
                  'px-3 pb-1 text-[11px] text-end tabular-nums',
                  body.length >= MAX_LENGTH ? 'font-medium text-destructive' : 'text-muted-foreground',
                )}
              >
                {body.length}/{MAX_LENGTH}
              </p>
            )}
          </div>

          <button
            type="submit"
            aria-label="إرسال"
            disabled={!canSend}
            className={cn(
              'mb-0.5 me-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-md transition-all',
              canSend
                ? 'bg-primary text-primary-foreground hover:shadow-lg hover:scale-105 active:scale-95'
                : 'bg-muted text-muted-foreground opacity-50 pointer-events-none',
            )}
          >
            <Send className="h-4 w-4 rtl:-scale-x-100" />
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-muted-foreground/70 text-center">
          Enter للإرسال · Shift+Enter لسطر جديد
        </p>
      </form>
    </div>
  );
}
