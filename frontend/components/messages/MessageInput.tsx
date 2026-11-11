'use client';
import { useEffect, useRef, useState, type FormEvent, type ChangeEvent } from 'react';
import { Send, Ban, ImagePlus, X, Mic, Square, Paperclip, WifiOff } from 'lucide-react';
import { useSendMessage } from '@/hooks/mutations/useConversationMutations';
import { parseApiError } from '@/lib/errorParser';
import { newOfflineOperationId } from '@/lib/offlineOperationId';
import { sendConversationMessage } from '@/lib/sendConversationMessage';
import {
  saveMessageDraft,
  clearMessageDraft,
} from '@/lib/messageUtils';
import { queryKeys } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { RecordingTimer } from './RecordingTimer';
import { MessageBodyEditor, type MessageBodyEditorHandle } from './MessageBodyEditor';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { hapticMessageSent, hapticMessageError } from '@/lib/capacitor/nativeHaptics';
import type { Message, ConversationListItem } from '@/types/conversation.types';
import type { PaginatedResponse } from '@/types/api.types';

import { Spinner } from '@/components/ui/spinner';
interface Props {
  conversationId: string;
  disabled?: boolean;
}

const QUICK_TEMPLATES = [
  'هل ما زال متوفراً؟',
  'ما آخر سعر؟',
  'أين مكان الاستلام؟',
  'ممكن صور إضافية؟',
] as const;

export function MessageInput({ conversationId, disabled }: Props) {
  const [lastSendError, setLastSendError] = useState<string | null>(null);
  const [hasBody, setHasBody] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadKind, setUploadKind] = useState<'image' | 'audio' | 'file' | null>(null);
  const [recording, setRecording] = useState(false);
  const cancelRecordingRef = useRef(false);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingStartInFlightRef = useRef(false);
  const mountedRef = useRef(false);
  const lifecycleRef = useRef(0);
  const imagePreviewUrlRef = useRef<string | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const sendMessage = useSendMessage(conversationId);
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();
  const bodyEditorRef = useRef<MessageBodyEditorHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const attachmentRef = useRef<HTMLInputElement>(null);

  // Successful media POSTs already return the canonical message. Update the
  // active thread and list preview directly instead of issuing follow-up GETs.
  function cacheSentMessage(message: Message) {
    queryClient.setQueriesData<PaginatedResponse<Message>>(
      { queryKey: queryKeys.conversations.messagesRoot(conversationId) },
      (current) => {
        if (!current?.items || current.items.some((item) => item.id === message.id)) return current;
        return { ...current, items: [...current.items, message] };
      },
    );
    queryClient.setQueriesData<PaginatedResponse<ConversationListItem>>(
      { queryKey: queryKeys.conversations.mineRoot() },
      (current) => {
        if (!current?.items) return current;
        const items = current.items.map((item) => {
          if (item.id !== conversationId) return item;
          const currentTime = Date.parse(item.lastMessage?.createdAt ?? item.updatedAt);
          const incomingTime = Date.parse(message.createdAt);
          if (Number.isFinite(currentTime) && Number.isFinite(incomingTime) && incomingTime < currentTime) return item;
          return { ...item, lastMessage: message, updatedAt: message.createdAt };
        });
        return { ...current, items: items.sort((a, b) => {
          if (Boolean(a.mySettings?.pinnedAt) !== Boolean(b.mySettings?.pinnedAt)) {
            return a.mySettings?.pinnedAt ? -1 : 1;
          }
          return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
        }) };
      },
    );
  }

  useEffect(() => {
    mountedRef.current = true;
    lifecycleRef.current += 1;

    return () => {
      mountedRef.current = false;
      lifecycleRef.current += 1;
      if (recordingTimerRef.current) {
        clearTimeout(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      cancelRecordingRef.current = true;
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        try { recorder.stop(); } catch { /* recorder may already be stopping */ }
      }
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
      mediaRecorderRef.current = null;

      if (imagePreviewUrlRef.current) {
        URL.revokeObjectURL(imagePreviewUrlRef.current);
        imagePreviewUrlRef.current = null;
      }
    };
  }, []);

  // A reused composer can switch conversations without unmounting. Cancel any
  // pending permission request/recording so a recording cannot land in the
  // previous conversation after navigation.
  useEffect(() => {
    lifecycleRef.current += 1;
    cancelRecordingRef.current = true;
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch { /* recorder may already be stopping */ }
    }
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
    mediaRecorderRef.current = null;
    setRecording(false);
    setRecordingStartedAt(null);
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
    if (imagePreviewUrlRef.current) {
      URL.revokeObjectURL(imagePreviewUrlRef.current);
    }
    const nextPreviewUrl = URL.createObjectURL(file);
    imagePreviewUrlRef.current = nextPreviewUrl;
    setImagePreview(nextPreviewUrl);
    setImageFile(file);
  }

  function onPickAttachment(e: ChangeEvent<HTMLInputElement>) { const file=e.target.files?.[0]; e.target.value=''; if(!file)return; if(file.size>15*1024*1024){toast.error('الحد الأقصى للملف 15 ميغابايت');return;} setAttachmentFile(file); }
  function clearAttachment() { setAttachmentFile(null); }

  function clearImage() {
    if (imagePreviewUrlRef.current) {
      URL.revokeObjectURL(imagePreviewUrlRef.current);
      imagePreviewUrlRef.current = null;
    }
    setImageFile(null);
    setImagePreview(null);
  }

  function cancelRecording() {
    if (!mediaRecorderRef.current) return;
    cancelRecordingRef.current = true;
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    mediaRecorderRef.current.stop();
    toast.message('تم إلغاء التسجيل');
  }

  async function toggleRecording() {
    if (recording || mediaRecorderRef.current) {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      return;
    }
    if (recordingStartInFlightRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('التسجيل الصوتي غير مدعوم على هذا الجهاز');
      return;
    }

    const startGeneration = lifecycleRef.current;
    cancelRecordingRef.current = false;
    recordingStartInFlightRef.current = true;
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // getUserMedia is not abortable in every browser. If permission resolves
      // after unmount or conversation switch, release the granted hardware
      // stream immediately and never construct/start a recorder.
      if (!mountedRef.current || lifecycleRef.current !== startGeneration) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      recordingStreamRef.current = stream;

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
        stream?.getTracks().forEach((track) => track.stop());
        if (recordingStreamRef.current === stream) recordingStreamRef.current = null;
        if (recordingTimerRef.current) {
          clearTimeout(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        if (mediaRecorderRef.current === recorder) mediaRecorderRef.current = null;

        const isCurrentInstance = mountedRef.current && lifecycleRef.current === startGeneration;
        if (isCurrentInstance) {
          setRecording(false);
          setRecordingStartedAt(null);
        }
        const wasCancelled = cancelRecordingRef.current;
        cancelRecordingRef.current = false;
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        audioChunksRef.current = [];
        if (!isCurrentInstance || wasCancelled || blob.size === 0) return;

        setUploading(true);
        setUploadKind('audio');
        try {
          const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type || 'audio/webm' });
          const sentMessage = await sendConversationMessage(conversationId, {
            kind: 'audio',
            file,
            body: bodyEditorRef.current?.getValue().trim() ?? '',
          });
          cacheSentMessage(sentMessage);
          if (mountedRef.current && lifecycleRef.current === startGeneration) {
            bodyEditorRef.current?.clear();
            setHasBody(false);
            setLastSendError(null);
            setUploading(false);
            setUploadKind(null);
          }
          clearMessageDraft(conversationId);
        } catch (err) {
          const parsed = parseApiError(err);
          if (parsed.queued) {
            if (mountedRef.current && lifecycleRef.current === startGeneration) {
              bodyEditorRef.current?.clear();
              setHasBody(false);
              setLastSendError(null);
            }
            clearMessageDraft(conversationId);
          } else if (mountedRef.current && lifecycleRef.current === startGeneration) {
            setLastSendError(parsed.message);
            toast.error(parsed.message);
          }
        } finally {
          if (mountedRef.current && lifecycleRef.current === startGeneration) {
            setUploading(false);
            setUploadKind(null);
          }
        }
      };
      mediaRecorderRef.current = recorder;
      setRecordingStartedAt(Date.now());
      setRecording(true);
      recorder.start(250);
      recordingTimerRef.current = setTimeout(() => {
        if (
          mountedRef.current &&
          lifecycleRef.current === startGeneration &&
          mediaRecorderRef.current === recorder &&
          recorder.state === 'recording'
        ) {
          recorder.stop();
          toast.info('تم إيقاف التسجيل بعد دقيقتين.');
        }
      }, 120_000);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (recordingStreamRef.current === stream) recordingStreamRef.current = null;
      if (!mountedRef.current || lifecycleRef.current !== startGeneration) return;
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
      setRecordingStartedAt(null);
      mediaRecorderRef.current = null;
    } finally {
      recordingStartInFlightRef.current = false;
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = bodyEditorRef.current?.getValue().trim() ?? '';
    if ((!trimmed && !imageFile && !attachmentFile) || sendMessage.isPending || uploading || disabled) return;

    if (attachmentFile) {
      setUploading(true); setUploadKind('file');
      try {
        const sentMessage = await sendConversationMessage(conversationId, { kind: 'file', file: attachmentFile, body: trimmed });
        cacheSentMessage(sentMessage);
        bodyEditorRef.current?.clear(); setHasBody(false); clearMessageDraft(conversationId); clearAttachment(); setLastSendError(null); void hapticMessageSent();
      }
      catch(err){const parsed=parseApiError(err); if(parsed.queued){bodyEditorRef.current?.clear(); setHasBody(false);clearMessageDraft(conversationId);clearAttachment();setLastSendError(null);void hapticMessageSent();}else{setLastSendError(parsed.message);void hapticMessageError();toast.error(parsed.message);}} finally{setUploading(false);setUploadKind(null);} keepComposerFocus(); return;
    }

    if (imageFile) {
      setUploading(true);
      setUploadKind('image');
      try {
        const sentMessage = await sendConversationMessage(
          conversationId,
          { kind: 'image', file: imageFile, body: trimmed },
          newOfflineOperationId(),
        );
        cacheSentMessage(sentMessage);
        bodyEditorRef.current?.clear(); setHasBody(false);
        setLastSendError(null);
        clearMessageDraft(conversationId);
        clearImage();
      } catch (err) {
        // FIX N3-IMG-OFFLINE-QUEUED: mirror the text-path behaviour —
        // SW returns 202 {queued:true} which the interceptor rejects as
        // OFFLINE_QUEUED. Treat that as success UX (clear composer) so
        // the user does not re-send and double the image when back online
        // (messages still lack server-side idempotency — see N2).
        const parsed = parseApiError(err);
        if (parsed.queued) {
          bodyEditorRef.current?.clear(); setHasBody(false);
          setLastSendError(null);
          clearMessageDraft(conversationId);
          clearImage();
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

    bodyEditorRef.current?.clear(); setHasBody(false);
    clearMessageDraft(conversationId);
    sendMessage.mutate(
      { body: trimmed, operationId: newOfflineOperationId() },
      {
        onError: (err) => {
          const parsed = parseApiError(err);
          if (!parsed.queued) {
            bodyEditorRef.current?.setValue(trimmed); setHasBody(Boolean(trimmed));
            saveMessageDraft(conversationId, trimmed);
            setLastSendError(parsed.message || 'تعذّر الإرسال');
            void hapticMessageError();
          } else {
            void hapticMessageSent();
          }
        },
        onSuccess: () => {
          setLastSendError(null);
          void hapticMessageSent();
        },
      },
    );
    keepComposerFocus();
  }

  /** Re-focus without forcing the soft keyboard to cycle closed/open. */
  function keepComposerFocus() {
    const el = bodyEditorRef.current;
    if (!el) return;
    // If something else already took focus (e.g. file picker), don't steal it.
    // The editor owns the actual textarea and keeps focus stable.
    el.focus();
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

  const composerBusy = uploading || sendMessage.isPending;
  const canSend =
    (hasBody || Boolean(imageFile) || Boolean(attachmentFile)) && !composerBusy && !recording;

  return (
    <div className="border-t border-border/80 bg-card/95 backdrop-blur-md supports-[backdrop-filter]:bg-card/90 dark:bg-card/95">
      {!isOnline && (
        <div role="status" aria-live="polite" className="flex items-start gap-2 border-b border-warning/20 bg-warning/5 px-3 py-2 text-xs text-muted-foreground">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-warning-strong dark:text-warning" aria-hidden />
          <span>الاتصال منقطع. يمكنك متابعة الكتابة؛ قد تُضاف الرسالة إلى قائمة الإرسال عند عودة الاتصال.</span>
        </div>
      )}
      {uploading && (
        <div role="status" aria-live="polite" className="flex items-center gap-2 border-b bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          <Spinner size="sm" className="text-primary" />
          <span>{uploadKind === 'audio' ? 'جاري رفع التسجيل الصوتي…' : uploadKind === 'image' ? 'جاري رفع الصورة…' : uploadKind === 'file' ? 'جاري رفع الملف…' : 'جاري الإرسال…'}</span>
        </div>
      )}
      {attachmentFile && <div className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs"><Paperclip className="h-4 w-4 text-primary"/><span className="min-w-0 flex-1 truncate">{attachmentFile.name}</span><button type="button" onClick={clearAttachment} disabled={composerBusy} className="rounded-full p-1 hover:bg-background" aria-label="إزالة الملف"><X className="h-4 w-4"/></button></div>}
      {imagePreview && (
        <div className="flex items-center gap-2 border-b px-3 py-2">
          { }
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg">
            <img src={imagePreview} alt="معاينة الصورة" className="h-full w-full object-cover" />
            {uploading && <div className="absolute inset-0 flex items-center justify-center bg-black/45"><Spinner size="md" className="h-5 w-5 text-white" /></div>}
          </div>
          <button
            type="button"
            onClick={clearImage}
            disabled={composerBusy}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="إزالة الصورة"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {!composerBusy && !hasBody && !imageFile && !attachmentFile && (
        <div
          className="flex gap-2 overflow-x-auto overscroll-x-contain px-3 pt-2.5 pb-1 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="رسائل سريعة"
        >
          {QUICK_TEMPLATES.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                bodyEditorRef.current?.setValue(label);
                setHasBody(true);
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
              bodyEditorRef.current?.requestSubmit();
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

      <form onSubmit={handleSubmit} aria-busy={composerBusy} className="px-2 py-2 sm:px-3 sm:py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        <div
          className={cn(
            'flex items-end gap-1 rounded-3xl border bg-muted/60 p-1 sm:gap-1.5 sm:p-1.5 shadow-inner transition-[border-color,background-color,box-shadow]',
            'focus-within:border-primary/30 focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/15',
          )}
        >
          <input
            ref={attachmentRef}
            type="file"
            accept=".pdf,.txt,.csv,.json,.zip,.7z,.rar,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
            className="hidden"
            disabled={composerBusy}
            onChange={onPickAttachment}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={composerBusy}
            onChange={onPickImage}
          />
          <button type="button" aria-label="إرفاق ملف" onClick={() => attachmentRef.current?.click()} disabled={composerBusy || disabled} className="mb-0.5 flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-50" title="إرفاق ملف"><Paperclip className="h-5 w-5" /></button>
          <button
            type="button"
            aria-label="إرفاق صورة"
            onClick={() => fileRef.current?.click()}
            disabled={composerBusy}
            className="mb-0.5 flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <ImagePlus className="h-5 w-5" />
          </button>
          {recording && (
            <button type="button" onClick={cancelRecording} className="mb-0.5 flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:bg-muted hover:text-destructive" aria-label="إلغاء التسجيل" title="إلغاء التسجيل">
              <X className="h-4 w-4" />
            </button>
          )}
          {recording && <RecordingTimer startedAt={recordingStartedAt} />}
          <button
            type="button"
            aria-label={recording ? 'إيقاف التسجيل الصوتي' : 'تسجيل رسالة صوتية'}
            title={recording ? 'إيقاف التسجيل وإرسال التسجيل' : 'تسجيل رسالة صوتية'}
            onClick={() => void toggleRecording()}
            disabled={composerBusy}
            className={cn(
              'group relative mb-0.5 flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border transition-[border-color,background-color,color,box-shadow,transform] duration-200',
              recording
                ? 'border-destructive/40 bg-destructive text-destructive-foreground shadow-md shadow-destructive/20'
                : 'border-transparent text-muted-foreground hover:border-primary/20 hover:bg-primary/10 hover:text-primary active:scale-95',
            )}
          >
            {recording && <span className="absolute inset-0 animate-ping rounded-full border border-destructive/30" aria-hidden /> }
            {recording ? <Square className="relative h-4 w-4" fill="currentColor" /> : <Mic className="relative h-5 w-5 transition-transform group-hover:scale-110" />}
          </button>
          <div className="min-w-0 flex-1">
{/* Keep the editor enabled while a text send is pending: disabling it drops focus (closing the mobile keyboard) and blocks typing the next message. Duplicate sends are already prevented by handleSubmit/canSend. It stays disabled during file uploads, whose completion clears the body. */}
<MessageBodyEditor ref={bodyEditorRef} conversationId={conversationId} disabled={disabled || uploading} onContentChange={setHasBody} />
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
              'mb-0.5 me-0.5 flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full shadow-md transition-[box-shadow,transform]',
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
