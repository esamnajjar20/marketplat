import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { createServiceRequest, fetchServiceRequests, respondToServiceRequest, type ServiceRequest } from '@/features/services/services.api';
import { colors, radius, spacing } from '@/theme/tokens';

const statusLabels: Record<string, string> = { PENDING: 'بانتظار الرد', ACCEPTED: 'مقبول', REJECTED: 'مرفوض', IN_PROGRESS: 'قيد التنفيذ', COMPLETED: 'مكتمل', CANCELLED: 'ملغي', EXPIRED: 'منتهي', DISPUTED: 'قيد المراجعة' };

export default function ServiceRequestsScreen() {
  const params = useLocalSearchParams<{ listingId?: string | string[]; listingTitle?: string | string[] }>();
  const listingId = Array.isArray(params.listingId) ? params.listingId[0] : params.listingId;
  const listingTitle = Array.isArray(params.listingTitle) ? params.listingTitle[0] : params.listingTitle;
  const { user, accessToken, csrfToken } = useAuth();
  const [incoming, setIncoming] = useState(false);
  const [items, setItems] = useState<ServiceRequest[]>([]);
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    if (!accessToken) { setLoading(false); setError('سجّل الدخول لعرض طلباتك.'); return; }
    setLoading(true); setError(null);
    try {
      const result = await fetchServiceRequests(accessToken, incoming);
      if (sequence === requestSequence.current) setItems(result);
    } catch (e) {
      if (sequence === requestSequence.current) setError(e instanceof Error ? e.message : 'تعذر تحميل الطلبات.');
    } finally { if (sequence === requestSequence.current) setLoading(false); }
  }, [accessToken, incoming]);
  useEffect(() => { void load(); return () => { requestSequence.current += 1; }; }, [load]);
  const submit = async () => {
    if (!listingId || !accessToken || saving) return;
    if (details.trim().length < 10) { Alert.alert('تفاصيل الطلب', 'اكتب 10 أحرف على الأقل لتوضيح احتياجك.'); return; }
    setSaving(true);
    try {
      await createServiceRequest(listingId, details, accessToken, csrfToken);
      setDetails('');
      Alert.alert('تم إرسال الطلب', 'أُرسل طلبك إلى مقدم الخدمة. يمكنك متابعة حالته من هذه الصفحة.');
      router.setParams({ listingId: undefined, listingTitle: undefined });
      await load();
    } catch (e) { Alert.alert('تعذر إرسال الطلب', e instanceof Error ? e.message : 'لم يتم تأكيد إرسال الطلب. حاول مجددًا.'); }
    finally { setSaving(false); }
  };
  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.top}><Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>→</Text></Pressable><Text style={styles.topTitle}>طلبات الخدمات</Text><View style={styles.back}/></View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {listingId ? <View style={styles.form}><Text style={styles.formTitle}>طلب خدمة جديدة</Text><Text style={styles.formSubtitle} numberOfLines={2}>{listingTitle || 'الخدمة المحددة'}</Text><Text style={styles.label}>اشرح احتياجك</Text><TextInput accessibilityLabel="تفاصيل طلب الخدمة" value={details} onChangeText={setDetails} multiline maxLength={1000} placeholder="اكتب التفاصيل المهمة لمقدم الخدمة…" placeholderTextColor={colors.muted} textAlign="right" textAlignVertical="top" style={styles.textarea}/><Text style={styles.hint}>{details.trim().length}/1000 · الحد الأدنى 10 أحرف</Text><Pressable accessibilityRole="button" disabled={saving} onPress={() => void submit()} style={[styles.primary, saving && styles.disabled]}><Text style={styles.primaryText}>{saving ? 'جارٍ الإرسال…' : 'إرسال الطلب'}</Text></Pressable></View> : null}
      {user ? <View style={styles.switchRow}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: !incoming }} onPress={() => setIncoming(false)} style={[styles.switchChip, !incoming && styles.switchChipActive]}><Text style={[styles.switchText, !incoming && styles.switchTextActive]}>طلباتي</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: incoming }} onPress={() => setIncoming(true)} style={[styles.switchChip, incoming && styles.switchChipActive]}><Text style={[styles.switchText, incoming && styles.switchTextActive]}>الطلبات الواردة</Text></Pressable>
      </View> : null}
      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{incoming ? 'طلبات العملاء الواردة' : user ? 'طلباتي السابقة' : 'طلبات الخدمات'}</Text><Pressable accessibilityRole="button" onPress={() => void load()}><Text style={styles.link}>تحديث</Text></Pressable></View>
      {loading ? <View style={styles.state}><ActivityIndicator size="large" color={colors.brand}/><Text style={styles.muted}>جاري تحميل الطلبات…</Text></View> : error ? <View style={styles.state}><Text style={styles.muted}>{error}</Text><Pressable onPress={() => !accessToken ? router.push('/login') : void load()} style={styles.primary}><Text style={styles.primaryText}>{accessToken ? 'إعادة المحاولة' : 'تسجيل الدخول'}</Text></Pressable></View> : items.length === 0 ? <View style={styles.state}><Text style={styles.emptyIcon}>▤</Text><Text style={styles.emptyTitle}>لا توجد طلبات بعد</Text><Text style={styles.muted}>عندما تطلب خدمة، ستظهر حالة الطلب ورد مقدم الخدمة هنا.</Text></View> : <View style={styles.list}>{items.map((item) => <View key={item.id} style={styles.requestCard}><View style={styles.requestHeader}><Pressable accessibilityRole="button" accessibilityLabel={`عرض تفاصيل طلب ${item.listing?.title || 'خدمة'}`} onPress={() => router.push({ pathname: '/service-requests/[id]', params: { id: item.id } })} style={{ flex: 1 }}><Text style={styles.requestTitle} numberOfLines={2}>{item.listing?.title || 'طلب خدمة'}</Text></Pressable><Text style={[styles.status, item.status === 'COMPLETED' ? styles.statusSuccess : null]}>{statusLabels[item.status || ''] || item.status || 'قيد المتابعة'}</Text></View><Text style={styles.details} numberOfLines={3}>{item.details || 'لا توجد تفاصيل إضافية.'}</Text><Text style={styles.meta}>{item.createdAt ? new Intl.DateTimeFormat('ar', { dateStyle: 'medium' }).format(new Date(item.createdAt)) : ''}{item.quotedPrice != null ? ` · السعر المقترح ${item.quotedPrice} ₪` : ''}</Text><Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/service-requests/[id]', params: { id: item.id } })} style={styles.acceptButton}><Text style={styles.acceptText}>عرض تفاصيل الطلب</Text></Pressable>{['ACCEPTED','IN_PROGRESS'].includes(item.status || '') ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/appointment-create', params: { requestId: item.id } })} style={styles.acceptButton}><Text style={styles.acceptText}>حجز موعد</Text></Pressable> : null}</View>)}</View>}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.canvas }, top: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }, back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }, backText: { fontSize: 24, color: colors.brand }, topTitle: { color: colors.ink, fontWeight: '800', fontSize: 17 }, content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 44 }, form: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md }, formTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', textAlign: 'right' }, formSubtitle: { color: colors.brand, fontSize: 13, textAlign: 'right' }, label: { color: colors.ink, fontSize: 14, fontWeight: '700', textAlign: 'right' }, textarea: { minHeight: 120, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, color: colors.ink, fontSize: 14, lineHeight: 22, writingDirection: 'rtl' }, hint: { color: colors.muted, fontSize: 11, textAlign: 'right' }, primary: { backgroundColor: colors.brand, borderRadius: radius.md, minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg }, primaryText: { color: colors.white, fontSize: 14, fontWeight: '800' }, disabled: { opacity: 0.6 }, switchRow: { flexDirection: 'row-reverse', backgroundColor: colors.border, padding: 4, borderRadius: radius.md, gap: 4 }, switchChip: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: 10 }, switchChipActive: { backgroundColor: colors.surface }, switchText: { color: colors.muted, fontSize: 13, fontWeight: '700' }, switchTextActive: { color: colors.brand }, responseRow: { flexDirection: 'row-reverse', gap: spacing.sm, marginTop: spacing.xs }, acceptButton: { backgroundColor: colors.brand, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md, minHeight: 44, justifyContent: 'center' }, acceptText: { color: colors.white, fontSize: 12, fontWeight: '800' }, rejectButton: { borderWidth: 1, borderColor: colors.danger, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md, minHeight: 44, justifyContent: 'center' }, rejectText: { color: colors.danger, fontSize: 12, fontWeight: '800' }, sectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' }, link: { color: colors.brand, fontWeight: '700' }, state: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border }, emptyIcon: { color: colors.brand, fontSize: 34 }, emptyTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' }, muted: { color: colors.muted, textAlign: 'center', lineHeight: 21 }, list: { gap: spacing.md }, requestCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm }, requestHeader: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm }, requestTitle: { flex: 1, color: colors.ink, fontSize: 16, fontWeight: '900', textAlign: 'right' }, status: { color: colors.brand, backgroundColor: colors.brandSoft, overflow: 'hidden', borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 5, fontSize: 11, fontWeight: '800' }, statusSuccess: { color: colors.brand, backgroundColor: colors.successSoft }, details: { color: colors.ink, fontSize: 13, lineHeight: 21, textAlign: 'right' }, meta: { color: colors.muted, fontSize: 11, textAlign: 'right' } });
