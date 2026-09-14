'use client';

import { useEffect, useRef, useState, type FormEvent, type ChangeEvent } from 'react';
import { Send, Ban, ImagePlus, X } from 'lucide-react';
import { useSendMessage } from '@/hooks/mutations/useConversationMutations';
import { parseApiError } from '@/lib/errorParser';
import {
  loadMessageDraft,
  saveMessageDraft,
  clearMessageDraft,
} from '@/lib/messageUtils';
import { conversationsApi } from '@/api/conversations.api';
import { apiClient } from '@/api/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  conversationId: string;
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

export function MessageInput({ conversationId, disabled }: Props) {
  const [body, setBody] = useState('');
  const [draftReady, setDraftReady] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const sendMessage = useSendMessage(conversationId);
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingActive = useRef(false);

  useEffect(() => {
    setBody(loadMessageDraft(conversationId));
    setDraftReady(true);
    setImageFile(null);
    setImagePreview(null);
  }, [conversationId]);

  useEffect(() => {
    if (!draftReady) return;
    const t = window.setTimeout(() => saveMessageDraft(conversationId, body), 300);
    return () => window.clearTimeout(t);
  }, [body, conversationId, draftReady]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [body]);

  function signalTyping(isTyping: boolean) {
    if (disabled) return;
    typingActive.current = isTyping;
    void conversationsApi.signalTyping(conversationId, isTyping).catch(() => undefined);
  }

  function onBodyChange(value: string) {
    setBody(value);
    if (!value.trim()) {
      if (typingActive.current) signalTyping(false);
      return;
    }
    if (!typingActive.current) signalTyping(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => signalTyping(false), 2000);
  }

  useEffect(() => {
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (typingActive.current) {
        void conversationsApi.signalTyping(conversationId, false).catch(() => undefined);
      }
    };
  }, [conversationId]);

  function onPickImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('يُسمح بالصور فقط');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('الحد الأقصى 5 ميغابايت');
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function clearImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if ((!trimmed && !imageFile) || sendMessage.isPending || uploading || disabled) return;

    if (typingActive.current) signalTyping(false);
    if (typingTimer.current) clearTimeout(typingTimer.current);

    if (imageFile) {
      setUploading(true);
      try {
        const form = new FormData();
        form.append('image', imageFile);
        if (trimmed) form.append('body', trimmed);
        await apiClient.post(`/conversations/${conversationId}/messages/image`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setBody('');
        clearMessageDraft(conversationId);
        clearImage();
        void queryClient.invalidateQueries({
          queryKey: ['conversations', 'detail', conversationId, 'messages'],
        });
        void queryClient.invalidateQueries({ queryKey: ['conversations', 'me'] });
      } catch (err) {
        toast.error(parseApiError(err).message);
      } finally {
        setUploading(false);
      }
      requestAnimationFrame(() => textareaRef.current?.focus());
      return;
    }

    setBody('');
    clearMessageDraft(conversationId);
    sendMessage.mutate(
      { body: trimmed },
      {
        onError: (err) => {
          if (!parseApiError(err).queued) {
            setBody(trimmed);
            saveMessageDraft(conversationId, trimmed);
          }
        },
      },
    );
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
  const canSend =
    (Boolean(body.trim()) || Boolean(imageFile)) && !sendMessage.isPending && !uploading;

  return (
    <div className="border-t border-border/80 bg-card/95 backdrop-blur-md supports-[backdrop-filter]:bg-card/90 dark:bg-card/95">
      {imagePreview && (
        <div className="flex items-center gap-2 border-b px-3 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imagePreview} alt="" className="h-16 w-16 rounded-lg object-cover" />
          <button
            type="button"
            onClick={clearImage}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="إزالة الصورة"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {!body.trim() && !imageFile && (
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
              className="snap-start shrink-0 rounded-full border border-border/80 bg-background px-3.5 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors min-h-10 hover:border-primary/30 hover:bg-primary/5 active:scale-[0.98]"
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="px-3 py-2.5">
        <div
          className={cn(
            'flex items-end gap-1.5 rounded-3xl border bg-muted/60 p-1.5 shadow-inner transition-all',
            'focus-within:border-primary/30 focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/15',
          )}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onPickImage}
          />
          <button
            type="button"
            aria-label="إرفاق صورة"
            onClick={() => fileRef.current?.click()}
            className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ImagePlus className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              maxLength={MAX_LENGTH}
              rows={1}
              placeholder="اكتب رسالتك..."
              className="w-full resize-none bg-transparent border-none outline-none px-2 py-2.5 text-sm leading-relaxed placeholder:text-muted-foreground max-h-32"
              aria-label="نص الرسالة"
            />
            {nearLimit && (
              <p
                className={cn(
                  'px-2 pb-1 text-[11px] text-end tabular-nums',
                  body.length >= MAX_LENGTH
                    ? 'font-medium text-destructive'
                    : 'text-muted-foreground',
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
        <p className="mt-1.5 px-1 text-center text-[10px] text-muted-foreground/70">
          Enter للإرسال · Shift+Enter لسطر جديد · صورة اختيارية
        </p>
      </form>
    </div>
  );
}
