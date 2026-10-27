import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/AuthContext';
import { colors, radius, spacing } from '@/theme/tokens';
import { countUnownedOutboxMutations, discardOutboxMutation, listAllOutboxMutations, retryExhaustedMutation, type OutboxItem } from '@/storage/mutation-outbox';
import { syncOutboxIfReady } from '@/storage/outbox-sync';
import { acknowledgeFavoriteState, discardFavoriteState, listPendingFavoriteStates, restoreFavoriteStateIfAbsent, writeFavoriteAdIds, type PendingFavoriteState } from '@/features/ads/favorites.store';
import { fetchFavoriteAdIds, setFavoriteAdState } from '@/features/ads/favorites.api';
import { useNetInfo } from '@react-native-community/netinfo';
import { discardMarketplaceRequest, listPendingMarketplaceRequests, retryMarketplaceRequest, type PendingRequestOutboxItem } from '@/storage/request-outbox';
import { discardMarketplaceOrder, listPendingMarketplaceOrders, retryMarketplaceOrder, syncNextMarketplaceOrder, type PendingOrderOutboxItem } from '@/storage/order-outbox';
import { discardRequestOffer, listPendingRequestOffers, retryRequestOffer, syncNextRequestOffer, type PendingRequestOfferItem } from '@/storage/request-offer-outbox';
import { discardOfflineCreate, listOfflineCreates, retryOfflineCreate, syncNextOfflineCreate, type OfflineCreateItem } from '@/storage/entity-create-outbox';

function operationLabel(operation: OutboxItem['operation']): string {
  if (operation === 'create-ad') return 'إنشاء إعلان';
  if (operation === 'update-ad') return 'تعديل إعلان';
  return 'حذف إعلان';
}
function stateLabel(item: OutboxItem): string {
  if (item.state === 'processing') return 'قيد المعالجة';
  if (item.state === 'pending') return 'بانتظار المزامنة';
  if (item.attempts >= 8) return 'توقفت المحاولات؛ يلزم تدخل';
  return 'فشلت مؤقتًا — ستُعاد المحاولة';
}
function titleFromPayload(item: OutboxItem): string | null {
  try {
    const payload = JSON.parse(item.payloadJson) as { title?: unknown };
    return typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim() : null;
  } catch { return null; }
}

export default function OfflineQueueScreen() {
  const { accessToken, csrfToken, user } = useAuth();
  const netInfo = useNetInfo();
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [favoriteItems, setFavoriteItems] = useState<PendingFavoriteState[]>([]);
  const [requestItems, setRequestItems] = useState<PendingRequestOutboxItem[]>([]);
  const [orderItems, setOrderItems] = useState<PendingOrderOutboxItem[]>([]);
  const [offerItems, setOfferItems] = useState<PendingRequestOfferItem[]>([]);
  const [createItems, setCreateItems] = useState<OfflineCreateItem[]>([]);
  const [unownedCount, setUnownedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef({ userId: user?.id ?? null, token: accessToken, epoch: 0 });
  useEffect(() => {
    if (sessionRef.current.userId !== (user?.id ?? null) || sessionRef.current.token !== accessToken) {
      sessionRef.current = { userId: user?.id ?? null, token: accessToken, epoch: sessionRef.current.epoch + 1 };
    }
  }, [user?.id, accessToken]);
  const online = netInfo.isConnected === true && netInfo.isInternetReachable !== false;

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [mutations, legacyCount] = await Promise.all([
        user?.id ? listAllOutboxMutations(user.id) : Promise.resolve([]),
        countUnownedOutboxMutations(),
      ]);
      setItems(mutations);
      setUnownedCount(legacyCount);
      setFavoriteItems(user?.id ? await listPendingFavoriteStates(user.id) : []);
      setRequestItems(user?.id ? await listPendingMarketplaceRequests(user.id) : []);
      setOrderItems(user?.id ? await listPendingMarketplaceOrders(user.id) : []);
      setOfferItems(user?.id ? await listPendingRequestOffers(user.id) : []);
      setCreateItems(user?.id ? await listOfflineCreates(user.id) : []);
    }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر قراءة العمليات المحفوظة.'); }
    finally { setLoading(false); }
  }, [user?.id]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const discard = (item: OutboxItem) => Alert.alert('إلغاء العملية المحفوظة', 'سيتم حذف هذه العملية من هذا الجهاز ولن تُرسل إلى الخادم. هل تريد المتابعة؟', [
    { text: 'رجوع', style: 'cancel' },
    { text: 'إلغاء العملية', style: 'destructive', onPress: () => {
      setBusyId(item.id);
      void discardOutboxMutation(item.id, item.ownerId).then((removed) => {
        if (!removed) Alert.alert('لم تُلغَ العملية', 'قد تكون العملية قيد المعالجة الآن. حدّث القائمة وحاول لاحقًا.');
        return refresh();
      }).catch((e) => setError(e instanceof Error ? e.message : 'تعذر إلغاء العملية.')).finally(() => setBusyId(null));
    } },
  ]);

  const retry = async (item: OutboxItem) => {
    if (!online || !accessToken) { Alert.alert('المزامنة غير جاهزة', !online ? 'اتصل بالإنترنت أولًا.' : 'سجّل الدخول أولًا.'); return; }
    setBusyId(item.id); setError(null);
    try {
      const reset = await retryExhaustedMutation(item.id, item.ownerId);
      if (!reset) { setError('لم تعد العملية مستنفدة أو أنها تغيّرت؛ حدّث القائمة.'); return; }
      const result = await syncOutboxIfReady({ isOnline: online, token: accessToken, csrfToken, ownerId: user?.id });
      if (result.status === 'sync-result' && result.result.status === 'synced') {
        Alert.alert('تمت المزامنة', 'تم إرسال العملية وتأكيد حفظها.');
      } else if (result.status === 'sync-result' && result.result.status === 'server-succeeded-local-ack-pending') {
        Alert.alert('تم الإرسال', 'قبل الخادم العملية، لكن تأكيد حذفها من الطابور المحلي لم يكتمل بعد. لا تحذف بيانات التطبيق.');
      } else if (result.status === 'sync-result' && result.result.status === 'blocked-by-unsupported') {
        Alert.alert('الطابور متوقف', 'توجد عملية أقدم غير مدعومة؛ لم نتجاوزها للحفاظ على ترتيب التعديلات.');
      }
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذرت إعادة المحاولة.'); }
    finally { setBusyId(null); }
  };

  const retryFavorite = async (item: PendingFavoriteState) => {
    if (!online || !accessToken || !user?.id) { Alert.alert('المزامنة غير جاهزة', !online ? 'اتصل بالإنترنت أولًا.' : 'سجّل الدخول بالحساب نفسه أولًا.'); return; }
    const session = { ...sessionRef.current };
    if (session.userId !== user.id || session.token !== accessToken) { setError('تغيّرت جلسة الدخول؛ حدّث القائمة قبل إعادة المحاولة.'); return; }
    setBusyId(item.operationId); setError(null);
    try {
      await setFavoriteAdState(item.adId, item.favorited, accessToken, item.operationId, csrfToken);
      if (sessionRef.current.epoch !== session.epoch || sessionRef.current.userId !== session.userId || sessionRef.current.token !== session.token) { setError('تغيّرت جلسة الدخول أثناء الطلب؛ احتُفظ بالعملية للمزامنة الآمنة لاحقًا.'); return; }
      const removed = await acknowledgeFavoriteState(user.id, item.adId, item.operationId);
      if (!removed) Alert.alert('تغيّرت العملية', 'تم تأكيد الحالة مع الخادم، لكن ظهرت نية أحدث محليًا؛ احتُفظ بالعملية الأحدث.');
      else Alert.alert('تمت المزامنة', 'أكد الخادم حالة المفضلة المطلوبة.');
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذرت مزامنة المفضلة.'); }
    finally { setBusyId(null); }
  };

  const cancelFavorite = (item: PendingFavoriteState) => {
    if (!online || !accessToken || !user?.id) { Alert.alert('الإلغاء يحتاج اتصالًا', 'لا يمكن التأكد مما إذا كان الخادم قد استلم التغيير قبل انقطاع الاتصال. اتصل بالإنترنت ثم ألغِ العملية بأمان.'); return; }
    Alert.alert('إلغاء تغيير المفضلة', 'سيُتحقق من الحالة الحالية على الخادم أولًا، ثم يُحذف التغيير المعلّق وتُحدّث النسخة المحلية.', [
    { text: 'رجوع', style: 'cancel' },
    { text: 'إلغاء التغيير', style: 'destructive', onPress: () => {
      const session = { ...sessionRef.current };
      if (session.userId !== user.id || session.token !== accessToken) { setError('تغيّرت جلسة الدخول؛ حدّث القائمة قبل الإلغاء.'); return; }
      setBusyId(item.operationId);
      void (async () => {
        let removed = false;
        try {
          // A transport failure is ambiguous: the server may already have applied the desired state.
          // Fetch authoritative state before cancellation, then overlay any other queued intents.
          const serverIds = await fetchFavoriteAdIds(accessToken);
          if (sessionRef.current.epoch !== session.epoch || sessionRef.current.userId !== session.userId || sessionRef.current.token !== session.token) { setError('تغيّرت جلسة الدخول أثناء التحقق؛ لم يُلغَ التغيير.'); return; }
          removed = user?.id ? await discardFavoriteState(user.id, item.adId, item.operationId) : false;
          if (!removed) Alert.alert('لم يُلغَ التغيير', 'تغيّرت العملية أو لم تعد موجودة؛ حدّث القائمة.');
          else if (user?.id) {
            const pending = await listPendingFavoriteStates(user.id);
            if (sessionRef.current.epoch !== session.epoch || sessionRef.current.userId !== session.userId || sessionRef.current.token !== session.token) {
              await restoreFavoriteStateIfAbsent(item);
              setError('تغيّرت جلسة الدخول أثناء الإلغاء؛ أُعيدت العملية للطابور حفاظًا على سلامتها.');
              return;
            }
            const merged = new Set(serverIds);
            for (const queued of pending) { if (queued.favorited) merged.add(queued.adId); else merged.delete(queued.adId); }
            await writeFavoriteAdIds([...merged], user.id);
          }
          await refresh();
        } catch (e) { setError(e instanceof Error ? e.message : 'تعذر إلغاء تغيير المفضلة.'); }
        finally { setBusyId(null); }
      })();
    } },
    ]);
  };

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.header}><Pressable onPress={() => router.back()} accessibilityRole="button"><Text style={styles.link}>رجوع</Text></Pressable><Text style={styles.heading}>العمليات دون اتصال</Text><Pressable onPress={() => void refresh()} accessibilityRole="button"><Text style={styles.link}>تحديث</Text></Pressable></View>
    <View style={styles.notice}><Text style={styles.noticeText}>تُحفظ هذه العمليات على الجهاز. قد توقف عملية أقدم غير مدعومة المزامنة، وستتوقف العمليات الأحدث حتى تُحل المشكلة للحفاظ على ترتيب التعديلات. لا تلغِ عملية إلا إذا كنت متأكدًا أنك لا تريد إرسالها.</Text></View>
    {unownedCount > 0 ? <View style={styles.notice}><Text style={styles.noticeText}>توجد {unownedCount} عملية قديمة محفوظة قبل ربط العمليات بالحساب. لم تُرسل تلقائيًا لأن مالكها غير معروف، وذلك لمنع تنفيذها بحساب آخر. راجعها من نسخة التطبيق السابقة أو احذف بيانات التطبيق فقط إذا لم تعد تحتاجها.</Text></View> : null}
    {!user ? <View style={styles.center}><Text style={styles.title}>سجّل الدخول لمزامنة العمليات</Text><Pressable style={styles.primary} onPress={() => router.push('/login')}><Text style={styles.primaryText}>تسجيل الدخول</Text></Pressable></View>
      : loading ? <View style={styles.center}><ActivityIndicator size="large" color={colors.brand}/><Text style={styles.muted}>جاري قراءة العمليات…</Text></View>
      : error && items.length === 0 ? <View style={styles.center}><Text style={styles.title}>تعذر تحميل القائمة</Text><Text style={styles.muted}>{error}</Text><Pressable style={styles.primary} onPress={() => void refresh()}><Text style={styles.primaryText}>إعادة المحاولة</Text></Pressable></View>
      : <ScrollView contentContainerStyle={styles.list}>{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Text style={styles.summary}>{items.length} عملية إعلانات محفوظة · {favoriteItems.length} تغيير مفضلة معلّق · {requestItems.length} طلب إنشاء محفوظ · {offerItems.length} عرض محفوظ · {orderItems.length} طلب شراء محفوظ · {createItems.length} إضافة منتج/خدمة/بيع محفوظة</Text>
        {favoriteItems.map((item) => <View key={`favorite-${item.adId}`} style={styles.card}>
          <Text style={styles.adTitle}>المفضلة · إعلان {item.adId}</Text>
          <Text style={styles.status}>{item.favorited ? 'بانتظار الإضافة إلى المفضلة' : 'بانتظار الإزالة من المفضلة'}</Text>
          <Text style={styles.muted}>حُفظ: {new Date(Number(item.operationId.match(/^fav-(\d+)/)?.[1]) || Date.now()).toLocaleString('ar')}</Text>
          <Text style={styles.muted}>تُرسل الحالة المطلوبة بأمان عند إعادة المحاولة؛ لن يُستخدم تبديل عكسي قد يكرر التغيير.</Text>
          <View style={styles.actions}>
            <Pressable disabled={busyId === item.operationId} style={styles.secondary} onPress={() => void retryFavorite(item)}><Text style={styles.secondaryText}>{busyId === item.operationId ? 'جارٍ…' : 'مزامنة الآن'}</Text></Pressable>
            <Pressable disabled={busyId === item.operationId} style={[styles.delete, busyId === item.operationId && styles.disabled]} onPress={() => cancelFavorite(item)}><Text style={styles.deleteText}>إلغاء التغيير</Text></Pressable>
          </View>
        </View>)}
        {requestItems.map((item) => <View key={`request-${item.id}`} style={styles.card}><Text style={styles.adTitle}>{item.payload.title}</Text><Text style={styles.status}>{item.attempts >= 8 ? 'توقفت المحاولات؛ يلزم تدخل' : 'طلب جديد · بانتظار المزامنة'}</Text><Text style={styles.muted}>النوع: {item.payload.type} · المحاولات: {item.attempts}/8 · حُفظ: {new Date(item.createdAt).toLocaleString('ar')}</Text>{item.lastError ? <Text style={styles.errorText}>آخر خطأ: {item.lastError}</Text> : null}<Text style={styles.muted}>لن يُعد الطلب منشورًا حتى يؤكد الخادم نجاح المزامنة.</Text><View style={styles.actions}>{item.attempts >= 8 ? <Pressable disabled={busyId === item.id} style={styles.secondary} onPress={() => { setBusyId(item.id); void retryMarketplaceRequest(item.id, user?.id).then((ok) => { if (!ok) Alert.alert('تعذرت إعادة المحاولة','حدّث القائمة ثم حاول مجددًا.'); return refresh(); }).catch((e) => setError(e instanceof Error ? e.message : 'تعذرت إعادة المحاولة.')).finally(() => setBusyId(null)); }}><Text style={styles.secondaryText}>إعادة المحاولة</Text></Pressable> : null}<Pressable disabled={busyId === item.id} style={styles.delete} onPress={() => Alert.alert('إلغاء الطلب المحفوظ','سيُحذف من الجهاز ولن يُرسل لاحقًا. هل تريد المتابعة؟',[{text:'رجوع',style:'cancel'},{text:'إلغاء العملية',style:'destructive',onPress:()=>{setBusyId(item.id);void discardMarketplaceRequest(item.id,user?.id).then((ok)=>{if(!ok)Alert.alert('لم تُلغَ العملية','قد تكون قيد المعالجة؛ حدّث القائمة.');return refresh();}).catch((e)=>setError(e instanceof Error?e.message:'تعذر الإلغاء.')).finally(()=>setBusyId(null));}}])}><Text style={styles.deleteText}>إلغاء العملية</Text></Pressable></View></View>)}
        {offerItems.map((item) => <View key={`offer-${item.id}`} style={styles.card}><Text style={styles.adTitle}>عرض محفوظ · {item.payload.price} ₪</Text><Text style={styles.status}>{item.attempts >= 8 ? 'توقفت المحاولات؛ يلزم تدخل' : item.state === 'processing' ? 'قيد المزامنة' : 'بانتظار المزامنة'}</Text><Text style={styles.muted}>رقم الطلب: {item.payload.requestId} · المحاولات: {item.attempts}/8 · حُفظ: {new Date(item.createdAt).toLocaleString('ar')}</Text>{item.payload.message ? <Text style={styles.muted}>الرسالة: {item.payload.message}</Text> : null}{item.lastError ? <Text style={styles.errorText}>آخر خطأ: {item.lastError}</Text> : null}<Text style={styles.warning}>العرض لم يُرسل إلى الخادم بعد. قد يُرفض إذا أُغلق الطلب أو انتهت صلاحيته قبل المزامنة.</Text><View style={styles.actions}>{item.attempts >= 8 ? <Pressable disabled={busyId === item.id} style={styles.secondary} onPress={() => { setBusyId(item.id); void retryRequestOffer(item.id,user?.id).then(async ok => { if (!ok) Alert.alert('تعذرت إعادة المحاولة','حدّث القائمة ثم حاول مجددًا.'); else await syncNextRequestOffer({isOnline:online,token:accessToken,csrfToken,ownerId:user?.id}); return refresh(); }).catch(e=>setError(e instanceof Error?e.message:'تعذرت إعادة المحاولة.')).finally(()=>setBusyId(null)); }}><Text style={styles.secondaryText}>إعادة المحاولة</Text></Pressable> : null}<Pressable disabled={busyId === item.id || item.state === 'processing'} style={styles.delete} onPress={() => Alert.alert('إلغاء العرض المحفوظ','سيُحذف من الجهاز ولن يُرسل لاحقًا. هل تريد المتابعة؟',[{text:'رجوع',style:'cancel'},{text:'إلغاء العرض',style:'destructive',onPress:()=>{setBusyId(item.id);void discardRequestOffer(item.id,user?.id).then(ok=>{if(!ok)Alert.alert('لم يُلغَ العرض','قد تكون المزامنة بدأت؛ حدّث القائمة.');return refresh();}).catch(e=>setError(e instanceof Error?e.message:'تعذر إلغاء العرض.')).finally(()=>setBusyId(null));}}])}><Text style={styles.deleteText}>{item.state === 'processing' ? 'قيد المعالجة' : 'إلغاء العرض'}</Text></Pressable></View></View>)}
        {orderItems.map((item) => <View key={`order-${item.id}`} style={styles.card}><Text style={styles.adTitle}>طلب شراء · {item.payload.items.length} منتج</Text><Text style={styles.status}>{item.attempts >= 8 ? 'توقفت المحاولات؛ يلزم تدخل' : item.state === 'processing' ? 'قيد المزامنة' : 'بانتظار المزامنة'}</Text><Text style={styles.muted}>المستلم: {item.payload.recipientName} · {item.payload.shippingCity}</Text><Text style={styles.muted}>المحاولات: {item.attempts}/8 · حُفظ: {new Date(item.createdAt).toLocaleString('ar')}</Text>{item.lastError ? <Text style={styles.errorText}>آخر خطأ: {item.lastError}</Text> : null}<Text style={styles.warning}>هذا الطلب محفوظ محليًا وليس مؤكدًا لدى المتجر. سيعيد الخادم التحقق من السعر والمخزون عند المزامنة.</Text><View style={styles.actions}>{item.attempts >= 8 ? <Pressable disabled={busyId === item.id} style={styles.secondary} onPress={() => { setBusyId(item.id); void retryMarketplaceOrder(item.id,user?.id).then(async ok => { if (!ok) Alert.alert('تعذرت إعادة المحاولة','حدّث القائمة ثم حاول مجددًا.'); else await syncNextMarketplaceOrder({isOnline:online,token:accessToken,csrfToken,ownerId:user?.id}); return refresh(); }).catch(e=>setError(e instanceof Error?e.message:'تعذرت إعادة المحاولة.')).finally(()=>setBusyId(null)); }}><Text style={styles.secondaryText}>إعادة المحاولة</Text></Pressable> : null}<Pressable disabled={busyId === item.id || item.state === 'processing'} style={styles.delete} onPress={() => Alert.alert('إلغاء طلب الشراء المحفوظ','سيُحذف الطلب من الجهاز ولن يُرسل لاحقًا. هل تريد المتابعة؟',[{text:'رجوع',style:'cancel'},{text:'إلغاء العملية',style:'destructive',onPress:()=>{setBusyId(item.id);void discardMarketplaceOrder(item.id,user?.id).then(ok=>{if(!ok)Alert.alert('لم يُلغَ الطلب','قد تكون المزامنة بدأت؛ حدّث القائمة.');return refresh();}).catch(e=>setError(e instanceof Error?e.message:'تعذر إلغاء الطلب.')).finally(()=>setBusyId(null));}}])}><Text style={styles.deleteText}>{item.state === 'processing' ? 'قيد المعالجة' : 'إلغاء الطلب'}</Text></Pressable></View></View>)}
        {createItems.map((item) => { const label=item.operation==='create-product'?'إضافة منتج':item.operation==='create-service'?'نشر خدمة':'تسجيل بيع'; const title=String(item.payload.name||item.payload.title||item.payload.entityTitle||label); return <View key={`create-${item.id}`} style={styles.card}><Text style={styles.adTitle}>{label}: {title}</Text><Text style={styles.status}>{item.attempts>=8?'توقفت المحاولات؛ يلزم تدخل':item.state==='processing'?'قيد المزامنة':'بانتظار المزامنة'}</Text><Text style={styles.muted}>المحاولات: {item.attempts}/8 · حُفظ: {new Date(item.createdAt).toLocaleString('ar')}</Text>{item.lastError?<Text style={styles.errorText}>آخر خطأ: {item.lastError}</Text>:null}<Text style={styles.warning}>لم يؤكد الخادم إنشاء هذا السجل بعد. قد يرفضه إذا تغيرت الصلاحيات أو التصنيفات أو البيانات قبل المزامنة.</Text><View style={styles.actions}>{item.attempts>=8?<Pressable disabled={busyId===item.id} style={styles.secondary} onPress={()=>{setBusyId(item.id);void retryOfflineCreate(item.id,user?.id).then(async ok=>{if(!ok)Alert.alert('تعذرت إعادة المحاولة','حدّث القائمة ثم حاول مجددًا.');else await syncNextOfflineCreate({isOnline:online,token:accessToken,csrfToken,ownerId:user?.id});return refresh();}).catch(e=>setError(e instanceof Error?e.message:'تعذرت إعادة المحاولة.')).finally(()=>setBusyId(null));}}><Text style={styles.secondaryText}>إعادة المحاولة</Text></Pressable>:null}<Pressable disabled={busyId===item.id||item.state==='processing'} style={styles.delete} onPress={()=>Alert.alert('إلغاء الإضافة المحفوظة','ستُحذف من الجهاز ولن تُرسل إلى الخادم. هل تريد المتابعة؟',[{text:'رجوع',style:'cancel'},{text:'إلغاء الإضافة',style:'destructive',onPress:()=>{setBusyId(item.id);void discardOfflineCreate(item.id,user?.id).then(ok=>{if(!ok)Alert.alert('لم تُلغَ الإضافة','قد تكون قيد المعالجة؛ حدّث القائمة.');return refresh();}).catch(e=>setError(e instanceof Error?e.message:'تعذر الإلغاء.')).finally(()=>setBusyId(null));}}])}><Text style={styles.deleteText}>{item.state==='processing'?'قيد المعالجة':'إلغاء الإضافة'}</Text></Pressable></View></View>; })}
        {items.length === 0 && favoriteItems.length === 0 && requestItems.length === 0 && offerItems.length === 0 && orderItems.length === 0 && createItems.length === 0 ? <View style={styles.empty}><Text style={styles.title}>لا توجد عمليات معلّقة</Text><Text style={styles.muted}>ستظهر هنا العمليات التي تحتاج إلى المزامنة أو التدخل.</Text></View> : items.map((item) => {
          const exhausted = item.state === 'failed' && item.attempts >= 8;
          const canDiscard = item.state !== 'processing';
          const isHead = items[0]?.id === item.id;
          const canRetry = exhausted && isHead && (item.operation === 'create-ad' || item.operation === 'delete-ad');
          return <View key={item.id} style={styles.card}>
            <Text style={styles.adTitle}>{titleFromPayload(item) || operationLabel(item.operation)}</Text>
            <Text style={styles.status}>{stateLabel(item)}</Text>
            <Text style={styles.muted}>النوع: {operationLabel(item.operation)} · المحاولات: {item.attempts}/8</Text>
            <Text style={styles.muted}>وقت الحفظ: {new Date(item.createdAt).toLocaleString('ar')}</Text>
            {item.lastError ? <Text style={styles.errorText}>آخر خطأ: {item.lastError}</Text> : null}
            {item.nextAttemptAt > Date.now() && item.state === 'failed' && item.attempts < 8 ? <Text style={styles.muted}>المحاولة التالية بعد: {new Date(item.nextAttemptAt).toLocaleString('ar')}</Text> : null}
            {item.operation === 'update-ad' && (() => { try { const payload = JSON.parse(item.payloadJson); return Array.isArray(payload?.images) && payload.images.length > 0; } catch { return true; } })() ? <Text style={styles.warning}>يتضمن هذا التعديل صورًا محفوظة محليًا وسيُعاد رفعها عند المزامنة، إذا فشل رفع الصور فستُعاد محاولة هذا العنصر قبل العمليات الأحدث؛ لا تحذف المسودة حتى تتأكد من نجاح المزامنة.</Text> : null}
            {exhausted && !isHead ? <Text style={styles.warning}>لا يمكن إعادة هذه العملية الآن لأن هناك عملية أقدم تسبقها في الطابور.</Text> : null}
            {exhausted && isHead && item.operation === 'update-ad' ? <Text style={styles.warning}>تعذرت المزامنة بعد عدة محاولات. تحقق من بيانات التعديل والاتصال ثم أعد المحاولة.</Text> : null}
            <View style={styles.actions}>
              {canRetry ? <Pressable disabled={busyId === item.id} style={styles.secondary} onPress={() => void retry(item)}><Text style={styles.secondaryText}>{busyId === item.id ? 'جارٍ…' : 'إعادة المحاولة'}</Text></Pressable> : null}
              <Pressable disabled={!canDiscard || busyId === item.id} style={[styles.delete, (!canDiscard || busyId === item.id) && styles.disabled]} onPress={() => discard(item)}><Text style={styles.deleteText}>{busyId === item.id ? 'جارٍ…' : canDiscard ? 'إلغاء العملية' : 'قيد المعالجة'}</Text></Pressable>
            </View>
          </View>;
        })}
      </ScrollView>}
  </SafeAreaView>;
}
const styles = StyleSheet.create({safe:{flex:1,backgroundColor:colors.canvas},header:{minHeight:60,paddingHorizontal:spacing.lg,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:colors.surface,borderBottomWidth:1,borderBottomColor:colors.border},heading:{fontSize:17,fontWeight:'900',color:colors.ink},link:{color:colors.brand,fontWeight:'800',padding:spacing.sm},notice:{padding:spacing.md,backgroundColor:colors.warningSoft,borderBottomWidth:1,borderBottomColor:colors.warningBorder},noticeText:{color:colors.warning,fontSize:12,lineHeight:19,textAlign:'right'},center:{flex:1,alignItems:'center',justifyContent:'center',padding:spacing.xl,gap:spacing.md},list:{padding:spacing.lg,gap:spacing.lg,paddingBottom:40},summary:{fontSize:13,fontWeight:'800',color:colors.ink,textAlign:'right'},empty:{padding:spacing.xl,alignItems:'center',gap:spacing.sm,backgroundColor:colors.surface,borderRadius:radius.md},card:{padding:spacing.lg,backgroundColor:colors.surface,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,gap:spacing.sm},adTitle:{fontSize:16,fontWeight:'900',color:colors.ink,textAlign:'right'},status:{fontSize:13,fontWeight:'800',color:colors.brand,textAlign:'right'},muted:{fontSize:12,color:colors.muted,textAlign:'right',lineHeight:19},errorText:{fontSize:12,color:colors.danger,textAlign:'right',lineHeight:19},warning:{fontSize:12,color:colors.warning,backgroundColor:colors.warningSoft,padding:spacing.sm,borderRadius:radius.sm,textAlign:'right',lineHeight:19},error:{fontSize:13,color:colors.danger,backgroundColor:colors.dangerSoft,padding:spacing.md,borderRadius:radius.sm,textAlign:'right'},primary:{backgroundColor:colors.brand,borderRadius:radius.md,padding:spacing.md},primaryText:{color:colors.white,fontWeight:'800'},actions:{flexDirection:'row-reverse',gap:spacing.sm,marginTop:spacing.xs},secondary:{borderWidth:1,borderColor:colors.brand,borderRadius:radius.sm,paddingHorizontal:spacing.lg,paddingVertical:spacing.md},secondaryText:{color:colors.brand,fontWeight:'800'},delete:{backgroundColor:colors.dangerSoft,borderRadius:radius.sm,paddingHorizontal:spacing.lg,paddingVertical:spacing.md},deleteText:{color:colors.danger,fontWeight:'800'},disabled:{opacity:.45},title:{fontSize:16,fontWeight:'800',color:colors.ink}});
