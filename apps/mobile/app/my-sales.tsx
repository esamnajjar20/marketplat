import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colors, radius, spacing } from '@/theme/tokens';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchSales, fetchSalesSummary, type SalePaymentStatus, type SaleRecord, type SalesPeriod, type SalesSummary } from '@/features/sales/sales.api';

const periodOptions: { value: SalesPeriod; label: string }[] = [
  { value: 'day', label: 'اليوم' }, { value: 'week', label: 'أسبوع' }, { value: 'month', label: 'شهر' }, { value: 'year', label: 'سنة' },
];
const statusOptions: { value: SalePaymentStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'الكل' }, { value: 'PAID', label: 'مدفوعة' }, { value: 'PARTIAL', label: 'مدفوعة جزئيًا' }, { value: 'UNPAID', label: 'غير مدفوعة' }, { value: 'OVERDUE', label: 'متأخرة' },
];
const statusLabel: Record<SalePaymentStatus, string> = { PAID: 'مدفوعة', PARTIAL: 'مدفوعة جزئيًا', UNPAID: 'غير مدفوعة', OVERDUE: 'متأخرة' };
const money = (value: unknown, currency = 'ILS') => `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(Number(value) || 0)} ${currency === 'ILS' ? '₪' : currency}`;
const dateLabel = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'تاريخ غير متاح' : date.toLocaleDateString('ar', { year: 'numeric', month: 'short', day: 'numeric' }); };

export default function MySalesScreen() {
  const { accessToken, isRestoring, user } = useAuth();
  const [period, setPeriod] = useState<SalesPeriod>('month');
  const [status, setStatus] = useState<SalePaymentStatus | 'ALL'>('ALL');
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [items, setItems] = useState<SaleRecord[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (!accessToken) { setLoading(false); return; }
    if (refresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const [summaryResult, pageResult] = await Promise.all([
        fetchSalesSummary(period, accessToken, user?.id),
        fetchSales(accessToken, 1, status === 'ALL' ? undefined : status, user?.id),
      ]);
      setSummary(summaryResult);
      setItems(pageResult.items);
      setPage(pageResult.meta.page || 1);
      setTotalPages(pageResult.meta.totalPages || 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل المبيعات.');
    } finally { setLoading(false); setRefreshing(false); }
  }, [accessToken, period, status, user?.id]);

  useEffect(() => { if (!isRestoring) void load(); }, [isRestoring, load]);

  const loadMore = async () => {
    if (!accessToken || loadingMore || loading || page >= totalPages) return;
    setLoadingMore(true);
    try {
      const next = await fetchSales(accessToken, page + 1, status === 'ALL' ? undefined : status, user?.id);
      setItems(current => {
        const seen = new Set(current.map(item => item.id));
        return [...current, ...next.items.filter(item => !seen.has(item.id))];
      });
      setPage(next.meta.page || page + 1);
      setTotalPages(next.meta.totalPages || totalPages);
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل المزيد من المبيعات.'); }
    finally { setLoadingMore(false); }
  };

  if (!user) return <SafeAreaView style={s.safe} edges={['top']}><View style={s.state}><Text style={s.title}>مبيعاتي</Text><Text style={s.muted}>سجّل الدخول لعرض سجل مبيعاتك.</Text><Pressable onPress={() => router.push('/login')} style={s.primary}><Text style={s.primaryText}>تسجيل الدخول</Text></Pressable></View></SafeAreaView>;

  return <SafeAreaView style={s.safe} edges={['top']}><ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}>
    <View style={s.header}><Pressable accessibilityRole="button" onPress={() => router.back()} style={s.back}><Text style={s.backText}>→</Text></Pressable><View style={s.headerText}><Text style={s.title}>مبيعاتي</Text><Text style={s.subtitle}>سجل عمليات البيع والمدفوعات والمبالغ المستحقة.</Text></View></View>
    <Text style={s.sectionTitle}>ملخص المبيعات</Text>
    <View style={s.segmentRow}>{periodOptions.map(option => <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: period === option.value }} onPress={() => setPeriod(option.value)} style={[s.segment, period === option.value && s.segmentActive]}><Text style={[s.segmentText, period === option.value && s.segmentTextActive]}>{option.label}</Text></Pressable>)}</View>
    {loading || isRestoring ? <View style={s.state}><ActivityIndicator color={colors.brand} /><Text style={s.muted}>جاري تحميل المبيعات…</Text></View> : error && !summary ? <View style={s.state}><Text style={s.error}>{error}</Text><Pressable onPress={() => void load(true)} style={s.primary}><Text style={s.primaryText}>إعادة المحاولة</Text></Pressable></View> : <>
      {summary ? <View style={s.metrics}>
        <View style={s.metric}><Text style={s.metricLabel}>إجمالي الإيرادات</Text><Text style={s.metricValue}>{money(summary.totalRevenue)}</Text></View>
        <View style={s.metric}><Text style={s.metricLabel}>المبالغ المحصّلة</Text><Text style={s.metricValue}>{money(summary.totalPaid)}</Text></View>
        <View style={s.metric}><Text style={s.metricLabel}>المبالغ المستحقة</Text><Text style={[s.metricValue, s.dueValue]}>{money(summary.totalDue)}</Text></View>
        <View style={s.metric}><Text style={s.metricLabel}>عدد عمليات البيع</Text><Text style={s.metricValue}>{new Intl.NumberFormat('ar').format(summary.salesCount)}</Text></View>
        <View style={s.metric}><Text style={s.metricLabel}>صافي الربح التقديري</Text><Text style={s.metricValue}>{money(summary.netProfit)}</Text></View>
        <View style={s.metric}><Text style={s.metricLabel}>المبالغ المستردة</Text><Text style={s.metricValue}>{money(summary.totalRefunded)}</Text></View>
      </View> : null}
      <View style={s.listHeading}><Text style={s.sectionTitle}>سجل عمليات البيع</Text><Text style={s.count}>{items.length ? `المعروض ${items.length}` : 'لا توجد نتائج'}</Text></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>{statusOptions.map(option => <Pressable key={option.value} onPress={() => setStatus(option.value)} style={[s.filter, status === option.value && s.filterActive]}><Text style={[s.filterText, status === option.value && s.filterTextActive]}>{option.label}</Text></Pressable>)}</ScrollView>
      {error ? <Text style={s.error}>{error}</Text> : null}
      {items.length === 0 ? <View style={s.state}><Text style={s.emptyTitle}>لا توجد مبيعات هنا بعد</Text><Text style={s.muted}>ستظهر عمليات البيع المسجلة في حسابك في هذه القائمة.</Text></View> : items.map(sale => <View key={sale.id} style={s.saleCard}>
        <View style={s.saleTop}><Text style={s.saleTotal}>{money(sale.totalPrice, sale.currency)}</Text><Text style={[s.status, sale.paymentStatus === 'OVERDUE' && s.statusDanger, sale.paymentStatus === 'PAID' && s.statusPaid]}>{statusLabel[sale.paymentStatus] || sale.paymentStatus}</Text></View>
        <Text style={s.saleName}>{sale.entityTitle}</Text>
        <Text style={s.saleMeta}>العميل: {sale.buyerName}{sale.invoiceNumber ? ` · فاتورة ${sale.invoiceNumber}` : ''}</Text>
        <Text style={s.saleMeta}>التاريخ: {dateLabel(sale.soldAt)} · الكمية: {sale.quantity}</Text>
        <View style={s.amountRow}><Text style={s.amountLabel}>المحصّل: {money(sale.paidAmount, sale.currency)}</Text><Text style={[s.amountLabel, Number(sale.dueAmount) > 0 && s.dueValue]}>المتبقي: {money(sale.dueAmount, sale.currency)}</Text></View>
      </View>)}
      {page < totalPages ? <Pressable disabled={loadingMore} onPress={() => void loadMore()} style={[s.moreButton, loadingMore && s.disabled]}><Text style={s.moreText}>{loadingMore ? 'جاري التحميل…' : 'تحميل المزيد'}</Text></Pressable> : null}
      <Text style={s.sectionTitle}>أدوات إدارة المبيعات</Text>
      <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 }}>
        {([['/debts', 'الديون والمستحقات'], ['/installments', 'الأقساط'], ['/customers', 'عملائي'], ['/activity', 'سجل النشاط']] as const).map(([path, label]) => <Pressable key={path} accessibilityRole="button" onPress={() => router.push(path)} style={{ flexGrow: 1, minWidth: '46%', padding: 13, borderRadius: radius.md, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.border }}><Text style={{ textAlign: 'center', color: colors.brand, fontWeight: '900' }}>{label}</Text></Pressable>)}
      </View>
      <Text style={s.footnote}>الملخص للفترة المحددة، بينما سجل العمليات يعرض أحدث المبيعات المطابقة للفلتر.</Text>
    </>}
  </ScrollView></SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas }, content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 44 },
  header: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md }, back: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, backText: { fontSize: 24, color: colors.brand }, headerText: { flex: 1, alignItems: 'flex-end', gap: 4 }, title: { fontSize: 22, fontWeight: '800', color: colors.ink }, subtitle: { fontSize: 12, color: colors.muted, textAlign: 'right', lineHeight: 19 }, sectionTitle: { fontSize: 16, fontWeight: '900', color: colors.ink, textAlign: 'right' },
  segmentRow: { flexDirection: 'row-reverse', gap: 6 }, segment: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, segmentActive: { backgroundColor: colors.brand, borderColor: colors.brand }, segmentText: { color: colors.muted, fontSize: 12, fontWeight: '800' }, segmentTextActive: { color: '#fff' },
  metrics: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm }, metric: { width: '48%', flexGrow: 1, minHeight: 90, justifyContent: 'center', gap: 8, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, metricLabel: { fontSize: 12, color: colors.muted, textAlign: 'right' }, metricValue: { fontSize: 17, fontWeight: '900', color: colors.ink, textAlign: 'right' }, dueValue: { color: colors.danger },
  listHeading: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm }, count: { fontSize: 12, color: colors.muted }, filterRow: { flexDirection: 'row-reverse', gap: 7, paddingVertical: 2 }, filter: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, backgroundColor: colors.surface, paddingHorizontal: 13, paddingVertical: 9 }, filterActive: { backgroundColor: colors.brandSoft, borderColor: colors.brand }, filterText: { color: colors.muted, fontSize: 12, fontWeight: '700' }, filterTextActive: { color: colors.brand },
  saleCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, gap: 8 }, saleTop: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, saleTotal: { color: colors.brand, fontSize: 17, fontWeight: '900' }, status: { overflow: 'hidden', borderRadius: radius.pill, backgroundColor: '#FFF0D6', color: '#8A5700', paddingHorizontal: 10, paddingVertical: 5, fontSize: 11, fontWeight: '800' }, statusPaid: { backgroundColor: '#DFF5EC', color: '#176B50' }, statusDanger: { backgroundColor: '#FCE8E8', color: colors.danger }, saleName: { color: colors.ink, fontSize: 15, fontWeight: '900', textAlign: 'right' }, saleMeta: { color: colors.muted, fontSize: 12, textAlign: 'right', lineHeight: 18 }, amountRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 2 }, amountLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  state: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg }, emptyTitle: { fontSize: 16, fontWeight: '900', color: colors.ink }, muted: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 20 }, error: { color: colors.danger, textAlign: 'right', fontSize: 13 }, primary: { backgroundColor: colors.brand, borderRadius: radius.md, padding: spacing.md }, primaryText: { color: '#fff', fontWeight: '800' }, moreButton: { alignItems: 'center', padding: spacing.md, borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md }, moreText: { color: colors.brand, fontWeight: '900' }, disabled: { opacity: .6 }, footnote: { fontSize: 11, color: colors.muted, textAlign: 'right', lineHeight: 18 },
});
