import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, Image, KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '@/features/auth/AuthContext';
import { deleteChatMessage, fetchConversation, fetchMessagesPage, setMessageMark, signalChatTyping, type ChatMessage, type ConversationItem } from '@/features/messaging/messaging.api';
import { syncChatMediaOutbox } from '@/features/messaging/chat-media-outbox-sync';
import { createChatMediaOperationId, enqueueChatMedia, listChatMediaOutbox, type ChatMediaKind } from '@/storage/chat-media-outbox';
import { CHAT_OUTBOX_MAX_ATTEMPTS, discardFailedChatMessage, enqueueChatMessage, listChatMessagesForConversation, retryChatMessage } from '@/storage/chat-message-outbox';
import { subscribeChatOutboxSent, syncChatMessageOutbox } from '@/features/messaging/chat-message-outbox-sync';
import { subscribeChatLiveStream, type ChatLiveEvent } from '@/features/messaging/chat-live-stream';
import { markCachedChatMessageDeleted, readCachedChatMessages, saveCachedChatMessages } from '@/storage/chat-message-cache';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type ScreenMessage = ChatMessage & { outboxAttempts?: number; outboxLastError?: string | null };
function messageTime(value: string): string { try { return new Intl.DateTimeFormat('ar', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)); } catch { return ''; } }

function mergeFetchedMessages(fetched: ScreenMessage[], current: ScreenMessage[]): ScreenMessage[] {
  const byId = new Map<string, ScreenMessage>();
  // Keep already loaded history and optimistic rows during refresh; the server
  // page overwrites matching IDs with authoritative data and adds newly arrived rows.
  for (const message of current) byId.set(message.id, message);
  for (const message of fetched) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function replaceOptimisticMessage(current: ScreenMessage[], tempId: string, sent: ChatMessage): ScreenMessage[] {
  // A concurrent refresh may already have included the server message. Avoid
  // retaining both the optimistic row and the authoritative row.
  return [...current.filter((message) => message.id !== sent.id).map((message) => message.id === tempId ? sent : message)]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export default function ConversationScreen() {
  const params = useLocalSearchParams<{ id: string }>(); const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { user, accessToken, csrfToken } = useAuth(); const audioRecorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, directory: 'document' }); const sessionAbort = useRef(new AbortController()); const [conversation, setConversation] = useState<ConversationItem | null>(null); const [messages, setMessages] = useState<ScreenMessage[]>([]); const [draft, setDraft] = useState(''); const [searchOpen, setSearchOpen] = useState(false); const [messageSearch, setMessageSearch] = useState(''); const [uploadingImage, setUploadingImage] = useState(false); const [isRecordingAudio, setIsRecordingAudio] = useState(false); const [pendingMediaCount, setPendingMediaCount] = useState(0); const [partyTyping, setPartyTyping] = useState(false); const lastTypingSignalAt = useRef(0); const typingActive = useRef(false); const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null); const [loading, setLoading] = useState(true); const [sending, setSending] = useState(false); const [loadingOlder, setLoadingOlder] = useState(false); const [nextCursor, setNextCursor] = useState<string | null>(null); const olderRequest = useRef(false); const hasLoadedOlder = useRef(false); const activeConversationId = useRef(id); const hasRenderableMessages = useRef(false); const previousConnectivity = useRef<boolean | null>(null); const [error, setError] = useState<string | null>(null); const listRef = useRef<FlatList<ChatMessage>>(null); const loadSequence = useRef(0);
  const load = useCallback(async (showLoader = true) => {
    if (activeConversationId.current !== id) {
      activeConversationId.current = id;
      hasLoadedOlder.current = false;
      hasRenderableMessages.current = false;
      setMessages([]);
      setConversation(null);
      setNextCursor(null);
    }
    const sequence = ++loadSequence.current;
    if (!accessToken || !id) { setLoading(false); setError('المحادثة أو جلسة الدخول غير متاحة.'); return; }
    if (showLoader && !hasRenderableMessages.current) setLoading(true);
    setError(null);
    let hasLocalSnapshot = false;
    try {
      // Render the last visited history before waiting for a network round trip.
      // The cache is private and account-scoped; it is never used as authorization.
      const [cached, queued] = await Promise.all([
        user?.id ? readCachedChatMessages(user.id, id) : Promise.resolve([]),
        user?.id ? listChatMessagesForConversation(user.id, id) : Promise.resolve([]),
      ]);
      if (sequence !== loadSequence.current) return;
      const queuedMessages: ScreenMessage[] = queued.map((item) => ({ id: `pending-${item.operationId}`, conversationId: item.conversationId, senderId: item.ownerId, body: item.body, createdAt: new Date(item.createdAt).toISOString(), outboxAttempts: item.attempts, outboxLastError: item.lastError }));
      if (cached.length) {
        hasLocalSnapshot = true;
        hasRenderableMessages.current = true;
        setMessages((current) => mergeFetchedMessages(cached, [...current, ...queuedMessages]));
        setLoading(false);
      } else if (queuedMessages.length) {
        hasRenderableMessages.current = true;
        setMessages((current) => mergeFetchedMessages([], [...current, ...queuedMessages]));
        setLoading(false);
      }

      const [detailR, pageR] = await Promise.allSettled([fetchConversation(id, accessToken), fetchMessagesPage(id, accessToken)]);
      if (sequence === loadSequence.current) {
        if (detailR.status === 'fulfilled') setConversation(detailR.value);
        if (pageR.status === 'fulfilled') {
          hasRenderableMessages.current = true;
          setMessages((current) => mergeFetchedMessages(pageR.value.items, [...current, ...queuedMessages]));
          if (!hasLoadedOlder.current) setNextCursor(pageR.value.nextCursor);
          void saveCachedChatMessages(user?.id ?? '', id, pageR.value.items);
        }
        if (detailR.status === 'rejected' && pageR.status === 'rejected') {
          // Both failed — fall through to catch for consistent error handling
          throw detailR.reason;
        }
      }
    } catch (e) {
      if (sequence === loadSequence.current) {
        if (!hasLocalSnapshot && !hasRenderableMessages.current) setError(e instanceof Error ? e.message : 'تعذر تحميل الرسائل.');
        else setError(null);
      }
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [accessToken, id, user?.id]);
  const refreshLatestMessages = useCallback(async () => {
    if (!accessToken || !id) return;
    try {
      const page = await fetchMessagesPage(id, accessToken);
      if (activeConversationId.current !== id) return;
      setMessages((current) => mergeFetchedMessages(page.items, current));
      if (user?.id) void saveCachedChatMessages(user.id, id, page.items);
      if (!hasLoadedOlder.current) setNextCursor(page.nextCursor);
    } catch {
      // Live delivery is best-effort; cached content remains usable while offline.
    }
  }, [accessToken, id, user?.id]);
  const handleLiveEvent = useCallback((event: ChatLiveEvent) => {
    if (event.type === 'resync') { void refreshLatestMessages(); return; }
    if (event.type === 'typing' && event.conversationId === id && event.userId && event.userId !== user?.id) { setPartyTyping(event.isTyping === true); return; }
    if (event.type === 'message:new' && event.conversationId === id && event.message &&
        typeof event.message.id === 'string' && typeof event.message.senderId === 'string' &&
        typeof event.message.createdAt === 'string' && Number.isFinite(Date.parse(event.message.createdAt))) {
      const incoming = { ...event.message, conversationId: id } as ScreenMessage;
      setMessages((current) => mergeFetchedMessages([incoming], current));
      if (user?.id) void saveCachedChatMessages(user.id, id, [incoming]);
      return;
    }
    if (event.type === 'message:deleted' && event.conversationId === id && event.messageId) {
      const deletedAt = event.deletedAt || new Date().toISOString();
      setMessages((current) => current.map((message) => message.id === event.messageId
        ? { ...message, body: '', imageUrl: null, audioUrl: null, fileUrl: null, deletedAt }
        : message));
      if (user?.id) void markCachedChatMessageDeleted(user.id, id, event.messageId, deletedAt);
    }
  }, [id, refreshLatestMessages, user?.id]);
  useEffect(() => { const controller = new AbortController(); sessionAbort.current = controller; return () => controller.abort(); }, [accessToken, user?.id]);
  useEffect(() => subscribeChatOutboxSent((operationId, sent) => { setMessages((current) => replaceOptimisticMessage(current, `pending-${operationId}`, sent)); if (user?.id && sent.conversationId) void saveCachedChatMessages(user.id, sent.conversationId, [sent]); }), [user?.id]);
  useFocusEffect(useCallback(() => {
    void load();
    if (!accessToken || !id || !user?.id) return () => { loadSequence.current += 1; };
    let focused = true;
    let streamStop: (() => void) | null = null;
    let fallbackPoll: ReturnType<typeof setInterval> | null = null;
    let lastEventId: string | null = null;
    const stopFallback = () => { if (fallbackPoll) clearInterval(fallbackPoll); fallbackPoll = null; };
    const stopStream = () => { streamStop?.(); streamStop = null; };
    const startFallback = () => {
      if (!focused || AppState.currentState !== 'active' || fallbackPoll) return;
      // REST polling is only a compatibility fallback; SSE is the primary path.
      void refreshLatestMessages();
      fallbackPoll = setInterval(() => { if (focused && AppState.currentState === 'active') void refreshLatestMessages(); }, 30_000);
    };
    const startStream = () => {
      stopStream();
      if (!focused || AppState.currentState !== 'active') return;
      streamStop = subscribeChatLiveStream({
        token: accessToken,
        getLastEventId: () => lastEventId,
        onEvent: (event, eventId) => { if (eventId) lastEventId = eventId; handleLiveEvent(event); },
        onUnsupported: startFallback,
      });
    };
    startStream();
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        if (fallbackPoll) { stopFallback(); startFallback(); }
        else startStream();
        void refreshLatestMessages();
      } else {
        stopStream();
        stopFallback();
      }
    });
    return () => {
      focused = false;
      loadSequence.current += 1;
      stopStream();
      stopFallback();
      appStateSubscription.remove();
    };
  }, [accessToken, handleLiveEvent, id, load, refreshLatestMessages, user?.id]));
  useEffect(() => { hasRenderableMessages.current = messages.length > 0; }, [messages.length]);
  useEffect(() => { const unsubscribe = NetInfo.addEventListener((state) => { const connected = state.isConnected === true && state.isInternetReachable !== false; if (previousConnectivity.current === false && connected) void load(false); previousConnectivity.current = connected; }); return unsubscribe; }, [load]);
  const refreshMediaOutbox = useCallback(async () => { if (!user?.id) { setPendingMediaCount(0); return; } const items = await listChatMediaOutbox(user.id); setPendingMediaCount(items.length); }, [user?.id]);
  const flushMediaOutbox = useCallback(async () => { if (!accessToken || !user?.id) return; const network = await NetInfo.fetch(); const isOnline = network.isConnected === true && network.isInternetReachable !== false; if (!isOnline) { await refreshMediaOutbox(); return; } try { const result = await syncChatMediaOutbox({ isOnline, token: accessToken, csrfToken, ownerId: user.id, signal: sessionAbort.current.signal }); for (const item of result.sent) { if (item.conversationId === id) { setMessages(current => mergeFetchedMessages([item.message], current)); void saveCachedChatMessages(user.id, id, [item.message]); } } setPendingMediaCount(result.pending); } catch { await refreshMediaOutbox(); } }, [accessToken, csrfToken, id, refreshMediaOutbox, user?.id]);
  useEffect(() => { void refreshMediaOutbox(); void flushMediaOutbox(); const unsubscribe = NetInfo.addEventListener(state => { if (state.isConnected === true && state.isInternetReachable !== false) void flushMediaOutbox(); }); const appStateSubscription = AppState.addEventListener('change', state => { if (state === 'active') void flushMediaOutbox(); }); return () => { unsubscribe(); appStateSubscription.remove(); }; }, [flushMediaOutbox, refreshMediaOutbox]);
  const lastMessageIdRef = useRef<string | null>(null);
  useEffect(() => {
    const last = messages[messages.length - 1];
    const lastId = last?.id ?? null;
    if (lastId && lastId !== lastMessageIdRef.current) {
      lastMessageIdRef.current = lastId;
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
    }
  }, [messages]);
  const loadOlder = useCallback(async () => { if (!accessToken || !id || !nextCursor || olderRequest.current || loading || loadingOlder) return; olderRequest.current = true; setLoadingOlder(true); try { const page = await fetchMessagesPage(id, accessToken, nextCursor); setMessages((current) => mergeFetchedMessages([...page.items, ...current], [])); if (user?.id) void saveCachedChatMessages(user.id, id, page.items); hasLoadedOlder.current = true; setNextCursor(page.nextCursor); } catch (e) { Alert.alert('تعذر تحميل الرسائل الأقدم', e instanceof Error ? e.message : 'تحقق من الاتصال وحاول مجددًا.'); } finally { olderRequest.current = false; setLoadingOlder(false); } }, [accessToken, id, nextCursor, loading, loadingOlder, user?.id]);
  const submit = async () => {
    const body = draft.trim();
    if (!body || sending || !accessToken || !id || !user?.id) return;
    setSending(true);
    setDraft('');
    const operationId = `message:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    const tempId = `pending-${operationId}`;
    let persisted = false;
    try {
      // Persist before any network request so a process death or lost response
      // cannot erase the user's message or change its idempotency key.
      const queued = await enqueueChatMessage({ ownerId: user.id, conversationId: id, body, operationId });
      persisted = true;
      const optimistic: ScreenMessage = { id: `pending-${queued.operationId}`, conversationId: id, senderId: user.id, body: queued.body, createdAt: new Date(queued.createdAt).toISOString(), outboxAttempts: queued.attempts, outboxLastError: queued.lastError };
      setMessages((current) => current.some((message) => message.id === optimistic.id) ? current : [...current, optimistic]);
      const network = await NetInfo.fetch();
      const isOnline = network.isConnected === true && network.isInternetReachable !== false;
      if (!isOnline) {
        Alert.alert('حُفظت الرسالة', 'لا يوجد اتصال حاليًا. حُفظت الرسالة على هذا الجهاز وستُرسل عند عودة الاتصال.');
      } else {
        const result = await syncChatMessageOutbox({ isOnline, token: accessToken, csrfToken, ownerId: user.id, signal: sessionAbort.current.signal });
        if (!result.sent.some((item) => item.operationId === operationId)) {
          Alert.alert('الرسالة بانتظار المزامنة', 'حُفظت الرسالة على هذا الجهاز، لكن تعذّر تأكيد إرسالها. سيُعاد المحاولة تلقائيًا عند توفر الاتصال.');
        }
      }
    } catch (e) {
      if (!persisted) {
        setMessages((current) => current.filter((message) => message.id !== tempId));
        // Only restore the failed body if the user hasn't typed something new
        // in the meantime. Overwriting their new draft would silently lose it.
        setDraft((current) => current || body);
        Alert.alert('تعذر حفظ الرسالة', e instanceof Error ? e.message : 'لم تُحفظ الرسالة محليًا. حاول مجددًا.');
      } else {
        Alert.alert('الرسالة محفوظة محليًا', 'تعذرت المزامنة الآن، لكن الرسالة بقيت في الطابور وستُعاد المحاولة عند توفر الاتصال.');
      }
    } finally {
      setSending(false);
    }
  };
  const retryFailedMessage = useCallback(async (message: ScreenMessage) => {
    if (!user?.id || !accessToken || !message.id.startsWith('pending-')) return;
    const operationId = message.id.slice('pending-'.length);
    try {
      const reset = await retryChatMessage(operationId, user.id);
      if (!reset) return;
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, outboxAttempts: 0, outboxLastError: null } : item));
      const network = await NetInfo.fetch();
      const isOnline = network.isConnected === true && network.isInternetReachable !== false;
      if (isOnline) {
        const result = await syncChatMessageOutbox({ isOnline, token: accessToken, csrfToken, ownerId: user.id, signal: sessionAbort.current.signal });
        if (!result.sent.some((item) => item.operationId === operationId)) {
          Alert.alert('تعذرت إعادة الإرسال', 'أُعيدت الرسالة إلى الطابور وستُحاول المزامنة تلقائيًا.');
        }
      } else {
        Alert.alert('تمت جدولة الرسالة', 'لا يوجد اتصال حاليًا. ستُرسل عند عودة الاتصال.');
      }
    } catch (e) {
      Alert.alert('تعذرت إعادة المحاولة', e instanceof Error ? e.message : 'حاول مجددًا لاحقًا.');
    }
  }, [accessToken, csrfToken, user?.id]);
  const confirmDiscardFailedMessage = useCallback((message: ScreenMessage) => {
    if (!user?.id || !message.id.startsWith('pending-')) return;
    const operationId = message.id.slice('pending-'.length);
    Alert.alert('حذف الرسالة غير المرسلة؟', 'سيُحذف النص المحفوظ محليًا ولن يُرسل.', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => {
        void discardFailedChatMessage(operationId, user.id).then((removed) => {
          if (removed) setMessages((current) => current.filter((item) => item.id !== message.id));
        }).catch(() => Alert.alert('تعذر الحذف', 'لم تُحذف الرسالة. حاول مجددًا.'));
      } },
    ]);
  }, [user?.id]);
  useEffect(() => {
    if (!accessToken || !id) return;
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (draft.trim()) {
      if (!typingActive.current || Date.now() - lastTypingSignalAt.current > 2500) {
        lastTypingSignalAt.current = Date.now(); typingActive.current = true;
        void signalChatTyping(id, true, accessToken, csrfToken).catch(() => undefined);
      }
      typingTimer.current = setTimeout(() => { typingActive.current = false; void signalChatTyping(id, false, accessToken, csrfToken).catch(() => undefined); }, 1800);
    } else if (typingActive.current) {
      typingActive.current = false; void signalChatTyping(id, false, accessToken, csrfToken).catch(() => undefined);
    }
    return () => { if (typingTimer.current) clearTimeout(typingTimer.current); };
  }, [draft, accessToken, csrfToken, id]);
  const queueAndTryMedia = useCallback(async (kind: ChatMediaKind, asset: { uri: string; fileName: string; mimeType: string }) => {
    if (!accessToken || !id || !user?.id) return;
    const queued = await enqueueChatMedia({ ownerId: user.id, conversationId: id, kind, ...asset, operationId: createChatMediaOperationId(kind) });
    setPendingMediaCount(current => current + 1);
    await flushMediaOutbox();
    const remaining = await listChatMediaOutbox(user.id);
    setPendingMediaCount(remaining.length);
    if (remaining.some(item => item.operationId === queued.operationId)) Alert.alert('حُفظ المرفق للإرسال', 'حُفظ المرفق داخل التطبيق، وستتم إعادة المحاولة عند توفر الاتصال.');
  }, [accessToken, flushMediaOutbox, id, user?.id]);
  const chooseAndSendImage = useCallback(async () => {
    if (!accessToken || !id || !user?.id || uploadingImage) return;
    setUploadingImage(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error('اسمح للتطبيق بالوصول إلى الصور لإرسال مرفق.');
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.82 });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (typeof asset.fileSize === 'number' && asset.fileSize > 5 * 1024 * 1024) throw new Error('حجم الصورة يتجاوز 5 ميغابايت. اختر صورة أصغر.');
      const sourceName = (asset.fileName || asset.uri.split('?')[0].split('/').pop() || 'image.jpg').toLowerCase();
      const ext = sourceName.match(/\.(jpe?g|png|webp)$/)?.[1];
      const declared = (asset.mimeType || '').toLowerCase();
      const mime = declared === 'image/jpg' ? 'image/jpeg' : declared || (ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext ? 'image/jpeg' : '');
      if (!['image/jpeg','image/png','image/webp'].includes(mime)) throw new Error('الصيغ المدعومة هي JPEG وPNG وWebP.');
      const extension = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
      await queueAndTryMedia('image', { uri: asset.uri, fileName: /\.(jpe?g|png|webp)$/i.test(asset.fileName || '') ? asset.fileName! : `chat-${Date.now()}.${extension}`, mimeType: mime });
    } catch (e) { Alert.alert('تعذر تجهيز الصورة', e instanceof Error ? e.message : 'تحقق من المساحة والاتصال وحاول مجددًا.'); }
    finally { setUploadingImage(false); }
  }, [accessToken, id, queueAndTryMedia, uploadingImage, user?.id]);
  const chooseAndSendFile = useCallback(async () => {
    if (!accessToken || !id || !user?.id || uploadingImage) return;
    setUploadingImage(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false, type: ['application/pdf','text/plain','text/csv','application/json','application/zip','application/x-zip-compressed','application/x-7z-compressed','application/vnd.rar','application/x-rar-compressed','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint'] });
      if (result.canceled || !result.assets[0]) return;
      const file = result.assets[0];
      if (!file.size || file.size > 15 * 1024 * 1024) throw new Error('حجم الملف يجب ألا يتجاوز 15 ميغابايت.');
      const allowedTypes = new Set(['application/pdf','text/plain','text/csv','application/json','application/zip','application/x-zip-compressed','application/x-7z-compressed','application/vnd.rar','application/x-rar-compressed','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint']);
      if (!file.mimeType || !allowedTypes.has(file.mimeType)) throw new Error('نوع الملف غير مدعوم. اختر PDF أو نصًا أو جدولًا أو مستند Office أو أرشيفًا مدعومًا.');
      await queueAndTryMedia('file', { uri: file.uri, fileName: file.name, mimeType: file.mimeType });
    } catch (e) { Alert.alert('تعذر تجهيز الملف', e instanceof Error ? e.message : 'اختر ملفًا مدعومًا وحاول مجددًا.'); }
    finally { setUploadingImage(false); }
  }, [accessToken, id, queueAndTryMedia, uploadingImage, user?.id]);
  const toggleAudioRecording = useCallback(async () => {
    if (!accessToken || !id || !user?.id || uploadingImage) return;
    if (!isRecordingAudio) {
      try {
        const permission = await AudioModule.requestRecordingPermissionsAsync();
        if (!permission.granted) throw new Error('اسمح باستخدام الميكروفون لتسجيل رسالة صوتية.');
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
        await audioRecorder.prepareToRecordAsync();
        audioRecorder.record({ forDuration: 60 });
        setIsRecordingAudio(true);
      } catch (e) { Alert.alert('تعذر بدء التسجيل', e instanceof Error ? e.message : 'تحقق من إذن الميكروفون.'); }
      return;
    }
    setIsRecordingAudio(false);
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) throw new Error('لم يتم حفظ التسجيل الصوتي.');
      const info = await (await import('expo-file-system/legacy')).getInfoAsync(uri);
      if (!info.exists || !info.size || info.size > 8 * 1024 * 1024) throw new Error('حجم التسجيل الصوتي يجب ألا يتجاوز 8 ميغابايت.');
      await queueAndTryMedia('audio', { uri, fileName: `voice-${Date.now()}.m4a`, mimeType: 'audio/mp4' });
    } catch (e) { Alert.alert('تعذر إرسال التسجيل', e instanceof Error ? e.message : 'حاول مجددًا.'); }
  }, [accessToken, audioRecorder, id, isRecordingAudio, queueAndTryMedia, uploadingImage, user?.id]);
  const performMessageAction = useCallback((message: ScreenMessage) => {
    if (!accessToken || !id || message.id.startsWith('pending-') || message.deletedAt) return;
    const toggleMark = (kind: 'pin' | 'star') => {
      const active = kind === 'pin' ? Boolean(message.isPinned) : Boolean(message.isStarredByMe);
      void setMessageMark(id, message.id, kind, !active, accessToken, csrfToken)
        .then(() => setMessages(current => current.map(row => row.id === message.id ? { ...row, ...(kind === 'pin' ? { isPinned: !active } : { isStarredByMe: !active }) } : row)))
        .catch(e => Alert.alert('تعذر تحديث الرسالة', e instanceof Error ? e.message : 'حاول مجددًا.'));
    };
    const deleteOwnMessage = () => Alert.alert('حذف الرسالة؟', 'سيتم حذف محتوى الرسالة من المحادثة.', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => {
        void deleteChatMessage(id, message.id, accessToken, csrfToken).then(() => {
          const deletedAt = new Date().toISOString();
          setMessages(current => current.map(row => row.id === message.id ? { ...row, body: '', imageUrl: null, audioUrl: null, fileUrl: null, deletedAt } : row));
          if (user?.id) void markCachedChatMessageDeleted(user.id, id, message.id, deletedAt);
        }).catch(e => Alert.alert('تعذر حذف الرسالة', e instanceof Error ? e.message : 'حاول مجددًا.'));
      } },
    ]);
    Alert.alert('خيارات الرسالة', 'اضغط مطولًا على أي رسالة لإدارة تثبيتها أو حفظها.', [
      { text: message.isPinned ? 'إلغاء التثبيت' : 'تثبيت', onPress: () => toggleMark('pin') },
      { text: message.isStarredByMe ? 'إزالة من المفضلة' : 'إضافة للمفضلة', onPress: () => toggleMark('star') },
      ...(message.senderId === user?.id ? [{ text: 'المزيد', onPress: deleteOwnMessage }] : [{ text: 'إغلاق', style: 'cancel' as const }]),
    ]);
  }, [accessToken, csrfToken, id, user?.id]);
  const normalizedSearch = messageSearch.trim().toLocaleLowerCase();
  const visibleMessages = normalizedSearch ? messages.filter(message => (message.body || '').toLocaleLowerCase().includes(normalizedSearch)) : messages;
  const other = conversation && user ? (conversation.buyerId === user.id ? conversation.seller : conversation.buyer) : null;
  return <SafeAreaView style={styles.safe} edges={['top','bottom']}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.header}><Pressable onPress={() => router.back()} accessibilityRole="button"><Text style={styles.link}>رجوع</Text></Pressable><View style={styles.headerCenter}><Text numberOfLines={1} style={styles.heading}>{other?.name || 'المحادثة'}</Text>{conversation?.ad?.title ? <Text numberOfLines={1} style={styles.context}>{conversation.ad.title}</Text> : null}{partyTyping ? <Text style={styles.typing}>يكتب الآن…</Text> : null}</View><Pressable onPress={() => setSearchOpen(value => !value)} accessibilityRole="button"><Text style={styles.link}>{searchOpen ? 'إغلاق البحث' : 'بحث'}</Text></Pressable></View>
    {searchOpen ? <View style={styles.searchBar}><TextInput value={messageSearch} onChangeText={setMessageSearch} placeholder="ابحث في الرسائل المحمّلة…" placeholderTextColor={colors.muted} style={styles.searchInput} textAlign="right"/><Text style={styles.searchCount}>{normalizedSearch ? `${visibleMessages.length} نتيجة` : 'بحث محلي دون طلبات إضافية'}</Text></View> : null}
    {loading ? <View style={styles.center}><ActivityIndicator size="large" color={colors.brand}/><Text style={styles.muted}>جاري تحميل الرسائل…</Text></View> : error ? <View style={styles.center}><Text style={styles.title}>تعذر فتح المحادثة</Text><Text style={styles.muted}>{error}</Text><Pressable style={styles.primary} onPress={() => void load()}><Text style={styles.primaryText}>إعادة المحاولة</Text></Pressable></View> : <>
      <FlatList ref={listRef} data={visibleMessages} keyExtractor={(item) => item.id} contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled" maintainVisibleContentPosition={{ minIndexForVisible: 0 }} onScroll={(event) => { if (event.nativeEvent.contentOffset.y <= 40) void loadOlder(); }} scrollEventThrottle={250} ListHeaderComponent={loadingOlder ? <ActivityIndicator size="small" color={colors.brand} /> : nextCursor ? <Text style={styles.olderHint}>اسحب إلى الأعلى لتحميل الرسائل الأقدم</Text> : undefined} ListEmptyComponent={<Text style={styles.muted}>لا توجد رسائل بعد. ابدأ المحادثة برسالة واضحة.</Text>} renderItem={({ item }) => { const mine = item.senderId === user?.id; return <Pressable onLongPress={() => performMessageAction(item)} delayLongPress={350} style={[styles.bubble, mine ? styles.mine : styles.theirs]}><>{item.imageUrl && !item.deletedAt ? <Image source={{ uri: item.imageUrl }} resizeMode="cover" style={styles.messageImage}/> : null}{item.audioUrl && !item.deletedAt ? <Pressable accessibilityRole="button" style={styles.mediaAction} onPress={() => void Linking.openURL(item.audioUrl!).catch(() => Alert.alert('تعذر فتح الصوت','تحقق من الاتصال وحاول مجددًا.'))}><Text style={styles.mediaActionText}>▶ تشغيل الرسالة الصوتية</Text></Pressable> : null}{item.fileUrl && !item.deletedAt ? <Pressable accessibilityRole="button" style={styles.mediaAction} onPress={() => void Linking.openURL(item.fileUrl!).catch(() => Alert.alert('تعذر فتح الملف','تحقق من الاتصال وحاول مجددًا.'))}><Text style={styles.mediaActionText}>📎 فتح الملف المرفق</Text></Pressable> : null}<Text style={[styles.messageText, mine && styles.mineText]}>{item.deletedAt ? 'تم حذف هذه الرسالة' : item.body || (item.imageUrl ? '📷 صورة مرفقة' : item.audioUrl ? '🎙️ رسالة صوتية' : item.fileUrl ? '📎 ملف مرفق' : 'رسالة')}</Text><Text style={[styles.time, mine && styles.mineTime]}>{messageTime(item.createdAt)}{item.isPinned ? ' · 📌' : ''}{item.isStarredByMe ? ' · ⭐' : ''}{item.id.startsWith('pending-') ? (item.outboxAttempts !== undefined && item.outboxAttempts >= CHAT_OUTBOX_MAX_ATTEMPTS ? ' · تعذّر الإرسال' : ' · بانتظار المزامنة') : ''}</Text>{item.id.startsWith('pending-') && item.outboxAttempts !== undefined && item.outboxAttempts >= CHAT_OUTBOX_MAX_ATTEMPTS ? <View style={styles.failedActions}><Pressable accessibilityRole="button" onPress={() => void retryFailedMessage(item)}><Text style={styles.failedAction}>إعادة المحاولة</Text></Pressable><Pressable accessibilityRole="button" onPress={() => confirmDiscardFailedMessage(item)}><Text style={styles.failedDelete}>حذف</Text></Pressable></View> : null}</> </Pressable>; }} />
      <>{pendingMediaCount > 0 ? <Text style={styles.pendingMedia}>مرفقات محفوظة للإرسال: {pendingMediaCount}</Text> : null}<View style={styles.composer}><Pressable accessibilityRole="button" disabled={uploadingImage || !accessToken} onPress={() => void chooseAndSendImage()} style={[styles.attach, uploadingImage && styles.disabled]}><Text style={styles.attachText}>{uploadingImage ? '…' : '＋ صورة'}</Text></Pressable><Pressable accessibilityRole="button" disabled={uploadingImage || !accessToken} onPress={() => void chooseAndSendFile()} style={[styles.attach, uploadingImage && styles.disabled]}><Text style={styles.attachText}>＋ ملف</Text></Pressable><Pressable accessibilityRole="button" disabled={uploadingImage || !accessToken} onPress={() => void toggleAudioRecording()} style={[styles.attach, isRecordingAudio && styles.recording, uploadingImage && styles.disabled]}><Text style={styles.attachText}>{isRecordingAudio ? '■ إيقاف' : '🎙 صوت'}</Text></Pressable><TextInput value={draft} onChangeText={setDraft} placeholder="اكتب رسالتك…" placeholderTextColor={colors.muted} multiline maxLength={2000} textAlign="right" style={styles.input} accessibilityLabel="نص الرسالة"/><Pressable accessibilityRole="button" disabled={!draft.trim() || sending} onPress={() => void submit()} style={[styles.send, (!draft.trim() || sending) && styles.disabled]}><Text style={styles.sendText}>{sending ? '…' : 'إرسال'}</Text></Pressable></View></>
    </>}
  </KeyboardAvoidingView></SafeAreaView>;
}
const styles = StyleSheet.create({safe:{flex:1,backgroundColor:colors.canvas},flex:{flex:1},header:{minHeight:60,paddingHorizontal:spacing.md,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:colors.surface,borderBottomWidth:1,borderBottomColor:colors.border,gap:spacing.sm},headerCenter:{flex:1,alignItems:'center'},typing:{fontSize:10,color:colors.brand,marginTop:2},searchBar:{paddingHorizontal:spacing.md,paddingVertical:spacing.sm,backgroundColor:colors.surface,borderBottomWidth:1,borderBottomColor:colors.border,gap:4},searchInput:{minHeight:40,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,paddingHorizontal:spacing.md,color:colors.ink,backgroundColor:colors.canvas},searchCount:{fontSize:10,color:colors.muted,textAlign:'right'},heading:{fontSize:16,fontWeight:'900',color:colors.ink},context:{fontSize:11,color:colors.muted,marginTop:2},link:{color:colors.brand,fontWeight:'800',padding:spacing.sm},center:{flex:1,alignItems:'center',justifyContent:'center',padding:spacing.xl,gap:spacing.md},title:{fontSize:17,fontWeight:'900',color:colors.ink},muted:{fontSize:13,color:colors.muted,textAlign:'center',lineHeight:21},primary:{backgroundColor:colors.brand,borderRadius:radius.md,padding:spacing.md},primaryText:{color:colors.white,fontWeight:'800'},messages:{padding:spacing.md,gap:spacing.sm,flexGrow:1,justifyContent:'flex-end'},olderHint:{fontSize:11,color:colors.muted,textAlign:'center',paddingVertical:spacing.sm},bubble:{maxWidth:'84%',paddingHorizontal:spacing.md,paddingVertical:spacing.sm,borderRadius:radius.md,gap:4},mine:{alignSelf:'flex-end',backgroundColor:colors.brand,borderBottomRightRadius:4},theirs:{alignSelf:'flex-start',backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderBottomLeftRadius:4},messageText:{fontSize:15,lineHeight:22,color:colors.ink,textAlign:'right'},mineText:{color:colors.white},messageImage:{width:220,height:180,borderRadius:radius.sm,marginBottom:4,backgroundColor:colors.canvas},mediaAction:{paddingHorizontal:spacing.sm,paddingVertical:spacing.sm,borderRadius:radius.sm,backgroundColor:colors.brandSoft,alignSelf:'flex-start'},mediaActionText:{fontSize:12,fontWeight:'800',color:colors.brand},time:{fontSize:10,color:colors.muted,textAlign:'left'},mineTime:{color:colors.brandSoft},failedActions:{flexDirection:'row',justifyContent:'flex-end',gap:spacing.md,marginTop:spacing.xs},failedAction:{fontSize:11,fontWeight:'900',color:colors.brand},failedDelete:{fontSize:11,fontWeight:'900',color:colors.danger},attach:{minHeight:44,alignItems:'center',justifyContent:'center',paddingHorizontal:spacing.sm,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border,backgroundColor:colors.canvas},attachText:{fontSize:12,fontWeight:'800',color:colors.brand},pendingMedia:{fontSize:11,color:colors.brand,textAlign:'right',paddingHorizontal:spacing.md,paddingVertical:4,backgroundColor:colors.surface},recording:{backgroundColor:colors.danger,borderColor:colors.danger},composer:{flexDirection:'row-reverse',alignItems:'flex-end',gap:spacing.sm,padding:spacing.md,backgroundColor:colors.surface,borderTopWidth:1,borderTopColor:colors.border},input:{flex:1,maxHeight:110,minHeight:44,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,paddingHorizontal:spacing.md,paddingVertical:spacing.sm,color:colors.ink,backgroundColor:colors.canvas},send:{height:44,alignItems:'center',justifyContent:'center',paddingHorizontal:spacing.lg,borderRadius:radius.lg,backgroundColor:colors.brand},sendText:{color:colors.white,fontWeight:'900'},disabled:{opacity:.45}});
