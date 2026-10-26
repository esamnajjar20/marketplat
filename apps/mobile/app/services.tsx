import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { fetchServiceListings, getCachedServiceListings, type ServiceListing } from '@/features/services/services.api';
import { colors, radius, spacing } from '@/theme/tokens';

function priceLabel(item: ServiceListing) {
  if (item.pricingType === 'NEGOTIABLE' || item.price == null) return 'السعر عند الاتفاق';
  const value = Number(item.price);
  return Number.isFinite(value) ? `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(value)} ₪${item.pricingType === 'STARTING_FROM' ? ' وما فوق' : ''}` : 'السعر عند الاتفاق';
}

export default function ServicesScreen() {
  const [items, setItems] = useState<ServiceListing[]>([]);
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null);
    const options = { page: 1, limit: 30, search: submitted };
    let hasCache = false;
    try { const cached = await getCachedServiceListings(options); if (cached) { hasCache = true; setItems(cached); setLoading(false); } } catch { /* cache is optional */ }
    try { setItems(await fetchServiceListings(options)); }
    catch (e) { if (!hasCache) setError(e instanceof Error ? e.message : 'تعذر تحميل الخدمات.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [submitted]);
  useEffect(() => { void load(); }, [load]);

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.brand} />}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>→</Text></Pressable>
        <View style={styles.headerText}><Text style={styles.title}>الخدمات</Text><Text style={styles.subtitle}>اعثر على مقدم الخدمة المناسب</Text></View>
      </View>
      <View style={styles.search}>
        <TextInput value={query} onChangeText={setQuery} onSubmitEditing={() => setSubmitted(query.trim())} placeholder="ابحث عن خدمة…" placeholderTextColor={colors.muted} returnKeyType="search" style={styles.searchInput} textAlign="right" />
        {query ? <Pressable onPress={() => { setQuery(''); setSubmitted(''); }} accessibilityRole="button"><Text style={styles.clear}>×</Text></Pressable> : null}
        <Pressable onPress={() => setSubmitted(query.trim())} accessibilityRole="button" style={styles.searchButton}><Text style={styles.searchButtonText}>بحث</Text></Pressable>
      </View>
      <View style={styles.sectionRow}><Text style={styles.sectionTitle}>خدمات متاحة</Text><Text style={styles.count}>{items.length} نتيجة</Text></View>
      {loading ? <View style={styles.state}><ActivityIndicator size="large" color={colors.brand}/><Text style={styles.stateText}>جاري تحميل الخدمات…</Text></View> : error ? <View style={styles.state}><Text style={styles.stateTitle}>تعذر تحميل الخدمات</Text><Text style={styles.stateText}>{error}</Text><Pressable onPress={() => void load()} style={styles.primary}><Text style={styles.primaryText}>إعادة المحاولة</Text></Pressable></View> : items.length === 0 ? <View style={styles.state}><Text style={styles.emptyIcon}>⌕</Text><Text style={styles.stateTitle}>لا توجد خدمات مطابقة</Text><Text style={styles.stateText}>جرّب كلمات بحث مختلفة أو اسحب الشاشة للأسفل للتحديث.</Text></View> : <View style={styles.list}>{items.map((item) => {
        const image = item.images?.find((uri) => /^https?:\/\//i.test(uri));
        const provider = item.provider?.businessName || item.provider?.sellerProfile?.displayName || 'مقدم خدمة';
        return <Pressable key={item.id} accessibilityRole="button" onPress={() => router.push(`/services/${encodeURIComponent(item.id)}`)} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
          {image ? <Image source={{ uri: image }} style={styles.image} resizeMode="cover" /> : <View style={styles.imagePlaceholder}><Text style={styles.placeholderGlyph}>✦</Text></View>}
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.provider} numberOfLines={1}>{provider}{item.provider?.sellerProfile?.verified ? ' · موثّق' : ''}</Text>
            <Text style={styles.price}>{priceLabel(item)}</Text>
            <Text style={styles.meta} numberOfLines={1}>{[item.category?.nameAr || item.category?.name, item.durationEstimate, item.serviceLocation === 'REMOTE' ? 'عن بُعد' : item.serviceLocation === 'AT_CUSTOMER' ? 'في موقع العميل' : item.serviceLocation === 'AT_PROVIDER' ? 'في موقع مقدم الخدمة' : null].filter(Boolean).join(' · ')}</Text>
          </View>
          <Text style={styles.chevron}>‹</Text>
        </Pressable>;
      })}</View>}
      <Pressable accessibilityRole="button" onPress={() => router.push('/service-requests')} style={styles.secondary}><Text style={styles.secondaryText}>عرض طلباتي من الخدمات</Text></Pressable>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas }, content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 36 },
  header: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md }, back: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, backText: { fontSize: 24, color: colors.brand }, headerText: { flex: 1, gap: 3 }, title: { fontSize: 24, color: colors.ink, fontWeight: '800', textAlign: 'right' }, subtitle: { fontSize: 13, color: colors.muted, textAlign: 'right' },
  search: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, minHeight: 52, paddingHorizontal: spacing.sm, gap: spacing.sm }, searchInput: { flex: 1, fontSize: 15, color: colors.ink, paddingVertical: spacing.md, writingDirection: 'rtl' }, clear: { fontSize: 23, color: colors.muted, paddingHorizontal: 4 }, searchButton: { backgroundColor: colors.brand, borderRadius: 11, paddingHorizontal: spacing.md, paddingVertical: 10 }, searchButtonText: { color: '#fff', fontWeight: '800' },
  sectionRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' }, count: { color: colors.muted, fontSize: 12 }, list: { gap: spacing.md }, card: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md }, pressed: { opacity: 0.88, transform: [{ scale: 0.99 }] }, image: { width: 92, height: 104, borderRadius: radius.md, backgroundColor: '#E8ECEF' }, imagePlaceholder: { width: 92, height: 104, borderRadius: radius.md, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }, placeholderGlyph: { fontSize: 32, color: colors.brand }, cardBody: { flex: 1, alignItems: 'flex-end', gap: 5 }, cardTitle: { color: colors.ink, fontSize: 15, fontWeight: '800', lineHeight: 21, textAlign: 'right' }, provider: { color: colors.muted, fontSize: 12, textAlign: 'right' }, price: { color: colors.brand, fontSize: 14, fontWeight: '800', textAlign: 'right' }, meta: { color: colors.muted, fontSize: 11, textAlign: 'right' }, chevron: { color: colors.muted, fontSize: 27 }, state: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md }, stateTitle: { color: colors.ink, fontWeight: '800', fontSize: 16, textAlign: 'center' }, stateText: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' }, emptyIcon: { fontSize: 36, color: colors.brand }, primary: { backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xl }, primaryText: { color: '#fff', fontWeight: '800' }, secondary: { borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' }, secondaryText: { color: colors.brand, fontWeight: '800' },
});
