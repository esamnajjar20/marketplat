import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchConversation, fetchMessagesPage, type ChatMessage, type ConversationItem } from '@/features/messaging/messaging.api';
import { CHAT_OUTBOX_MAX_ATTEMPTS, discardFailedChatMessage, enqueueChatMessage, listChatMessagesForConversation, retryChatMessage } from '@/storage/chat-message-outbox';
import { subscribeChatOutboxSent, syncChatMessageOutbox } from '@/features/messaging/chat-message-outbox-sync';
import { colors, radius, spacing } from '@/theme/tokens';

type ScreenMessage = ChatMessage & { outboxAttempts?: number; outboxLastError?: string | null };

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
  const { user, accessToken, csrfToken } = useAuth(); const sessionAbort = useRef(new AbortController()); const [conversation, setConversation] = useState<ConversationItem | null>(null); const [messages, setMessages] = useState<ScreenMessage[]>([]); const [draft, setDraft] = useState(''); const [loading, setLoading] = useState(true); const [sending, setSending] = useState(false); const [loadingOlder, setLoadingOlder] = useState(false); const [nextCursor, setNextCursor] = useState<string | null>(null); const olderRequest = useRef(false); const hasLoadedOlder = useRef(false); const activeConversationId = useRef(id); const [error, setError] = useState<string | null>(null); const listRef = useRef<FlatList<ChatMessage>>(null); const loadSequence = useRef(0);
  const load = useCallback(async (showLoader = true) => { if (activeConversationId.current !== id) { activeConversationId.current = id; hasLoadedOlder.current = false; setMessages([]); setNextCursor(null); } const sequence = ++loadSequence.current; if (!accessToken || !id) { setLoading(false); setError('المحادثة أو جلسة الدخول غير متاحة.'); return; } if (showLoader) setLoading(true); setError(null); try { const [detail, page, queued] = await Promise.all([fetchConversation(id, accessToken), fetchMessagesPage(id, accessToken), user?.id ? listChatMessagesForConversation(user.id, id) : Promise.resolve([])]); if (sequence === loadSequence.current) { const queuedMessages: ScreenMessage[] = queued.map((item) => ({ id: `pending-${item.operationId}`, conversationId: item.conversationId, senderId: item.ownerId, body: item.body, createdAt: new Date(item.createdAt).toISOString(), outboxAttempts: item.attempts, outboxLastError: item.lastError })); setConversation(detail); setMessages((current) => mergeFetchedMessages(page.items, [...current, ...queuedMessages])); if (!hasLoadedOlder.current) setNextCursor(page.nextCursor); } } catch (e) { if (sequence === loadSequence.current) setError(e instanceof Error ? e.message : 'تعذر تحميل الرسائل.'); } finally { if (sequence === loadSequence.current) setLoading(false); } }, [accessToken, id, user?.id]);
  useEffect(() => { const controller = new AbortController(); sessionAbort.current = controller; return () => controller.abort(); }, [accessToken, user?.id]);
  useEffect(() => subscribeChatOutboxSent((operationId, sent) => { setMessages((current) => replaceOptimisticMessage(current, `pending-${operationId}`, sent)); }), []);
  useFocusEffect(useCallback(() => { void load(); return () => { loadSequence.current += 1; }; }, [load])); useEffect(() => { if (messages.length) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false })); }, [messages.length]);
  const loadOlder = useCallback(async () => { if (!accessToken || !id || !nextCursor || olderRequest.current || loading || loadingOlder) return; olderRequest.current = true; setLoadingOlder(true); try { const page = await fetchMessagesPage(id, accessToken, nextCursor); setMessages((current) => mergeFetchedMessages([...page.items, ...current], [])); hasLoadedOlder.current = true; setNextCursor(page.nextCursor); } catch (e) { Alert.alert('تعذر تحميل الرسائل الأقدم', e instanceof Error ? e.message : 'تحقق من الاتصال وحاول مجددًا.'); } finally { olderRequest.current = false; setLoadingOlder(false); } }, [accessToken, id, nextCursor, loading, loadingOlder]);
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
        setDraft(body);
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
  const other = conversation && user ? (conversation.buyerId === user.id ? conversation.seller : conversation.buyer) : null;
  return <SafeAreaView style={styles.safe} edges={['top','bottom']}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.header}><Pressable onPress={() => router.back()} accessibilityRole="button"><Text style={styles.link}>رجوع</Text></Pressable><View style={styles.headerCenter}><Text numberOfLines={1} style={styles.heading}>{other?.name || 'المحادثة'}</Text>{conversation?.ad?.title ? <Text numberOfLines={1} style={styles.context}>{conversation.ad.title}</Text> : null}</View><Pressable onPress={() => void load()} accessibilityRole="button"><Text style={styles.link}>تحديث</Text></Pressable></View>
    {loading ? <View style={styles.center}><ActivityIndicator size="large" color={colors.brand}/><Text style={styles.muted}>جاري تحميل الرسائل…</Text></View> : error ? <View style={styles.center}><Text style={styles.title}>تعذر فتح المحادثة</Text><Text style={styles.muted}>{error}</Text><Pressable style={styles.primary} onPress={() => void load()}><Text style={styles.primaryText}>إعادة المحاولة</Text></Pressable></View> : <>
      <FlatList ref={listRef} data={messages} keyExtractor={(item) => item.id} contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled" maintainVisibleContentPosition={{ minIndexForVisible: 0 }} onScroll={(event) => { if (event.nativeEvent.contentOffset.y <= 40) void loadOlder(); }} scrollEventThrottle={250} ListHeaderComponent={loadingOlder ? <ActivityIndicator size="small" color={colors.brand} /> : nextCursor ? <Text style={styles.olderHint}>اسحب إلى الأعلى لتحميل الرسائل الأقدم</Text> : null} ListEmptyComponent={<Text style={styles.muted}>لا توجد رسائل بعد. ابدأ المحادثة برسالة واضحة.</Text>} renderItem={({ item }) => { const mine = item.senderId === user?.id; return <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}><Text style={[styles.messageText, mine && styles.mineText]}>{item.deletedAt ? 'تم حذف هذه الرسالة' : item.body || (item.imageUrl ? '📷 صورة مرفقة' : item.audioUrl ? '🎙️ رسالة صوتية' : item.fileUrl ? '📎 ملف مرفق' : 'رسالة')}</Text><Text style={[styles.time, mine && styles.mineTime]}>{new Intl.DateTimeFormat('ar', { hour:'2-digit', minute:'2-digit' }).format(new Date(item.createdAt))}{item.id.startsWith('pending-') ? (item.outboxAttempts !== undefined && item.outboxAttempts >= CHAT_OUTBOX_MAX_ATTEMPTS ? ' · تعذّر الإرسال' : ' · بانتظار المزامنة') : ''}</Text>{item.id.startsWith('pending-') && item.outboxAttempts !== undefined && item.outboxAttempts >= CHAT_OUTBOX_MAX_ATTEMPTS ? <View style={styles.failedActions}><Pressable accessibilityRole="button" onPress={() => void retryFailedMessage(item)}><Text style={styles.failedAction}>إعادة المحاولة</Text></Pressable><Pressable accessibilityRole="button" onPress={() => confirmDiscardFailedMessage(item)}><Text style={styles.failedDelete}>حذف</Text></Pressable></View> : null}</View>; }} />
      <View style={styles.composer}><TextInput value={draft} onChangeText={setDraft} placeholder="اكتب رسالتك…" placeholderTextColor={colors.muted} multiline maxLength={2000} textAlign="right" style={styles.input} accessibilityLabel="نص الرسالة"/><Pressable accessibilityRole="button" disabled={!draft.trim() || sending} onPress={() => void submit()} style={[styles.send, (!draft.trim() || sending) && styles.disabled]}><Text style={styles.sendText}>{sending ? '…' : 'إرسال'}</Text></Pressable></View>
    </>}
  </KeyboardAvoidingView></SafeAreaView>;
}
const styles = StyleSheet.create({safe:{flex:1,backgroundColor:colors.canvas},flex:{flex:1},header:{minHeight:60,paddingHorizontal:spacing.md,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:colors.surface,borderBottomWidth:1,borderBottomColor:colors.border,gap:spacing.sm},headerCenter:{flex:1,alignItems:'center'},heading:{fontSize:16,fontWeight:'900',color:colors.ink},context:{fontSize:11,color:colors.muted,marginTop:2},link:{color:colors.brand,fontWeight:'800',padding:spacing.sm},center:{flex:1,alignItems:'center',justifyContent:'center',padding:spacing.xl,gap:spacing.md},title:{fontSize:17,fontWeight:'900',color:colors.ink},muted:{fontSize:13,color:colors.muted,textAlign:'center',lineHeight:21},primary:{backgroundColor:colors.brand,borderRadius:radius.md,padding:spacing.md},primaryText:{color:'#fff',fontWeight:'800'},messages:{padding:spacing.md,gap:spacing.sm,flexGrow:1,justifyContent:'flex-end'},olderHint:{fontSize:11,color:colors.muted,textAlign:'center',paddingVertical:spacing.sm},bubble:{maxWidth:'84%',paddingHorizontal:spacing.md,paddingVertical:spacing.sm,borderRadius:radius.md,gap:4},mine:{alignSelf:'flex-end',backgroundColor:colors.brand,borderBottomRightRadius:4},theirs:{alignSelf:'flex-start',backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderBottomLeftRadius:4},messageText:{fontSize:15,lineHeight:22,color:colors.ink,textAlign:'right'},mineText:{color:'#fff'},time:{fontSize:10,color:colors.muted,textAlign:'left'},mineTime:{color:'#D8EEE8'},failedActions:{flexDirection:'row',justifyContent:'flex-end',gap:spacing.md,marginTop:spacing.xs},failedAction:{fontSize:11,fontWeight:'900',color:colors.brand},failedDelete:{fontSize:11,fontWeight:'900',color:colors.danger},composer:{flexDirection:'row-reverse',alignItems:'flex-end',gap:spacing.sm,padding:spacing.md,backgroundColor:colors.surface,borderTopWidth:1,borderTopColor:colors.border},input:{flex:1,maxHeight:110,minHeight:44,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,paddingHorizontal:spacing.md,paddingVertical:spacing.sm,color:colors.ink,backgroundColor:colors.canvas},send:{height:44,alignItems:'center',justifyContent:'center',paddingHorizontal:spacing.lg,borderRadius:radius.lg,backgroundColor:colors.brand},sendText:{color:'#fff',fontWeight:'900'},disabled:{opacity:.45}});
