import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchServiceRequest, respondToServiceRequest, type ServiceRequest } from '@/features/services/services.api';
import { MediaGallery } from '@/components/ui/MediaGallery';
import { ServiceRequestTimeline } from '@/components/ui/ServiceRequestTimeline';
import { colors, radius, spacing, typography } from '@/theme/tokens';

const STATUS: Record<string, string> = { PENDING: 'بانتظار الرد', ACCEPTED: 'مقبول', REJECTED: 'مرفوض', IN_PROGRESS: 'قيد التنفيذ', COMPLETED: 'مكتمل', CANCELLED: 'ملغي', EXPIRED: 'منتهي', DISPUTED: 'قيد المراجعة' };
const money = (v?: string | number | null) => v == null || v === '' ? 'غير محدد' : Number.isFinite(Number(v)) ? `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(Number(v))} ₪` : String(v);
const dateTime = (v?: string | null) => { if (!v) return null; const d = new Date(v); return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(d) : null; };
type Action = 'ACCEPTED' | 'REJECTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED';

export default function ServiceRequestDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { user, accessToken, csrfToken } = useAuth();
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<Action | ''>('');
  const [quote, setQuote] = useState('');
  const [disputeReason, setDisputeReason] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (!id) { setError('معرّف طلب الخدمة غير صالح.'); setLoading(false); return; }
    if (!accessToken) { setError('سجّل الدخول لعرض تفاصيل طلب الخدمة.'); setLoading(false); return; }
    refresh ? setRefreshing(true) : setLoading(true); setError('');
    try { const data = await fetchServiceRequest(id, accessToken); setRequest(data); setQuote(data.quotedPrice == null ? '' : String(data.quotedPrice)); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل تفاصيل الطلب.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [accessToken, id]);
  useEffect(() => { void load(); }, [load]);

  const role = useMemo(() => {
    const providerUserId = request?.listing?.provider?.sellerProfile?.userId ?? request?.provider?.sellerProfile?.userId;
    return { customer: !!user?.id && request?.customerId === user.id, provider: !!user?.id && providerUserId === user.id };
  }, [request, user?.id]);
  const needsQuote = request?.listing?.serviceType?.capabilities?.requestQuote === true;
  const status = request?.status || 'PENDING';

  const runAction = async (action: Action) => {
    if (!request || !accessToken || busy) return;
    const extra: { quotedPrice?: number; agreedPrice?: number; disputeReason?: string } = {};
    if (action === 'ACCEPTED' && role.provider && needsQuote) {
      const value = Number(quote);
      if (!quote.trim() || !Number.isFinite(value) || value <= 0) { Alert.alert('السعر المقترح مطلوب', 'أدخل سعرًا صحيحًا أكبر من صفر.'); return; }
      extra.quotedPrice = Math.round(value * 100) / 100;
    }
    if (action === 'IN_PROGRESS' && role.customer && needsQuote) {
      const value = Number(request.quotedPrice);
      if (!Number.isFinite(value) || value <= 0) { Alert.alert('لا يوجد سعر مقترح', 'اطلب من مقدم الخدمة تحديد السعر أولًا.'); return; }
      extra.agreedPrice = value;
    }
    if (action === 'DISPUTED') {
      if (disputeReason.trim().length < 10) { Alert.alert('سبب الاعتراض', 'اكتب 10 أحرف على الأقل.'); return; }
      extra.disputeReason = disputeReason.trim();
    }
    setBusy(action);
    try {
      await respondToServiceRequest(request.id, action, accessToken, csrfToken, extra);
      setDisputeReason('');
      await load(true);
      Alert.alert('تم تحديث الطلب', 'تم حفظ حالة طلب الخدمة.');
    } catch (e) { Alert.alert('تعذر تحديث الطلب', e instanceof Error ? e.message : 'لم يؤكد الخادم تنفيذ الإجراء.'); }
    finally { setBusy(''); }
  };

  const actionButton = (label: string, action: Action, tone: 'primary' | 'secondary' | 'danger' = 'primary', confirmation?: string) => <Pressable key={action} accessibilityRole="button" disabled={!!busy} onPress={() => Alert.alert(label, confirmation || `هل تريد تنفيذ «${label}»؟`, [{ text: 'إلغاء', style: 'cancel' }, { text: 'متابعة', style: tone === 'danger' ? 'destructive' : 'default', onPress: () => void runAction(action) }])} style={[s.action, tone === 'secondary' && s.secondary, tone === 'danger' && s.danger, busy && s.disabled]}><Text style={[s.actionText, tone === 'secondary' && s.secondaryText, tone === 'danger' && s.dangerText]}>{busy === action ? 'جارٍ التحديث…' : label}</Text></Pressable>;

  return <SafeAreaView style={s.safe} edges={['top'] as const}>
    <View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} style={s.back}><Text style={s.backText}>→</Text></Pressable><Text style={s.headerTitle}>تفاصيل طلب الخدمة</Text><Pressable accessibilityRole="button" onPress={() => void load(true)} style={s.refresh}><Text style={s.refreshText}>{refreshing ? '…' : 'تحديث'}</Text></Pressable></View>
    {loading ? <View style={s.state}><Text style={s.muted}>جارٍ تحميل تفاصيل الطلب…</Text></View> : error ? <View style={s.state}><Text style={s.error}>{error}</Text><Pressable style={s.action} onPress={() => !accessToken ? router.push('/login') : void load()}><Text style={s.actionText}>{accessToken ? 'إعادة المحاولة' : 'تسجيل الدخول'}</Text></Pressable></View> : request ? <ScrollView contentContainerStyle={s.content}>
      <View style={s.card}>
        <View style={s.titleRow}><Text style={s.title}>{request.listing?.title || 'طلب خدمة'}</Text><Text style={s.status}>{STATUS[status] || status}</Text></View>
        <Text style={s.label}>تفاصيل الطلب كاملة</Text><Text style={s.body}>{request.details?.trim() || 'لم تُسجل تفاصيل إضافية لهذا الطلب.'}</Text>
        <View style={s.metaGroup}><Text style={s.meta}>تاريخ الإرسال: {dateTime(request.createdAt) || 'غير متوفر'}</Text><Text style={s.meta}>السعر في الخدمة: {money(request.listing?.price)}</Text>{request.quotedPrice != null ? <Text style={s.meta}>السعر المقترح: {money(request.quotedPrice)}</Text> : null}{request.agreedPrice != null ? <Text style={s.meta}>السعر المتفق عليه: {money(request.agreedPrice)}</Text> : null}{request.listing?.durationEstimate ? <Text style={s.meta}>المدة المتوقعة: {request.listing.durationEstimate}</Text> : null}</View>
        {request.listing?.description ? <><Text style={s.label}>وصف الخدمة</Text><Text style={s.body}>{request.listing.description}</Text></> : null}
        <Text style={s.meta}>العميل: {request.customer?.displayName || request.customer?.name || 'مستخدم'}</Text><Text style={s.meta}>مقدم الخدمة: {request.listing?.provider?.businessName || request.provider?.businessName || 'مقدم خدمة'}</Text>
      </View>
      {request.attachedImages?.length ? <View style={s.card}><Text style={s.sectionTitle}>صور مرفقة بالطلب</Text><MediaGallery images={request.attachedImages} title="صور طلب الخدمة" /></View> : null}
      {request.listing?.images?.length ? <View style={s.card}><Text style={s.sectionTitle}>صور الخدمة</Text><MediaGallery images={request.listing.images} title={request.listing.title || 'صور الخدمة'} /></View> : null}
      {request.appointment ? <View style={s.card}><Text style={s.sectionTitle}>الموعد</Text><Text style={s.meta}>من: {dateTime(request.appointment.scheduledStart) || 'غير محدد'}</Text><Text style={s.meta}>إلى: {dateTime(request.appointment.scheduledEnd) || 'غير محدد'}</Text><Text style={s.meta}>الحالة: {request.appointment.status || 'غير محددة'}</Text>{request.appointment.notes ? <Text style={s.body}>{request.appointment.notes}</Text> : null}</View> : null}
      <View style={s.card}><ServiceRequestTimeline status={status} createdAt={request.createdAt} respondedAt={request.respondedAt} /></View>
      {role.provider && status === 'PENDING' && needsQuote ? <View style={s.card}><Text style={s.sectionTitle}>السعر المقترح</Text><TextInput accessibilityLabel="السعر المقترح بالشيكل" value={quote} onChangeText={setQuote} keyboardType="decimal-pad" placeholder="أدخل السعر بالشيكل" placeholderTextColor={colors.muted} style={s.input} /></View> : null}
      {(role.customer || role.provider) && ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].includes(status) ? <View style={s.card}><Text style={s.sectionTitle}>إجراءات الطلب</Text><View style={s.actions}>
        {role.provider && status === 'PENDING' ? <>{actionButton('قبول الطلب', 'ACCEPTED', 'primary', needsQuote ? 'سيُرسل السعر المقترح للعميل للموافقة.' : 'هل تريد قبول طلب الخدمة؟')}{actionButton('رفض الطلب', 'REJECTED', 'danger', 'سيتم رفض الطلب ولن يمكن متابعة تنفيذه.')}</> : null}
        {role.customer && status === 'PENDING' ? actionButton('إلغاء الطلب', 'CANCELLED', 'danger') : null}
        {role.provider && status === 'ACCEPTED' && !needsQuote ? actionButton('بدء التنفيذ', 'IN_PROGRESS') : null}
        {role.customer && status === 'ACCEPTED' && needsQuote ? actionButton('الموافقة على السعر وبدء التنفيذ', 'IN_PROGRESS', 'primary', `هل توافق على السعر المقترح ${money(request.quotedPrice)}؟`) : null}
        {(role.customer || role.provider) && ['ACCEPTED', 'IN_PROGRESS'].includes(status) ? actionButton('إلغاء الطلب', 'CANCELLED', 'danger') : null}
        {role.provider && status === 'IN_PROGRESS' ? actionButton('تأكيد اكتمال الخدمة', 'COMPLETED') : null}
        {role.customer && ['IN_PROGRESS', 'COMPLETED'].includes(status) ? <View style={s.dispute}><Text style={s.label}>سبب الاعتراض (10 أحرف على الأقل)</Text><TextInput accessibilityLabel="سبب الاعتراض على الخدمة" value={disputeReason} onChangeText={setDisputeReason} multiline maxLength={1000} placeholder="اشرح سبب الاعتراض…" placeholderTextColor={colors.muted} style={[s.input, s.multiline]} textAlign="right"/><View>{actionButton('فتح اعتراض', 'DISPUTED', 'danger', 'سيتم تحويل الطلب إلى حالة المراجعة.')}</View></View> : null}
        {role.customer && ['ACCEPTED', 'IN_PROGRESS'].includes(status) ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/appointment-create', params: { requestId: request.id } })} style={[s.action, s.secondary]}><Text style={s.secondaryText}>{request.appointment ? 'إدارة الموعد' : 'حجز موعد'}</Text></Pressable> : null}
      </View></View> : null}
      {!role.customer && !role.provider ? <View style={s.card}><Text style={s.muted}>لا تظهر إجراءات تعديل هذا الطلب لهذا الحساب.</Text></View> : null}
      {request.disputeReason ? <View style={s.card}><Text style={s.sectionTitle}>سبب الاعتراض</Text><Text style={s.body}>{request.disputeReason}</Text></View> : null}
    </ScrollView> : null}
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.control, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, backText: { fontSize: 24, color: colors.brand }, headerTitle: { color: colors.ink, fontWeight: '900', fontSize: 17 }, refresh: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, refreshText: { color: colors.brand, fontWeight: '800' },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 }, card: { padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, backgroundColor: colors.surface },
  titleRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm, flexWrap: 'wrap' }, title: { flex: 1, color: colors.ink, fontSize: 19, lineHeight: 27, fontWeight: '900', textAlign: 'right' }, status: { color: colors.brand, backgroundColor: colors.brandSoft, borderRadius: radius.pill, overflow: 'hidden', paddingHorizontal: spacing.md, paddingVertical: 6, fontSize: 12, fontWeight: '800' },
  sectionTitle: { ...typography.subtitle, color: colors.ink, textAlign: 'right' }, label: { ...typography.captionStrong, color: colors.muted, textAlign: 'right' }, body: { ...typography.body, color: colors.ink, textAlign: 'right', lineHeight: 25 }, metaGroup: { gap: spacing.xs, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border }, meta: { ...typography.caption, color: colors.muted, textAlign: 'right' },
  actions: { gap: spacing.sm }, action: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.control, backgroundColor: colors.brand }, actionText: { color: colors.white, fontWeight: '900', textAlign: 'center' }, secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.brand }, secondaryText: { color: colors.brand, fontWeight: '900', textAlign: 'center' }, danger: { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.dangerBorder }, dangerText: { color: colors.danger, fontWeight: '900', textAlign: 'center' }, disabled: { opacity: 0.55 }, input: { minHeight: 52, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radius.control, paddingHorizontal: spacing.md, color: colors.ink, textAlign: 'right', backgroundColor: colors.canvas }, multiline: { minHeight: 92, padding: spacing.md, textAlignVertical: 'top', writingDirection: 'rtl' }, dispute: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }, state: { margin: spacing.lg, padding: spacing.xl, alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, backgroundColor: colors.surface }, muted: { color: colors.muted, textAlign: 'right', lineHeight: 22 }, error: { color: colors.danger, textAlign: 'right', lineHeight: 22 },
});
