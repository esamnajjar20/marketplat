import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { formatDate, formatMoney } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useRef, useState , useMemo} from 'react';
import { FlatList, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyServiceProvider } from '@/features/services/providers.api';
import { EmptyState, ErrorState, LoadingState, Notice, PageShell } from '@/components/ui';
import { createServiceRequest, fetchServiceRequests, type ServiceRequest } from '@/features/services/services.api';
import { fontSizes, radius, spacing } from '@/theme/tokens';
import { showToast } from '@/lib/toast';
import { marketListPerf } from '@/lib/listPerformance';

const statusLabels: Record<string, string> = { PENDING: 'بانتظار الرد', ACCEPTED: 'مقبول', REJECTED: 'مرفوض', IN_PROGRESS: 'قيد التنفيذ', COMPLETED: 'مكتمل', CANCELLED: 'ملغي', EXPIRED: 'منتهي', DISPUTED: 'قيد المراجعة' };

export default function ServiceRequestsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);

  const params = useLocalSearchParams<{ listingId?: string | string[]; listingTitle?: string | string[] }>();
  const listingId = Array.isArray(params.listingId) ? params.listingId[0] : params.listingId;
  const listingTitle = Array.isArray(params.listingTitle) ? params.listingTitle[0] : params.listingTitle;
  const { user, accessToken, csrfToken, isRestoring } = useAuth();
  const [incoming, setIncoming] = useState(false);
  const [items, setItems] = useState<ServiceRequest[]>([]);
  const [itemsOwnerId, setItemsOwnerId] = useState<string | null>(user?.id ?? null);
  const [canReceiveIncoming, setCanReceiveIncoming] = useState(false);
  const [checkingProvider, setCheckingProvider] = useState(false);
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const accountIdRef = useRef<string | null>(null);
  const activeRequestRef = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);

  const load = useCallback(async (reset = true, forceInitial = false) => {
    if (isRestoring) return;
    if (!accessToken || !user) {
      activeRequestRef.current?.abort();
      requestSequence.current += 1;
      setItems([]);
      setItemsOwnerId(null);
      setPage(1);
      setTotalPages(1);
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      setError(null);
      setLoadMoreError(null);
      return;
    }
    if (reset) {
      loadingMoreRef.current = false;
      activeRequestRef.current?.abort();
      setLoading(forceInitial || items.length === 0);
      setRefreshing(!forceInitial && items.length > 0);
      setLoadingMore(false);
      setError(null);
      setLoadMoreError(null);
    } else {
      if (loadingMoreRef.current || loading || page >= totalPages) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
      setLoadMoreError(null);
    }

    const sequence = ++requestSequence.current;
    const controller = new AbortController();
    activeRequestRef.current = controller;
    const requestedPage = reset ? 1 : page + 1;
    try {
      const result = await fetchServiceRequests(accessToken, incoming, requestedPage, 30, controller.signal);
      if (sequence === requestSequence.current && !controller.signal.aborted) {
        setItemsOwnerId(user.id);
        setItems((old) => {
          if (reset) return result.items;
          const ids = new Set(old.map((item) => item.id));
          return [...old, ...result.items.filter((item) => !ids.has(item.id))];
        });
        setPage(result.page);
        setTotalPages(result.totalPages);
        if (reset) setError(null);
      }
    } catch (e) {
      if (sequence === requestSequence.current && !controller.signal.aborted) {
        const message = e instanceof Error ? e.message : 'تعذر تحميل الطلبات.';
        if (reset) setError(message);
        else setLoadMoreError(message);
      }
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
        loadingMoreRef.current = false;
        if (activeRequestRef.current === controller) activeRequestRef.current = null;
      }
    }
  }, [accessToken, incoming, isRestoring, items.length, loading, page, totalPages, user]);

  // Keep the latest loader without making pagination/loading state reset the effect.
  const loadRef = useRef(load);
  loadRef.current = load;

  // Reload only when the signed-in account or the selected request view changes.
  useEffect(() => {
    if (isRestoring) return undefined;
    const nextAccountId = user?.id ?? null;
    const accountChanged = accountIdRef.current !== nextAccountId;
    if (accountChanged) {
      accountIdRef.current = nextAccountId;
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
      requestSequence.current += 1;
      loadingMoreRef.current = false;
      setItems([]);
      setItemsOwnerId(nextAccountId);
      setPage(1);
      setTotalPages(1);
      setLoading(true);
      setRefreshing(false);
      setLoadingMore(false);
      setError(null);
      setLoadMoreError(null);
    }
    void loadRef.current(true, accountChanged);
    return () => {
      requestSequence.current += 1;
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
      loadingMoreRef.current = false;
    };
  }, [accessToken, incoming, isRestoring, user?.id]); // Auth and view mode are the intended reset boundaries.

  useEffect(() => {
    let active = true;
    if (isRestoring) return undefined;
    if (!accessToken) { setCanReceiveIncoming(false); setCheckingProvider(false); return undefined; }
    setCanReceiveIncoming(false);
    setCheckingProvider(true);
    void fetchMyServiceProvider(accessToken)
      .then((provider) => { if (active) setCanReceiveIncoming(Boolean(provider)); })
      .catch(() => { if (active) setCanReceiveIncoming(false); })
      .finally(() => { if (active) setCheckingProvider(false); });
    return () => { active = false; };
  }, [accessToken, isRestoring, user?.id]);

  useEffect(() => { if (incoming && !checkingProvider && !canReceiveIncoming) setIncoming(false); }, [incoming, checkingProvider, canReceiveIncoming]);

  const changeIncoming = (next: boolean) => {
    if (next === incoming) return;
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    requestSequence.current += 1;
    loadingMoreRef.current = false;
    setIncoming(next);
    setItems([]);
    setPage(1);
    setTotalPages(1);
    setLoading(true);
    setRefreshing(false);
    setLoadingMore(false);
    setError(null);
    setLoadMoreError(null);
  };

  const submit = async () => {
    if (!listingId || !accessToken || saving) return;
    if (details.trim().length < 10) { showToast('تفاصيل الطلب', 'اكتب 10 أحرف على الأقل لتوضيح احتياجك.', 'info'); return; }
    setSaving(true);
    try {
      await createServiceRequest(listingId, details, accessToken, csrfToken);
      setDetails('');
      showToast('تم إرسال الطلب', 'أُرسل طلبك إلى مقدم الخدمة. يمكنك متابعة حالته من هذه الصفحة.', 'success');
      router.setParams({ listingId: undefined, listingTitle: undefined });
      await load(true);
    } catch (e) { showToast('تعذر إرسال الطلب', e instanceof Error ? e.message : 'لم يتم تأكيد إرسال الطلب. حاول مجددًا.', 'error'); }
    finally { setSaving(false); }
  };

  const needsLogin = !isRestoring && (!accessToken || !user);
  const accountMismatch = itemsOwnerId !== (user?.id ?? null);
  const visibleItems = accountMismatch ? [] : items;
  const visibleError = accountMismatch ? null : error;
  const visibleLoadMoreError = accountMismatch ? null : loadMoreError;
  const initialLoading = isRestoring || accountMismatch || (loading && visibleItems.length === 0);

  return (
    <PageShell title="طلبات الخدمات" scroll={false}>
        <FlatList
          data={initialLoading || needsLogin || (visibleError && visibleItems.length === 0) ? [] : visibleItems}
          keyExtractor={(item) => item.id}
          {...marketListPerf}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.brand} />}
          ListHeaderComponent={(
            <View style={{ gap: spacing.lg }}>
              {listingId ? <View style={styles.form}>
                <Text style={styles.formTitle}>طلب خدمة جديدة</Text>
                <Text style={styles.formSubtitle} numberOfLines={2}>{listingTitle || 'الخدمة المحددة'}</Text>
                <Text style={styles.label}>اشرح احتياجك</Text>
                <TextInput allowFontScaling maxFontSizeMultiplier={1.3} accessibilityLabel="تفاصيل طلب الخدمة" value={details} onChangeText={setDetails} multiline maxLength={1000} placeholder="اكتب التفاصيل المهمة لمقدم الخدمة…" placeholderTextColor={colors.muted} textAlign="right" textAlignVertical="top" style={styles.textarea}/>
                <Text style={styles.hint}>{details.trim().length}/1000 · الحد الأدنى 10 أحرف</Text>
                {accessToken ? <Pressable accessibilityRole="button" disabled={saving || details.trim().length < 10} onPress={() => void submit()} style={[styles.primary, (saving || details.trim().length < 10) && styles.disabled]}><Text style={styles.primaryText}>{saving ? 'جارٍ الإرسال…' : 'إرسال الطلب'}</Text></Pressable> : <><Notice>سجّل الدخول لإرسال طلب الخدمة وحفظه في حسابك.</Notice><Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/login', params: { redirect: `/service-requests?listingId=${encodeURIComponent(listingId)}&listingTitle=${encodeURIComponent(listingTitle || '')}` } })} style={styles.primary}><Text style={styles.primaryText}>تسجيل الدخول</Text></Pressable></>}
              </View> : undefined}
              {needsLogin && !listingId ? <EmptyState title="سجّل الدخول لمتابعة طلبات الخدمات" description="يمكنك إرسال طلباتك ومتابعة ردود مقدمي الخدمات بعد تسجيل الدخول." actionLabel="تسجيل الدخول" onAction={() => router.push('/login')} /> : undefined}
              {isRestoring || loading ? <LoadingState message="جاري تحميل الطلبات…" /> : undefined}
              {user && (canReceiveIncoming || checkingProvider) ? <View style={styles.switchRow}>
                <Pressable accessibilityRole="button" accessibilityState={{ selected: !incoming }} onPress={() => changeIncoming(false)} style={[styles.switchChip, !incoming && styles.switchChipActive]}><Text style={[styles.switchText, !incoming && styles.switchTextActive]}>طلباتي</Text></Pressable>
                {canReceiveIncoming ? <Pressable accessibilityRole="button" accessibilityState={{ selected: incoming }} onPress={() => changeIncoming(true)} style={[styles.switchChip, incoming && styles.switchChipActive]}><Text style={[styles.switchText, incoming && styles.switchTextActive]}>الطلبات الواردة</Text></Pressable> : checkingProvider ? <Text style={styles.hint}>جارٍ التحقق من صلاحية استقبال الطلبات…</Text> : undefined}
              </View> : undefined}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{incoming ? 'طلبات العملاء الواردة' : user ? 'طلباتي السابقة' : 'طلبات الخدمات'}</Text>
                {accessToken ? <Pressable accessibilityRole="button" accessibilityLabel="تحديث طلبات الخدمات" onPress={() => void load(true)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={styles.link}>تحديث</Text></Pressable> : undefined}
              </View>
              {visibleError && visibleItems.length > 0 ? <Notice>{visibleError}</Notice> : undefined}
              {visibleError && visibleItems.length === 0 && !needsLogin ? <ErrorState description={visibleError} onAction={() => void load(true)} /> : undefined}
            </View>
          )}
          ListEmptyComponent={!initialLoading && !needsLogin && !visibleError ? <EmptyState title="لا توجد طلبات بعد" description="عندما تطلب خدمة، ستظهر حالة الطلب ورد مقدم الخدمة هنا." /> : undefined}
          renderItem={({ item }) => <View style={styles.requestCard}>
            <View style={styles.requestHeader}>
              <Pressable accessibilityRole="button" accessibilityLabel={`عرض تفاصيل طلب ${item.listing?.title || 'خدمة'}`} onPress={() => router.push({ pathname: '/service-requests/[id]', params: { id: item.id } })} style={{ flex: 1 }}><Text style={styles.requestTitle} numberOfLines={2}>{item.listing?.title || 'طلب خدمة'}</Text></Pressable>
              <Text style={[styles.status, item.status === 'COMPLETED' ? styles.statusSuccess : null]}>{statusLabels[item.status || ''] || item.status || 'قيد المتابعة'}</Text>
            </View>
            <Text style={styles.details} numberOfLines={3}>{item.details || 'لا توجد تفاصيل إضافية.'}</Text>
            <Text style={styles.meta}>{item.createdAt ? formatDate(item.createdAt, 'date') : ''}{item.quotedPrice != null ? ` · السعر المقترح ${formatMoney(item.quotedPrice)}` : ''}</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/service-requests/[id]', params: { id: item.id } })} style={styles.acceptButton}><Text style={styles.acceptText}>عرض تفاصيل الطلب</Text></Pressable>
            {item.customerId === user?.id && ['ACCEPTED','IN_PROGRESS'].includes(item.status || '') ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/appointment-create', params: { requestId: item.id } })} style={styles.acceptButton}><Text style={styles.acceptText}>حجز موعد</Text></Pressable> : undefined}
          </View>}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          ListFooterComponent={initialLoading ? undefined : visibleLoadMoreError ? <View style={{ gap: spacing.sm }}><Notice>{visibleLoadMoreError}</Notice><Pressable accessibilityRole="button" disabled={loadingMore} onPress={() => void load(false)} style={[styles.primary, loadingMore && styles.disabled]}><Text style={styles.primaryText}>{loadingMore ? 'جارٍ التحميل…' : 'إعادة محاولة تحميل المزيد'}</Text></Pressable></View> : page < totalPages ? <Pressable accessibilityRole="button" disabled={loadingMore} onPress={() => void load(false)} style={[styles.primary, loadingMore && styles.disabled]}><Text style={styles.primaryText}>{loadingMore ? 'جارٍ تحميل المزيد…' : 'تحميل المزيد من الطلبات'}</Text></Pressable> : undefined}
        />
    </PageShell>
  );
}

const createThemeStyles = (colors: ColorPalette) => StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: spacing.xl },
  form: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  formTitle: { color: colors.ink, fontSize: fontSizes[18], fontWeight: '700', textAlign: 'right' },
  formSubtitle: { color: colors.brand, fontSize: fontSizes[13], textAlign: 'right' },
  label: { color: colors.ink, fontSize: fontSizes[14], fontWeight: '700', textAlign: 'right' },
  textarea: { minHeight: 120, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, color: colors.ink, fontSize: fontSizes[14], lineHeight: 22, writingDirection: 'rtl' },
  hint: { color: colors.muted, fontSize: fontSizes[11], textAlign: 'right' },
  primary: { backgroundColor: colors.brand, borderRadius: radius.md, minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  primaryText: { color: colors.onBrand, fontSize: fontSizes[14], fontWeight: '700' },
  disabled: { opacity: 0.6 },
  switchRow: { flexDirection: 'row', backgroundColor: colors.border, padding: 4, borderRadius: radius.md, gap: 4 },
  switchChip: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: 10 },
  switchChipActive: { backgroundColor: colors.surface },
  switchText: { color: colors.muted, fontSize: fontSizes[13], fontWeight: '700' },
  switchTextActive: { color: colors.brand },
  acceptButton: { backgroundColor: colors.brand, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md, minHeight: 44, justifyContent: 'center' },
  acceptText: { color: colors.onBrand, fontSize: fontSizes[12], fontWeight: '700' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.ink, fontSize: fontSizes[18], fontWeight: '700' },
  link: { color: colors.brand, fontWeight: '700' },
  requestCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  requestHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  requestTitle: { flex: 1, color: colors.ink, fontSize: fontSizes[16], fontWeight: '700', textAlign: 'right' },
  status: { color: colors.brandOnSoft, backgroundColor: colors.brandSoft, overflow: 'hidden', borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 5, fontSize: fontSizes[11], fontWeight: '700' },
  statusSuccess: { color: colors.brandOnSoft, backgroundColor: colors.successSoft },
  details: { color: colors.ink, fontSize: fontSizes[13], lineHeight: 21, textAlign: 'right' },
  meta: { color: colors.muted, fontSize: fontSizes[11], textAlign: 'right' },
});
