import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { fetchServiceListing, getCachedServiceListing, type ServiceListing } from '@/features/services/services.api';
import { useAuth } from '@/features/auth/AuthContext';
import { colors, radius, spacing } from '@/theme/tokens';

export default function ServiceDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { user } = useAuth();
  const [item, setItem] = useState<ServiceListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!id) { setError('رابط الخدمة غير مكتمل.'); setLoading(false); return; }
    setLoading(true); setError(null);
    let hasCache = false;
    try { const cached = await getCachedServiceListing(id); if (cached) { hasCache = true; setItem(cached); setLoading(false); } } catch { /* cache is optional */ }
    try { setItem(await fetchServiceListing(id)); }
    catch (e) { if (!hasCache) setError(e instanceof Error ? e.message : 'تعذر تحميل الخدمة.'); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  const price = item?.pricingType === 'NEGOTIABLE' || item?.price == null ? 'السعر عند الاتفاق' : `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(Number(item.price))} ₪${item.pricingType === 'STARTING_FROM' ? ' وما فوق' : ''}`;
  const provider = item?.provider?.businessName || item?.provider?.sellerProfile?.displayName || 'مقدم خدمة';
  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.top}><Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>→</Text></Pressable><Text style={styles.topTitle}>تفاصيل الخدمة</Text><View style={styles.back}/></View>
    {loading ? <View style={styles.state}><ActivityIndicator size="large" color={colors.brand}/><Text style={styles.muted}>جاري تحميل التفاصيل…</Text></View> : error || !item ? <View style={styles.state}><Text style={styles.heading}>تعذر عرض الخدمة</Text><Text style={styles.muted}>{error || 'الخدمة غير متاحة.'}</Text><Pressable onPress={() => void load()} style={styles.primary}><Text style={styles.primaryText}>إعادة المحاولة</Text></Pressable></View> : <>
      <ScrollView contentContainerStyle={styles.content}>
        {item.images?.filter((uri) => /^https?:\/\//i.test(uri)).slice(0, 5).map((uri, index) => <Image key={`${uri}-${index}`} source={{ uri }} style={styles.heroImage} resizeMode="cover" />)}
        <View style={styles.titleCard}><Text style={styles.title}>{item.title}</Text><Text style={styles.price}>{price}</Text><Text style={styles.provider}>{provider}{item.provider?.sellerProfile?.verified ? ' · مقدم موثّق' : ''}</Text><Text style={styles.meta}>{[item.category?.nameAr || item.category?.name, item.durationEstimate, item.serviceLocation === 'REMOTE' ? 'عن بُعد' : item.serviceLocation === 'AT_CUSTOMER' ? 'في موقع العميل' : item.serviceLocation === 'AT_PROVIDER' ? 'في موقع مقدم الخدمة' : null].filter(Boolean).join(' · ')}</Text></View>
        <View style={styles.section}><Text style={styles.sectionTitle}>وصف الخدمة</Text><Text style={styles.description}>{item.description?.trim() || 'لم يضف مقدم الخدمة وصفًا تفصيليًا.'}</Text></View>
        <View style={styles.section}><Text style={styles.sectionTitle}>قبل إرسال الطلب</Text><Text style={styles.description}>اكتب احتياجك بوضوح داخل الطلب. إرسال الطلب لا يعني تأكيد الحجز أو الاتفاق على السعر؛ انتظر رد مقدم الخدمة.</Text></View><Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/report/[targetType]/[targetId]', params: { targetType: 'services', targetId: item.id } })} style={styles.section}><Text style={styles.sectionTitle}>الإبلاغ عن الخدمة</Text><Text style={styles.description}>إذا كانت الخدمة مخالفة أو مضللة، يمكنك إرسال بلاغ للمراجعة.</Text></Pressable>
      </ScrollView>
      <View style={styles.footer}><Pressable accessibilityRole="button" onPress={() => { if (!user) { Alert.alert('تسجيل الدخول مطلوب', 'سجّل الدخول أولاً لإرسال طلب خدمة.', [{ text: 'إلغاء', style: 'cancel' }, { text: 'تسجيل الدخول', onPress: () => router.push('/login') }]); return; } router.push({ pathname: '/service-requests', params: { listingId: item.id, listingTitle: item.title } }); }} style={styles.primary}><Text style={styles.primaryText}>اطلب هذه الخدمة</Text></Pressable></View>
    </>}
  </SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.canvas }, top: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }, back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }, backText: { fontSize: 24, color: colors.brand }, topTitle: { color: colors.ink, fontWeight: '800', fontSize: 17 }, content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md, paddingBottom: 32 }, heroImage: { width: '100%', height: 250, borderRadius: radius.lg, backgroundColor: '#E8ECEF', borderWidth: 1, borderColor: colors.border }, titleCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md, shadowColor: '#102A26', shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 }, title: { color: colors.ink, fontSize: 24, fontWeight: '900', textAlign: 'right', lineHeight: 33 }, price: { color: colors.brand, fontSize: 22, fontWeight: '900', textAlign: 'right' }, provider: { color: colors.ink, fontSize: 14, textAlign: 'right' }, meta: { color: colors.muted, fontSize: 12, textAlign: 'right' }, section: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm }, sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: '800', textAlign: 'right' }, description: { color: colors.ink, fontSize: 14, lineHeight: 24, textAlign: 'right' }, footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }, primary: { backgroundColor: colors.brand, paddingVertical: spacing.md, minHeight: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: '#fff', fontSize: 15, fontWeight: '800' }, state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md }, heading: { color: colors.ink, fontSize: 18, fontWeight: '800' }, muted: { color: colors.muted, textAlign: 'center' } });
