'use client';

import { useEffect, useRef, useState, type FormEvent, type ChangeEvent } from 'react';
import { Send, Ban, ImagePlus, X, Mic, Square, Loader2 } from 'lucide-react';
import { useSendMessage } from '@/hooks/mutations/useConversationMutations';
import { parseApiError } from '@/lib/errorParser';
import { OFFLINE_OP_ID_HEADER, newOfflineOperationId } from '@/lib/offlineOperationId';
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
  const [lastSendError, setLastSendError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [draftReady, setDraftReady] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadKind, setUploadKind] = useState<'image' | 'audio' | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingStartedAtRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
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
    // SW-MSG-PREVIEW-URL-LEAK-01 (second site): also revoke on
    // conversation switch. Prior version unconditionally set the
    // preview to null, orphaning a blob URL if the user had picked an
    // image and then navigated to a different thread. Reachable by
    // simply switching conversations mid-draft.
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
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

  // SW-MSG-PREVIEW-URL-LEAK-01 (unmount site): if the user leaves
  // /messages entirely while holding a picked image (back button,
  // direct navigation), the blob URL must be revoked on teardown. The
  // previous code never ran this path at all. Kept as a separate
  // effect (rather than merged into the typing-cleanup one above) so
  // its cleanup only runs once on true unmount, not on every
  // conversationId change (which the useEffect above already handles).
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      setImagePreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      mediaRecorderRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!recording) {
      setRecordingSeconds(0);
      recordingStartedAtRef.current = null;
      return;
    }
    recordingStartedAtRef.current = Date.now();
    const timer = window.setInterval(() => {
      if (recordingStartedAtRef.current) {
        setRecordingSeconds(Math.floor((Date.now() - recordingStartedAtRef.current) / 1000));
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  function formatRecordingTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

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
    // SW-MSG-PREVIEW-URL-LEAK-01: revoke the previous preview blob
    // URL before replacing it. Without this, each new image selection
    // orphaned the prior URL.createObjectURL() result — the blob
    // stayed in memory for the lifetime of the page even though nothing
    // referenced it. Reachable on every change of mind: pick photo,
    // swap for a better one, swap again.
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setImageFile(file);
  }

  function clearImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
  }

  async function toggleRecording() {
    if (recording) {
      mediaRecorderRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('التسجيل الصوتي غير مدعوم على هذا الجهاز');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : '';
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        mediaRecorderRef.current = null;
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size === 0) return;
        if (!navigator.onLine) {
          toast.error('الرسائل الصوتية تحتاج اتصالاً بالإنترنت حاليًا');
          return;
        }
        setUploading(true);
        setUploadKind('audio');
        try {
          const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type || 'audio/webm' });
          await conversationsApi.sendAudio(conversationId, file, body.trim());
          setBody('');
          clearMessageDraft(conversationId);
          setLastSendError(null);
          void queryClient.invalidateQueries({ queryKey: ['conversations', 'detail', conversationId, 'messages'] });
          void queryClient.invalidateQueries({ queryKey: ['conversations', 'me'] });
        } catch (err) {
          const parsed = parseApiError(err);
          setLastSendError(parsed.message);
          toast.error(parsed.message);
        } finally {
          setUploading(false);
          setUploadKind(null);
        }
      };
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setRecordingSeconds(0);
      recorder.start(250);
      window.setTimeout(() => {
        if (mediaRecorderRef.current === recorder && recorder.state === 'recording') {
          recorder.stop();
          toast.info('تم إيقاف التسجيل بعد دقيقتين.');
        }
      }, 120000);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      if (!window.isSecureContext) {
        toast.error('التسجيل الصوتي يحتاج اتصالاً آمناً (HTTPS).');
      } else if (name === 'NotAllowedError' || name === 'SecurityError') {
        toast.error('تم رفض إذن الميكروفون. اسمح للمتصفح باستخدام الميكروفون من إعدادات الموقع ثم حاول مرة أخرى.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        toast.error('لم يتم العثور على ميكروفون متاح على الجهاز.');
      } else {
        toast.error('تعذّر الوصول إلى الميكروفون. تحقق من إذن الميكروفون ثم حاول مرة أخرى.');
      }
      setRecording(false);
      mediaRecorderRef.current = null;
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if ((!trimmed && !imageFile) || sendMessage.isPending || uploading || disabled) return;

    if (typingActive.current) signalTyping(false);
    if (typingTimer.current) clearTimeout(typingTimer.current);

    if (imageFile) {
      setUploading(true);
      setUploadKind('image');
      try {
        const form = new FormData();
        form.append('image', imageFile);
        if (trimmed) form.append('body', trimmed);
        // SW-FIX-MSGINPUT-CT-REDUNDANT: apiClient's request interceptor
        // deletes Content-Type whenever the body is FormData (see
        // api/client.ts's FIX BUG-IMG-CONTENTTYPE-01) — setting it here
        // was dead weight that axios then had to strip.
        await apiClient.post(`/conversations/${conversationId}/messages/image`, form, {
          headers: { [OFFLINE_OP_ID_HEADER]: newOfflineOperationId() },
        });
        setBody('');
        setLastSendError(null);
        clearMessageDraft(conversationId);
        clearImage();
        void queryClient.invalidateQueries({
          queryKey: ['conversations', 'detail', conversationId, 'messages'],
        });
        void queryClient.invalidateQueries({ queryKey: ['conversations', 'me'] });
      } catch (err) {
        // FIX N3-IMG-OFFLINE-QUEUED: mirror the text-path behaviour —
        // SW returns 202 {queued:true} which the interceptor rejects as
        // OFFLINE_QUEUED. Treat that as success UX (clear composer) so
        // the user does not re-send and double the image when back online
        // (messages still lack server-side idempotency — see N2).
        const parsed = parseApiError(err);
        if (parsed.queued) {
          setBody('');
          setLastSendError(null);
          clearMessageDraft(conversationId);
          clearImage();
          void queryClient.invalidateQueries({
            queryKey: ['conversations', 'detail', conversationId, 'messages'],
          });
          void queryClient.invalidateQueries({ queryKey: ['conversations', 'me'] });
        } else {
          setLastSendError(parsed.message);
          toast.error(parsed.message);
        }
      } finally {
        setUploading(false);
        setUploadKind(null);
      }
      // Keep keyboard open on mobile: avoid focus thrash (blur→focus).
      keepComposerFocus();
      return;
    }

    setBody('');
    clearMessageDraft(conversationId);
    sendMessage.mutate(
      { body: trimmed },
      {
        onError: (err) => {
          const parsed = parseApiError(err);
          if (!parsed.queued) {
            setBody(trimmed);
            saveMessageDraft(conversationId, trimmed);
            setLastSendError(parsed.message || 'تعذّر الإرسال');
          }
        },
        onSuccess: () => setLastSendError(null),
      },
    );
    keepComposerFocus();
  }

  /** Re-focus without forcing the soft keyboard to cycle closed/open. */
  function keepComposerFocus() {
    const el = textareaRef.current;
    if (!el) return;
    // If something else already took focus (e.g. file picker), don't steal it.
    const active = document.activeElement;
    if (active && active !== el && active !== document.body && !el.contains(active)) {
      return;
    }
    // Synchronous focus keeps iOS/Android keyboard stable after form submit.
    el.focus({ preventScroll: true });
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
    (Boolean(body.trim()) || Boolean(imageFile)) && !sendMessage.isPending && !uploading && !recording;

  return (
    <div className="border-t border-border/80 bg-card/95 backdrop-blur-md supports-[backdrop-filter]:bg-card/90 dark:bg-card/95">
      {uploading && (
        <div role="status" aria-live="polite" className="flex items-center gap-2 border-b bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
          <span>{uploadKind === 'audio' ? 'جاري رفع التسجيل الصوتي…' : uploadKind === 'image' ? 'جاري رفع الصورة…' : 'جاري الإرسال…'}</span>
        </div>
      )}
      {imagePreview && (
        <div className="flex items-center gap-2 border-b px-3 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg">
            <img src={imagePreview} alt="معاينة الصورة" className="h-full w-full object-cover" />
            {uploading && <div className="absolute inset-0 flex items-center justify-center bg-black/45"><Loader2 className="h-5 w-5 animate-spin text-white" aria-hidden /></div>}
          </div>
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
                keepComposerFocus();
              }}
              className="snap-start shrink-0 rounded-full border border-border/80 bg-background px-3.5 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors min-h-10 hover:border-primary/30 hover:bg-primary/5 active:scale-[0.98]"
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {lastSendError ? (
        <div
          role="alert"
          className="flex items-start gap-2 border-b border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          <span className="min-w-0 flex-1">{lastSendError}</span>
          <button
            type="button"
            className="shrink-0 font-semibold underline-offset-2 hover:underline"
            onClick={() => {
              setLastSendError(null);
              textareaRef.current?.form?.requestSubmit();
            }}
          >
            إعادة
          </button>
          <button
            type="button"
            className="shrink-0 text-muted-foreground"
            aria-label="إخفاء"
            onClick={() => setLastSendError(null)}
          >
            ✕
          </button>
        </div>
      ) : null}

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
          {recording && (
            <div className="flex min-h-10 items-center gap-2 rounded-full bg-destructive/10 px-3 text-xs font-medium tabular-nums text-destructive" aria-live="polite">
              <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" aria-hidden />
              <span>{formatRecordingTime(recordingSeconds)}</span>
            </div>
          )}
          <button
            type="button"
            aria-label={recording ? 'إيقاف التسجيل الصوتي' : 'تسجيل رسالة صوتية'}
            onClick={() => void toggleRecording()}
            disabled={uploading}
            className={cn(
              'mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
              recording ? 'bg-destructive text-destructive-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {recording ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
          </button>
          <div className="min-w-0 flex-1">
            <textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              onKeyDown={(e) => {
                // On touch devices Enter often means newline; only submit on fine pointers (mouse/keyboard)
                if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) {
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
                  'px-2 pb-1 text-2xs-tight text-end tabular-nums',
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
            onPointerDown={(e) => {
              // Prevent the send button from taking focus on touch devices;
              // that focus transfer is what closes the soft keyboard after send.
              e.preventDefault();
            }}
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
        <p className="mt-1.5 px-1 text-center text-2xs text-muted-foreground/70 hidden [@media(pointer:fine)]:block">
          {/* SW-FIX-MSG-ENTER-HINT: show keyboard hint only on fine-pointer devices */}
          ↵ للإرسال · Shift + ↵ لسطر جديد · الصورة والصوت اختياريان
        </p>
      </form>
    </div>
  );
}
