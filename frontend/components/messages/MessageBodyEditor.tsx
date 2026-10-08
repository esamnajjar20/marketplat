'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { conversationsApi } from '@/api/conversations.api';
import { reportBackgroundFailure } from '@/lib/backgroundTask';
import { loadMessageDraft, saveMessageDraft } from '@/lib/messageUtils';
import { cn } from '@/lib/utils';

export interface MessageBodyEditorHandle {
  getValue: () => string;
  setValue: (value: string) => void;
  clear: () => void;
  focus: () => void;
  requestSubmit: () => void;
}

interface Props {
  conversationId: string;
  disabled?: boolean;
  onContentChange: (hasContent: boolean) => void;
}

const MAX_LENGTH = 2000;
const WARN_THRESHOLD = MAX_LENGTH * 0.9;

export const MessageBodyEditor = forwardRef<MessageBodyEditorHandle, Props>(function MessageBodyEditor(
  { conversationId, disabled, onContentChange },
  ref,
) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingActive = useRef(false);
  const valueRef = useRef('');

  const syncValue = (next: string) => {
    valueRef.current = next;
    setValue(next);
    onContentChange(Boolean(next.trim()));
  };

  useImperativeHandle(ref, () => ({
    getValue: () => valueRef.current,
    setValue: syncValue,
    clear: () => syncValue(''),
    focus: () => textareaRef.current?.focus(),
    requestSubmit: () => textareaRef.current?.form?.requestSubmit(),
  }), []);

  useEffect(() => {
    const initial = loadMessageDraft(conversationId);
    valueRef.current = initial;
    setValue(initial);
    onContentChange(Boolean(initial.trim()));
    typingActive.current = false;
    if (typingTimer.current) clearTimeout(typingTimer.current);

    const onOfflineMessageEdit = (event: Event) => {
      const detail = (event as CustomEvent<{ conversationId?: string; body?: string }>).detail;
      if (!detail || detail.conversationId !== conversationId) return;
      syncValue(String(detail.body ?? ''));
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    };
    window.addEventListener('offline-message-edit', onOfflineMessageEdit);
    return () => {
      window.removeEventListener('offline-message-edit', onOfflineMessageEdit);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (typingActive.current) {
        void conversationsApi.signalTyping(conversationId, false).catch((error) =>
          reportBackgroundFailure('frontend/components/messages/MessageBodyEditor.tsx', error),
        );
      }
    };
  }, [conversationId, onContentChange]);

  useEffect(() => {
    const t = window.setTimeout(() => saveMessageDraft(conversationId, value), 300);
    return () => window.clearTimeout(t);
  }, [value, conversationId]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [value]);

  function signalTyping(isTyping: boolean) {
    if (disabled) return;
    typingActive.current = isTyping;
    void conversationsApi.signalTyping(conversationId, isTyping).catch((error) =>
      reportBackgroundFailure('frontend/components/messages/MessageBodyEditor.tsx', error),
    );
  }

  function handleChange(next: string) {
    syncValue(next);
    if (!next.trim()) {
      if (typingActive.current) signalTyping(false);
      return;
    }
    if (!typingActive.current) signalTyping(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => signalTyping(false), 2000);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && window.matchMedia('(pointer: fine)').matches) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  const nearLimit = value.length >= WARN_THRESHOLD;

  return (
    <>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={MAX_LENGTH}
        rows={1}
        placeholder="اكتب رسالتك..."
        disabled={disabled}
        className="w-full resize-none bg-transparent border-none outline-none px-2 py-2.5 text-sm leading-relaxed placeholder:text-muted-foreground max-h-32"
        aria-label="نص الرسالة"
      />
      {nearLimit && (
        <p
          className={cn(
            'px-2 pb-1 text-2xs-tight text-end tabular-nums',
            value.length >= MAX_LENGTH ? 'font-medium text-destructive' : 'text-muted-foreground',
          )}
        >
          {value.length}/{MAX_LENGTH}
        </p>
      )}
    </>
  );
});

MessageBodyEditor.displayName = 'MessageBodyEditor';
