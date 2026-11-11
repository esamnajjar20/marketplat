import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { formatDate, formatMoney } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { confirmAlert } from '@/lib/confirm';
import { router, useFocusEffect } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { EmptyState, ErrorState, LoadingState, PageShell } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthContext';
import { formatSafeDate } from '@/lib/date-format';
import { fontSizes, radius, spacing, fontWeights } from '@/theme/tokens';
import { OUTBOX_MAX_ATTEMPTS } from '@/storage/outbox';
import { countUnownedOutboxMutations, discardOutboxMutation, listAllOutboxMutations, retryExhaustedMutation, syncOutboxIfReady, discardMarketplaceRequest, listPendingMarketplaceRequests, retryMarketplaceRequest, type PendingRequestOutboxItem, discardMarketplaceOrder, listPendingMarketplaceOrders, retryMarketplaceOrder, syncNextMarketplaceOrder, type PendingOrderOutboxItem, discardRequestOffer, listPendingRequestOffers, retryRequestOffer, syncNextRequestOffer, type PendingRequestOfferItem, discardOfflineCreate, listOfflineCreates, retryOfflineCreate, syncNextOfflineCreate, type OfflineCreateItem, listChatMessagesForOwner, listChatMediaOutbox, type ChatMessageOutboxItem, type ChatMediaOutboxItem, type OutboxItem, } from '@/storage/outbox-manager';
import { acknowledgeFavoriteState, discardFavoriteState, listPendingFavoriteStates, restoreFavoriteStateIfAbsent, writeFavoriteAdIds, type PendingFavoriteState } from '@/features/ads/favorites.store';
import { fetchFavoriteAdIds, setFavoriteAdState } from '@/features/ads/favorites.api';
import { useNetInfo } from '@react-native-community/netinfo';
import { showToast } from '@/lib/toast';
function operationLabel(operation: OutboxItem['operation']): string {
    if (operation === 'create-ad')
        return 'إنشاء إعلان';
    if (operation === 'update-ad')
        return 'تعديل إعلان';
    return 'حذف إعلان';
}
function stateLabel(item: OutboxItem): string {
    if (item.state === 'processing')
        return 'قيد المعالجة';
    if (item.state === 'pending')
        return 'بانتظار المزامنة';
    if (item.state === 'failed') {
        if (item.attempts >= OUTBOX_MAX_ATTEMPTS)
            return 'توقفت المحاولات؛ يلزم تدخل';
        return 'فشلت مؤقتًا — ستُعاد المحاولة';
    }
    return item.state;
}
function titleFromPayload(item: OutboxItem): string | null {
    try {
        const payload = JSON.parse(item.payloadJson) as {
            title?: unknown;
        };
        return typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim() : null;
    }
    catch {
        return null;
    }
}
export default function OfflineQueueScreen() {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createThemeStyles(colors), [colors]);
    const { accessToken, csrfToken, user } = useAuth();
    const netInfo = useNetInfo();
    const [items, setItems] = useState<OutboxItem[]>([]);
    const [favoriteItems, setFavoriteItems] = useState<PendingFavoriteState[]>([]);
    const [requestItems, setRequestItems] = useState<PendingRequestOutboxItem[]>([]);
    const [orderItems, setOrderItems] = useState<PendingOrderOutboxItem[]>([]);
    const [offerItems, setOfferItems] = useState<PendingRequestOfferItem[]>([]);
    const [createItems, setCreateItems] = useState<OfflineCreateItem[]>([]);
    const [chatMessages, setChatMessages] = useState<ChatMessageOutboxItem[]>([]);
    const [chatMedia, setChatMedia] = useState<ChatMediaOutboxItem[]>([]);
    const [unownedCount, setUnownedCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const sessionRef = useRef({
        userId: user?.id ?? null, token: accessToken, epoch: 0
    });
    useEffect(() => {
        if (sessionRef.current.userId !== (user?.id ?? null) || sessionRef.current.token !== accessToken) {
            sessionRef.current = {
                userId: user?.id ?? null, token: accessToken, epoch: sessionRef.current.epoch + 1
            };
        }
    }, [user?.id, accessToken]);
    const online = netInfo.isConnected === true && netInfo.isInternetReachable !== false;
    const headId = useMemo(() => {
        let m: OutboxItem | undefined;
        for (const it of items) {
            if (!m || it.createdAt < m.createdAt)
                m = it;
        }
        return m?.id;
    }, [items]);
    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [mutations, legacyCount] = await Promise.all([
                user?.id ? listAllOutboxMutations(user.id) : Promise.resolve([]),
                countUnownedOutboxMutations(),
            ]);
            setItems(mutations);
            setUnownedCount(legacyCount);
            const settled = await Promise.allSettled([
                user?.id ? listPendingFavoriteStates(user.id) : Promise.resolve([] as PendingFavoriteState[]),
                user?.id ? listPendingMarketplaceRequests(user.id) : Promise.resolve([] as PendingRequestOutboxItem[]),
                user?.id ? listPendingMarketplaceOrders(user.id) : Promise.resolve([] as PendingOrderOutboxItem[]),
                user?.id ? listPendingRequestOffers(user.id) : Promise.resolve([] as PendingRequestOfferItem[]),
                user?.id ? listOfflineCreates(user.id) : Promise.resolve([] as OfflineCreateItem[]),
                user?.id ? listChatMessagesForOwner(user.id) : Promise.resolve([] as ChatMessageOutboxItem[]),
                user?.id ? listChatMediaOutbox(user.id) : Promise.resolve([] as ChatMediaOutboxItem[]),
            ]);
            const [favR, reqR, ordR, offR, creR, chatR, mediaR] = settled;
            if (favR.status === 'fulfilled')
                setFavoriteItems(favR.value);
            if (reqR.status === 'fulfilled')
                setRequestItems(reqR.value);
            if (ordR.status === 'fulfilled')
                setOrderItems(ordR.value);
            if (offR.status === 'fulfilled')
                setOfferItems(offR.value);
            if (creR.status === 'fulfilled')
                setCreateItems(creR.value);
            if (chatR.status === 'fulfilled')
                setChatMessages(chatR.value);
            if (mediaR.status === 'fulfilled')
                setChatMedia(mediaR.value);
            const failed = settled.find((r) => r.status === 'rejected');
            if (failed && failed.status === 'rejected') {
                setError(`تعذر تحميل بعض القوائم: ${failed.reason instanceof Error ? failed.reason.message : String(failed.reason)}`);
            }
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'تعذر قراءة العمليات المحفوظة.');
        }
        finally {
            setLoading(false);
        }
    }, [user?.id]);
    useFocusEffect(useCallback(() => {
        void refresh();
    }, [refresh]));
    const discard = (item: OutboxItem) => confirmAlert('إلغاء العملية المحفوظة', 'سيتم حذف هذه العملية من هذا الجهاز ولن تُرسل إلى الخادم. هل تريد المتابعة؟', [
        {
            text: 'رجوع', style: 'cancel'
        },
        {
            text: 'إلغاء العملية', style: 'destructive', onPress: () => {
                const session = { ...sessionRef.current };
                if (!user?.id || session.userId !== user.id || session.token !== accessToken) {
                    setError('تغيّرت جلسة الدخول؛ حدّث القائمة قبل الإلغاء.');
                    return;
                }
                setBusyId(item.id);
                void discardOutboxMutation(item.id, item.ownerId).then((removed) => {
                    if (!removed)
                        showToast('لم تُلغَ العملية', 'قد تكون العملية قيد المعالجة الآن. حدّث القائمة وحاول لاحقًا.', 'warning');
                }).catch((e) => setError(e instanceof Error ? e.message : 'تعذر إلغاء العملية.')).finally(() => {
                    setBusyId(null);
                    void refresh();
                });
            }
        },
    ]);
    const retry = async (item: OutboxItem) => {
        if (!online || !accessToken || !user?.id) {
            showToast('المزامنة غير جاهزة', !online ? 'اتصل بالإنترنت أولًا.' : 'سجّل الدخول أولًا.', 'info');
            return;
        }
        const session = { ...sessionRef.current };
        if (session.userId !== user.id || session.token !== accessToken) {
            setError('تغيّرت جلسة الدخول؛ حدّث القائمة قبل إعادة المحاولة.');
            return;
        }
        setBusyId(item.id);
        setError(null);
        try {
            const reset = await retryExhaustedMutation(item.id, item.ownerId);
            if (!reset) {
                setError('لم تعد العملية مستنفدة أو أنها تغيّرت؛ حدّث القائمة.');
                return;
            }
            if (sessionRef.current.epoch !== session.epoch || sessionRef.current.userId !== session.userId || sessionRef.current.token !== session.token) {
                setError('تغيّرت جلسة الدخول أثناء المحاولة؛ حدّث القائمة.');
                return;
            }
            const result = await syncOutboxIfReady({
                isOnline: online, token: accessToken, csrfToken, ownerId: user?.id
            });
            if (result.status === 'sync-result' && result.result.status === 'synced') {
                showToast('تمت المزامنة', 'تم إرسال العملية وتأكيد حفظها.', 'success');
            }
            else if (result.status === 'sync-result' && result.result.status === 'server-succeeded-local-ack-pending') {
                showToast('تم الإرسال', 'قبل الخادم العملية، لكن تأكيد حذفها من الطابور المحلي لم يكتمل بعد. لا تحذف بيانات التطبيق.', 'success');
            }
            else if (result.status === 'sync-result' && result.result.status === 'blocked-by-unsupported') {
                showToast('الطابور متوقف', 'توجد عملية أقدم غير مدعومة؛ لم نتجاوزها للحفاظ على ترتيب التعديلات.', 'info');
            }
            else if (result.status !== 'sync-result') {
                showToast('لم تُنفّذ المزامنة', 'المزامنة غير جاهزة الآن (قد تكون هناك عملية أخرى قيد التنفيذ). حدّث القائمة وحاول مرة أخرى.', 'info');
            }
            else {
                showToast('لم تكتمل المزامنة', 'لم ينجح إرسال العملية. راجع التفاصيل في القائمة ثم حاول مرة أخرى.', 'error');
            }
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'تعذرت إعادة المحاولة.');
        }
        finally {
            setBusyId(null);
            void refresh();
        }
    };
    const retryFavorite = async (item: PendingFavoriteState) => {
        if (!online || !accessToken || !user?.id) {
            showToast('المزامنة غير جاهزة', !online ? 'اتصل بالإنترنت أولًا.' : 'سجّل الدخول بالحساب نفسه أولًا.', 'info');
            return;
        }
        const session = { ...sessionRef.current };
        if (session.userId !== user.id || session.token !== accessToken) {
            setError('تغيّرت جلسة الدخول؛ حدّث القائمة قبل إعادة المحاولة.');
            return;
        }
        setBusyId(item.operationId);
        setError(null);
        try {
            await setFavoriteAdState(item.adId, item.favorited, accessToken, item.operationId, csrfToken);
            if (sessionRef.current.epoch !== session.epoch || sessionRef.current.userId !== session.userId || sessionRef.current.token !== session.token) {
                setError('تغيّرت جلسة الدخول أثناء الطلب؛ احتُفظ بالعملية للمزامنة الآمنة لاحقًا.');
                return;
            }
            const removed = await acknowledgeFavoriteState(user.id, item.adId, item.operationId);
            if (!removed)
                showToast('تغيّرت العملية', 'تم تأكيد الحالة مع الخادم، لكن ظهرت نية أحدث محليًا؛ احتُفظ بالعملية الأحدث.', 'success');
            else
                showToast('تمت المزامنة', 'أكد الخادم حالة المفضلة المطلوبة.', 'success');
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'تعذرت مزامنة المفضلة.');
        }
        finally {
            setBusyId(null);
            void refresh();
        }
    };
    const cancelFavorite = (item: PendingFavoriteState) => {
        if (!online || !accessToken || !user?.id) {
            showToast('الإلغاء يحتاج اتصالًا', 'لا يمكن التأكد مما إذا كان الخادم قد استلم التغيير قبل انقطاع الاتصال. اتصل بالإنترنت ثم ألغِ العملية بأمان.', 'error');
            return;
        }
        confirmAlert('إلغاء تغيير المفضلة', 'سيُتحقق من الحالة الحالية على الخادم أولًا، ثم يُحذف التغيير المعلّق وتُحدّث النسخة المحلية.', [
            {
                text: 'رجوع', style: 'cancel'
            },
            {
                text: 'إلغاء التغيير', style: 'destructive', onPress: () => {
                    const session = { ...sessionRef.current };
                    if (session.userId !== user.id || session.token !== accessToken) {
                        setError('تغيّرت جلسة الدخول؛ حدّث القائمة قبل الإلغاء.');
                        return;
                    }
                    setBusyId(item.operationId);
                    void (async () => {
                        let removed = false;
                        try {
                            // A transport failure is ambiguous: the server may already have applied the desired state.
                            // Fetch authoritative state before cancellation, then overlay any other queued intents.
                            const serverIds = await fetchFavoriteAdIds(accessToken);
                            if (sessionRef.current.epoch !== session.epoch || sessionRef.current.userId !== session.userId || sessionRef.current.token !== session.token) {
                                setError('تغيّرت جلسة الدخول أثناء التحقق؛ لم يُلغَ التغيير.');
                                return;
                            }
                            removed = user?.id ? await discardFavoriteState(user.id, item.adId, item.operationId) : false;
                            if (!removed)
                                showToast('لم يُلغَ التغيير', 'تغيّرت العملية أو لم تعد موجودة؛ حدّث القائمة.', 'warning');
                            else if (user?.id) {
                                const pending = await listPendingFavoriteStates(user.id);
                                if (sessionRef.current.epoch !== session.epoch || sessionRef.current.userId !== session.userId || sessionRef.current.token !== session.token) {
                                    await restoreFavoriteStateIfAbsent(item);
                                    setError('تغيّرت جلسة الدخول أثناء الإلغاء؛ أُعيدت العملية للطابور حفاظًا على سلامتها.');
                                    return;
                                }
                                const merged = new Set(serverIds);
                                for (const queued of pending) {
                                    if (queued.favorited)
                                        merged.add(queued.adId);
                                    else
                                        merged.delete(queued.adId);
                                }
                                await writeFavoriteAdIds([...merged], user.id);
                            }
                        }
                        catch (e) {
                            setError(e instanceof Error ? e.message : 'تعذر إلغاء تغيير المفضلة.');
                        }
                        finally {
                            setBusyId(null);
                            void refresh();
                        }
                    })();
                }
            },
        ]);
    };
    return <PageShell title="العمليات دون اتصال" scroll={false} right={<Pressable onPress={() => void refresh()} accessibilityRole="button" accessibilityLabel="تحديث العمليات"><Text style={styles.link}>تحديث</Text></Pressable>}>
    <View style={styles.notice}><Text style={styles.noticeText}>تُحفظ هذه العمليات على الجهاز. قد توقف عملية أقدم غير مدعومة المزامنة، وستتوقف العمليات الأحدث حتى تُحل المشكلة للحفاظ على ترتيب التعديلات. لا تلغِ عملية إلا إذا كنت متأكدًا أنك لا تريد إرسالها.</Text></View>
    {unownedCount > 0 ? <View style={styles.notice}><Text style={styles.noticeText}>توجد {unownedCount} عملية قديمة محفوظة قبل ربط العمليات بالحساب. لم تُرسل تلقائيًا لأن مالكها غير معروف، وذلك لمنع تنفيذها بحساب آخر. راجعها من نسخة التطبيق السابقة أو احذف بيانات التطبيق فقط إذا لم تعد تحتاجها.</Text></View> : null}
    {!user ? <EmptyState title="سجّل الدخول لمزامنة العمليات" actionLabel="تسجيل الدخول" onAction={() => pushOnce('/login')}/>
            : loading ? <LoadingState message="جاري قراءة العمليات…"/>
                : error && items.length === 0 && favoriteItems.length === 0 && requestItems.length === 0 && offerItems.length === 0 && orderItems.length === 0 && createItems.length === 0 && chatMessages.length === 0 && chatMedia.length === 0 ? <ErrorState title="تعذر تحميل القائمة" description={error ?? undefined} onAction={() => void refresh()}/>
                    : <ScrollView contentContainerStyle={styles.list}>{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Text style={styles.summary}>{items.length} عملية إعلانات محفوظة · {favoriteItems.length} تغيير مفضلة معلّق · {requestItems.length} طلب إنشاء محفوظ · {offerItems.length} عرض محفوظ · {orderItems.length} طلب شراء محفوظ · {createItems.length} إضافة منتج/خدمة/بيع محفوظة · {chatMessages.length + chatMedia.length} رسالة/مرفق دردشة</Text>
        {favoriteItems.map((item) => <View key={`favorite-${item.adId}`} style={styles.card}>
          <Text style={styles.adTitle}>المفضلة · إعلان مرتبط بتغيير محفوظ</Text>
          <Text style={styles.status}>{item.favorited ? 'بانتظار الإضافة إلى المفضلة' : 'بانتظار الإزالة من المفضلة'}</Text>
          <Text style={styles.muted}>حُفظ: {formatDate(Number(item.operationId.match(/^fav-(\d+)/)?.[1]) || Date.now())}</Text>
          <Text style={styles.muted}>تُرسل الحالة المطلوبة بأمان عند إعادة المحاولة؛ لن يُستخدم تبديل عكسي قد يكرر التغيير.</Text>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={busyId !== null} style={styles.secondary} onPress={() => void retryFavorite(item)}><Text style={styles.secondaryText}>{busyId === item.operationId ? 'جارٍ…' : 'مزامنة الآن'}</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={busyId !== null} style={[styles.delete, busyId !== null && styles.disabled]} onPress={() => cancelFavorite(item)}><Text style={styles.deleteText}>إلغاء التغيير</Text></Pressable>
          </View>
        </View>)}
        {requestItems.map((item) => <View key={`request-${item.id}`} style={styles.card}><Text style={styles.adTitle}>{item.payload.title}</Text><Text style={styles.status}>{item.attempts >= OUTBOX_MAX_ATTEMPTS ? 'توقفت المحاولات؛ يلزم تدخل' : 'طلب جديد · بانتظار المزامنة'}</Text><Text style={styles.muted}>النوع: {item.payload.type} · المحاولات: {item.attempts}/{OUTBOX_MAX_ATTEMPTS} · حُفظ: {formatSafeDate(item.createdAt, 'dateTime')}</Text>{item.lastError ? <Text style={styles.errorText}>آخر خطأ: {item.lastError}</Text> : null}<Text style={styles.muted}>لن يُعد الطلب منشورًا حتى يؤكد الخادم نجاح المزامنة.</Text><View style={styles.actions}>{item.attempts >= OUTBOX_MAX_ATTEMPTS ? <Pressable accessibilityRole="button" disabled={busyId !== null} style={styles.secondary} onPress={() => {
                        setBusyId(item.id);
                        void retryMarketplaceRequest(item.id, user?.id).then((ok) => {
                            if (!ok)
                                showToast('تعذرت إعادة المحاولة', 'حدّث القائمة ثم حاول مرة أخرى.', 'error');
                        }).catch((e) => setError(e instanceof Error ? e.message : 'تعذرت إعادة المحاولة.')).finally(() => {
                            setBusyId(null);
                            void refresh();
                        });
                    }}><Text style={styles.secondaryText}>إعادة المحاولة</Text></Pressable> : null}<Pressable accessibilityRole="button" disabled={busyId !== null} style={styles.delete} onPress={() => confirmAlert('إلغاء الطلب المحفوظ', 'سيُحذف من الجهاز ولن يُرسل لاحقًا. هل تريد المتابعة؟', [{
                            text: 'رجوع', style: 'cancel'
                        }, {
                            text: 'إلغاء العملية', style: 'destructive', onPress: () => {
                                setBusyId(item.id);
                                void discardMarketplaceRequest(item.id, user?.id).then((ok) => {
                                    if (!ok)
                                        showToast('لم تُلغَ العملية', 'قد تكون قيد المعالجة؛ حدّث القائمة.', 'warning');
                                }).catch((e) => setError(e instanceof Error ? e.message : 'تعذر الإلغاء.')).finally(() => {
                                    setBusyId(null);
                                    void refresh();
                                });
                            }
                        }])}><Text style={styles.deleteText}>إلغاء العملية</Text></Pressable></View></View>)}
        {offerItems.map((item) => <View key={`offer-${item.id}`} style={styles.card}><Text style={styles.adTitle}>عرض محفوظ · {formatMoney(item.payload.price)}</Text><Text style={styles.status}>{item.attempts >= OUTBOX_MAX_ATTEMPTS ? 'توقفت المحاولات؛ يلزم تدخل' : item.state === 'processing' ? 'قيد المزامنة' : 'بانتظار المزامنة'}</Text><Text style={styles.muted}>رقم الطلب: {item.payload.requestId} · المحاولات: {item.attempts}/{OUTBOX_MAX_ATTEMPTS} · حُفظ: {formatSafeDate(item.createdAt, 'dateTime')}</Text>{item.payload.message ? <Text style={styles.muted}>الرسالة: {item.payload.message}</Text> : null}{item.lastError ? <Text style={styles.errorText}>آخر خطأ: {item.lastError}</Text> : null}<Text style={styles.warning}>العرض لم يُرسل إلى الخادم بعد. قد يُرفض إذا أُغلق الطلب أو انتهت صلاحيته قبل المزامنة.</Text><View style={styles.actions}>{item.attempts >= OUTBOX_MAX_ATTEMPTS ? <Pressable accessibilityRole="button" disabled={busyId !== null} style={styles.secondary} onPress={() => {
                        setBusyId(item.id);
                        void retryRequestOffer(item.id, user?.id).then(async (ok) => {
                            if (!ok)
                                showToast('تعذرت إعادة المحاولة', 'حدّث القائمة ثم حاول مرة أخرى.', 'error');
                            else
                                await syncNextRequestOffer({
                                    isOnline: online, token: accessToken, csrfToken, ownerId: user?.id
                                });
                        }).catch(e => setError(e instanceof Error ? e.message : 'تعذرت إعادة المحاولة.')).finally(() => {
                            setBusyId(null);
                            void refresh();
                        });
                    }}><Text style={styles.secondaryText}>إعادة المحاولة</Text></Pressable> : null}<Pressable accessibilityRole="button" disabled={busyId !== null || item.state === 'processing'} style={styles.delete} onPress={() => confirmAlert('إلغاء العرض المحفوظ', 'سيُحذف من الجهاز ولن يُرسل لاحقًا. هل تريد المتابعة؟', [{
                            text: 'رجوع', style: 'cancel'
                        }, {
                            text: 'إلغاء العرض', style: 'destructive', onPress: () => {
                                setBusyId(item.id);
                                void discardRequestOffer(item.id, user?.id).then(ok => {
                                    if (!ok)
                                        showToast('لم يُلغَ العرض', 'قد تكون المزامنة بدأت؛ حدّث القائمة.', 'warning');
                                }).catch(e => setError(e instanceof Error ? e.message : 'تعذر إلغاء العرض.')).finally(() => {
                                    setBusyId(null);
                                    void refresh();
                                });
                            }
                        }])}><Text style={styles.deleteText}>{item.state === 'processing' ? 'قيد المعالجة' : 'إلغاء العرض'}</Text></Pressable></View></View>)}
        {orderItems.map((item) => <View key={`order-${item.id}`} style={styles.card}><Text style={styles.adTitle}>طلب شراء · {item.payload.items.length} منتج</Text><Text style={styles.status}>{item.attempts >= OUTBOX_MAX_ATTEMPTS ? 'توقفت المحاولات؛ يلزم تدخل' : item.state === 'processing' ? 'قيد المزامنة' : 'بانتظار المزامنة'}</Text><Text style={styles.muted}>المستلم: {item.payload.recipientName} · {item.payload.shippingCity}</Text><Text style={styles.muted}>المحاولات: {item.attempts}/{OUTBOX_MAX_ATTEMPTS} · حُفظ: {formatSafeDate(item.createdAt, 'dateTime')}</Text>{item.lastError ? <Text style={styles.errorText}>آخر خطأ: {item.lastError}</Text> : null}<Text style={styles.warning}>هذا الطلب محفوظ محليًا وليس مؤكدًا لدى المتجر. سيعيد الخادم التحقق من السعر والمخزون عند المزامنة.</Text><View style={styles.actions}>{item.attempts >= OUTBOX_MAX_ATTEMPTS ? <Pressable accessibilityRole="button" disabled={busyId !== null} style={styles.secondary} onPress={() => {
                        setBusyId(item.id);
                        void retryMarketplaceOrder(item.id, user?.id).then(async (ok) => {
                            if (!ok)
                                showToast('تعذرت إعادة المحاولة', 'حدّث القائمة ثم حاول مرة أخرى.', 'error');
                            else
                                await syncNextMarketplaceOrder({
                                    isOnline: online, token: accessToken, csrfToken, ownerId: user?.id
                                });
                        }).catch(e => setError(e instanceof Error ? e.message : 'تعذرت إعادة المحاولة.')).finally(() => {
                            setBusyId(null);
                            void refresh();
                        });
                    }}><Text style={styles.secondaryText}>إعادة المحاولة</Text></Pressable> : null}<Pressable accessibilityRole="button" disabled={busyId !== null || item.state === 'processing'} style={styles.delete} onPress={() => confirmAlert('إلغاء طلب الشراء المحفوظ', 'سيُحذف الطلب من الجهاز ولن يُرسل لاحقًا. هل تريد المتابعة؟', [{
                            text: 'رجوع', style: 'cancel'
                        }, {
                            text: 'إلغاء العملية', style: 'destructive', onPress: () => {
                                setBusyId(item.id);
                                void discardMarketplaceOrder(item.id, user?.id).then(ok => {
                                    if (!ok)
                                        showToast('لم يُلغَ الطلب', 'قد تكون المزامنة بدأت؛ حدّث القائمة.', 'warning');
                                }).catch(e => setError(e instanceof Error ? e.message : 'تعذر إلغاء الطلب.')).finally(() => {
                                    setBusyId(null);
                                    void refresh();
                                });
                            }
                        }])}><Text style={styles.deleteText}>{item.state === 'processing' ? 'قيد المعالجة' : 'إلغاء الطلب'}</Text></Pressable></View></View>)}
        {chatMessages.map((item) => <View key={`chat-message-${item.id}`} style={styles.card}><Text style={styles.adTitle}>رسالة دردشة محفوظة</Text><Text style={styles.status}>بانتظار الإرسال أو إعادة المحاولة</Text><Text style={styles.muted}>المحادثة: {item.conversationId.slice(-6)} · المحاولات: {item.attempts}/{OUTBOX_MAX_ATTEMPTS}</Text><Text style={styles.muted}>{item.body}</Text>{item.lastError ? <Text style={styles.errorText}>آخر خطأ: {item.lastError}</Text> : null}<Pressable accessibilityRole="button" style={styles.secondary} onPress={() => router.push({
                        pathname: '/messages/[id]', params: { id: item.conversationId }
                    })}><Text style={styles.secondaryText}>فتح المحادثة</Text></Pressable></View>)}
        {chatMedia.map((item) => <View key={`chat-media-${item.id}`} style={styles.card}><Text style={styles.adTitle}>مرفق دردشة محفوظ · {item.kind === 'image' ? 'صورة' : item.kind === 'audio' ? 'تسجيل صوتي' : 'ملف'}</Text><Text style={styles.status}>بانتظار المزامنة</Text><Text style={styles.muted}>{item.fileName} · {Math.ceil(item.sizeBytes / 1024)} كيلوبايت · المحاولات: {item.attempts}/{OUTBOX_MAX_ATTEMPTS}</Text>{item.lastError ? <Text style={styles.errorText}>آخر خطأ: {item.lastError}</Text> : null}<Pressable accessibilityRole="button" style={styles.secondary} onPress={() => router.push({
                        pathname: '/messages/[id]', params: { id: item.conversationId }
                    })}><Text style={styles.secondaryText}>فتح المحادثة</Text></Pressable></View>)}
        {createItems.map((item) => {
                        const label = item.operation === 'create-product' ? 'إضافة منتج' : item.operation === 'create-service' ? 'نشر خدمة' : 'تسجيل بيع';
                        const title = String(item.payload.name || item.payload.title || item.payload.entityTitle || label);
                        return <View key={`create-${item.id}`} style={styles.card}><Text style={styles.adTitle}>{label}: {title}</Text><Text style={styles.status}>{item.state === 'failed' ? 'فشلت نهائيًا؛ راجع الخطأ وأعد المحاولة عند التصحيح' : item.state === 'processing' ? 'قيد المزامنة' : item.attempts >= OUTBOX_MAX_ATTEMPTS ? 'توقفت المحاولات؛ يلزم تدخل' : 'بانتظار المزامنة'}</Text><Text style={styles.muted}>المحاولات: {item.attempts}/{OUTBOX_MAX_ATTEMPTS} · حُفظ: {formatSafeDate(item.createdAt, 'dateTime')}</Text>{item.lastError ? <Text style={styles.errorText}>آخر خطأ: {item.lastError}</Text> : null}<Text style={styles.warning}>لم يؤكد الخادم إنشاء هذا السجل بعد. قد يرفضه إذا تغيرت الصلاحيات أو التصنيفات أو البيانات قبل المزامنة.</Text><View style={styles.actions}>{(item.state === 'failed' || item.attempts >= OUTBOX_MAX_ATTEMPTS) ? <Pressable accessibilityRole="button" disabled={busyId !== null} style={styles.secondary} onPress={() => {
                            setBusyId(item.id);
                            void retryOfflineCreate(item.id, user?.id).then(async (ok) => {
                                if (!ok)
                                    showToast('تعذرت إعادة المحاولة', 'حدّث القائمة ثم حاول مرة أخرى.', 'error');
                                else
                                    await syncNextOfflineCreate({
                                        isOnline: online, token: accessToken, csrfToken, ownerId: user?.id
                                    });
                            }).catch(e => setError(e instanceof Error ? e.message : 'تعذرت إعادة المحاولة.')).finally(() => {
                                setBusyId(null);
                                void refresh();
                            });
                        }}><Text style={styles.secondaryText}>إعادة المحاولة</Text></Pressable> : null}<Pressable accessibilityRole="button" disabled={busyId !== null || item.state === 'processing'} style={styles.delete} onPress={() => confirmAlert('إلغاء الإضافة المحفوظة', 'ستُحذف من الجهاز ولن تُرسل إلى الخادم. هل تريد المتابعة؟', [{
                                text: 'رجوع', style: 'cancel'
                            }, {
                                text: 'إلغاء الإضافة', style: 'destructive', onPress: () => {
                                    setBusyId(item.id);
                                    void discardOfflineCreate(item.id, user?.id).then(ok => {
                                        if (!ok)
                                            showToast('لم تُلغَ الإضافة', 'قد تكون قيد المعالجة؛ حدّث القائمة.', 'warning');
                                    }).catch(e => setError(e instanceof Error ? e.message : 'تعذر الإلغاء.')).finally(() => {
                                        setBusyId(null);
                                        void refresh();
                                    });
                                }
                            }])}><Text style={styles.deleteText}>{item.state === 'processing' ? 'قيد المعالجة' : 'إلغاء الإضافة'}</Text></Pressable></View></View>;
                    })}
        {items.length === 0 && favoriteItems.length === 0 && requestItems.length === 0 && offerItems.length === 0 && orderItems.length === 0 && createItems.length === 0 && chatMessages.length === 0 && chatMedia.length === 0 ? <EmptyState title="لا توجد عمليات معلّقة" description="ستظهر هنا العمليات التي تحتاج إلى المزامنة أو التدخل."/> : items.map((item) => {
                            const exhausted = item.state === 'failed' && item.attempts >= OUTBOX_MAX_ATTEMPTS;
                            const canDiscard = item.state !== 'processing';
                            const isHead = headId === item.id;
                            const canRetry = exhausted && isHead && (item.operation === 'create-ad' || item.operation === 'delete-ad' || item.operation === 'update-ad');
                            return <View key={item.id} style={styles.card}>
            <Text style={styles.adTitle}>{titleFromPayload(item) || operationLabel(item.operation)}</Text>
            <Text style={styles.status}>{stateLabel(item)}</Text>
            <Text style={styles.muted}>النوع: {operationLabel(item.operation)} · المحاولات: {item.attempts}/{OUTBOX_MAX_ATTEMPTS}</Text>
            <Text style={styles.muted}>وقت الحفظ: {formatSafeDate(item.createdAt, 'dateTime')}</Text>
            {item.lastError ? <Text style={styles.errorText}>آخر خطأ: {item.lastError}</Text> : null}
            {item.nextAttemptAt > Date.now() && item.state === 'failed' && item.attempts < OUTBOX_MAX_ATTEMPTS ? <Text style={styles.muted}>المحاولة التالية بعد: {formatSafeDate(item.nextAttemptAt, 'dateTime')}</Text> : null}
            {item.operation === 'update-ad' && (() => {
                                try {
                                    const payload = JSON.parse(item.payloadJson);
                                    return Array.isArray(payload?.images) && payload.images.length > 0;
                                }
                                catch {
                                    return true;
                                }
                            })() ? <Text style={styles.warning}>يتضمن هذا التعديل صورًا محفوظة محليًا وسيُعاد رفعها عند المزامنة، إذا فشل رفع الصور فستُعاد محاولة هذا العنصر قبل العمليات الأحدث؛ لا تحذف المسودة حتى تتأكد من نجاح المزامنة.</Text> : null}
            {exhausted && !isHead ? <Text style={styles.warning}>لا يمكن إعادة هذه العملية الآن لأن هناك عملية أقدم تسبقها في الطابور.</Text> : null}
            {exhausted && isHead && item.operation === 'update-ad' ? <Text style={styles.warning}>تعذرت المزامنة بعد عدة محاولات. تحقق من بيانات التعديل والاتصال ثم حاول مرة أخرى.</Text> : null}
            <View style={styles.actions}>
              {canRetry ? <Pressable accessibilityRole="button" disabled={busyId !== null} style={styles.secondary} onPress={() => void retry(item)}><Text style={styles.secondaryText}>{busyId === item.id ? 'جارٍ…' : 'إعادة المحاولة'}</Text></Pressable> : null}
              <Pressable accessibilityRole="button" disabled={!canDiscard || busyId !== null} style={[styles.delete, (!canDiscard || busyId !== null) && styles.disabled]} onPress={() => discard(item)}><Text style={styles.deleteText}>{busyId === item.id ? 'جارٍ…' : canDiscard ? 'إلغاء العملية' : 'قيد المعالجة'}</Text></Pressable>
            </View>
          </View>;
                        })}
      </ScrollView>}
  </PageShell>;
}
const createThemeStyles = (colors: ColorPalette) => StyleSheet.create({
    link: {
        color: colors.brand, fontWeight: fontWeights.bold, padding: spacing.sm
    }, notice: {
        padding: spacing.md, backgroundColor: colors.warningSoft, borderBottomWidth: 1, borderBottomColor: colors.warningBorder
    }, noticeText: {
        color: colors.warningText, fontSize: fontSizes[12], lineHeight: 19, textAlign: 'right'
    }, list: {
        gap: spacing.lg, paddingBottom: spacing.xxxl
    }, summary: {
        fontSize: fontSizes[13], fontWeight: fontWeights.bold, color: colors.ink, textAlign: 'right'
    }, card: {
        padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm
    }, adTitle: {
        fontSize: fontSizes[16], fontWeight: fontWeights.bold, color: colors.ink, textAlign: 'right'
    }, status: {
        fontSize: fontSizes[13], fontWeight: fontWeights.bold, color: colors.brand, textAlign: 'right'
    }, muted: {
        fontSize: fontSizes[12], color: colors.muted, textAlign: 'right', lineHeight: 19
    }, errorText: {
        fontSize: fontSizes[12], color: colors.danger, textAlign: 'right', lineHeight: 19
    }, warning: {
        fontSize: fontSizes[12], color: colors.warningText, backgroundColor: colors.warningSoft, padding: spacing.sm, borderRadius: radius.sm, textAlign: 'right', lineHeight: 19
    }, error: {
        fontSize: fontSizes[13], color: colors.danger, backgroundColor: colors.dangerSoft, padding: spacing.md, borderRadius: radius.sm, textAlign: 'right'
    }, actions: {
        flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs
    }, secondary: {
        borderWidth: 1, borderColor: colors.brand, borderRadius: radius.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md
    }, secondaryText: {
        color: colors.brand, fontWeight: fontWeights.bold
    }, delete: {
        backgroundColor: colors.dangerSoft, borderRadius: radius.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md
    }, deleteText: {
        color: colors.danger, fontWeight: fontWeights.bold
    }, disabled: { opacity: .45 },
});
