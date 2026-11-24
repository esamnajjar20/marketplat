import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, View } from 'react-native';
import { BrandRefreshControl } from '@/components/ui/BrandRefreshControl';
import { ScreenFrame } from '@/components/ui/ScreenFrame';
import { useLocalSearchParams } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { AppHeader, EmptyState, ErrorState, LoadingState, SectionCard } from '@/components/ui';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchSalesDashboard, fetchSalesReport, fetchSalesSmartInsights, type SalesDashboardData, type SalesReportData, type SalesSmartInsightsData } from '@/features/sales/sales-extra.api';
import type { SalePaymentStatus } from '@/features/sales/sales.api';
import { formatMoney, formatNumber, formatDate } from '@/lib/formatters';
import { useAsyncResource } from '@/hooks/useAsyncResource';
import { DatePickerField } from '@/components/ui/DatePickerField';

type InsightsData = { dashboard: SalesDashboardData | null; report: SalesReportData | null; smart: SalesSmartInsightsData | null };
import { fontSizes, radius, spacing, fontWeights, sizes, insets } from '@/theme/tokens';
const money = (value: unknown) => formatMoney(Number(value ?? 0));
const STATUS: Array<{
  value: SalePaymentStatus | '';
  label: string;
}> = [
  {
    value: '', label: 'الكل'
  },
  {
    value: 'PAID', label: 'مدفوعة'
  },
  {
    value: 'PARTIAL', label: 'جزئية'
  },
  {
    value: 'UNPAID', label: 'غير مدفوعة'
  },
  {
    value: 'OVERDUE', label: 'متأخرة'
  },
];
type ViewMode = 'overview' | 'analytics' | 'reports' | 'smart';
export default function SalesInsightsScreen() {
  const params = useLocalSearchParams<{
    view?: string;
  }>();
  const mode: ViewMode = params.view === 'overview' || params.view === 'reports' || params.view === 'smart' ? params.view : 'analytics';
  const title = mode === 'overview' ? 'نظرة عامة على المبيعات' : mode === 'reports' ? 'تقارير المبيعات' : mode === 'smart' ? 'التحليلات الذكية' : 'إحصائيات المبيعات';
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, getAccessToken, isRestoring } = useAuth();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<SalePaymentStatus | ''>('');
  const [reportPage, setReportPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<{
    from: string;
    to: string;
    status: SalePaymentStatus | '';
  }>({
    from: '', to: '', status: ''
  });
  const [actionError, setActionError] = useState('');
  // دورة الجلب الموحّدة: هوية المورد = (الوضع، الفلاتر المطبّقة، الحساب). كل وضع يملأ حقله فقط.
  const resource = useAsyncResource<InsightsData>(
    async () => {
      const token = getAccessToken();
      if (!token || !user?.id) throw new Error('انتهت الجلسة. سجّل الدخول مجددًا.');
      const next: InsightsData = { dashboard: null, report: null, smart: null };
      if (mode === 'analytics' || mode === 'overview') next.dashboard = await fetchSalesDashboard(token, undefined, user.id);
      else if (mode === 'reports') next.report = await fetchSalesReport(token, {
        from: appliedFilters.from || undefined, to: appliedFilters.to ? `${appliedFilters.to}T23:59:59.999` : undefined, status: appliedFilters.status || undefined, page: reportPage, limit: 100
      }, undefined, user.id);
      else next.smart = await fetchSalesSmartInsights(token, undefined, user.id);
      return next;
    },
    {
      key: `${user?.id ?? ''}|${mode}|${appliedFilters.from}|${appliedFilters.to}|${appliedFilters.status}|${mode === 'reports' ? reportPage : 1}`,
      manual: isRestoring || !user?.id,
      tag: 'sales-insights',
      mapError: (e) => (e instanceof Error && e.message ? e.message : 'تعذر تحميل بيانات المبيعات.'),
    },
  );
  const { data, loading, refreshing, reload } = resource;
  const dashboard = data?.dashboard ?? null;
  const report = data?.report ?? null;
  const smart = data?.smart ?? null;
  const error = actionError || resource.error || '';
  const load = useCallback((refresh = false) => reload(refresh ? { soft: true } : undefined), [reload]);
  const exportCsv = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !user?.id) {
      Alert.alert('انتهت الجلسة', 'سجّل الدخول مجددًا لتصدير التقرير.');
      return;
    }
    setExporting(true);
    setActionError('');
    try {
      const filters = {
        from: appliedFilters.from || undefined,
        to: appliedFilters.to ? `${appliedFilters.to}T23:59:59.999` : undefined,
        status: appliedFilters.status || undefined,
        limit: 500,
      };
      const firstPage = await fetchSalesReport(token, { ...filters, page: 1 }, undefined, user.id);
      const allRows = [...firstPage.rows];
      let page = 2;
      // Keep the native share-sheet payload bounded. Users can narrow the
      // date range when the report exceeds the mobile export cap.
      while (firstPage.totalCount && allRows.length < Math.min(firstPage.totalCount, 1000)) {
        const next = await fetchSalesReport(token, { ...filters, page }, undefined, user.id);
        allRows.push(...next.rows);
        if (!next.hasMore || next.rows.length === 0 || allRows.length >= 1000) break;
        page += 1;
      }
      if (!allRows.length) {
        Alert.alert('لا توجد بيانات', 'لا توجد عمليات لتصديرها ضمن الفلاتر الحالية.');
        return;
      }
      const cell = (value: unknown) => {
        let text = String(value ?? '');
        const numericValue = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text);
        if (!numericValue && /^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
      };
      const headers = ['رقم الفاتورة', 'التاريخ', 'العميل', 'العملية', 'الكمية الصافية', 'الإيراد', 'التكلفة', 'الربح', 'المدفوع', 'المتبقي', 'المسترد', 'الحالة', 'العملة'];
      const csvRows = allRows.map((row) => [row.invoiceNumber, row.soldAt, row.buyerName, row.title, row.quantity, row.revenue, row.cost, row.profit, row.paid, row.due, row.refunded, row.status, row.currency]);
      const csv = `\uFEFF${[headers, ...csvRows].map((row) => row.map(cell).join(',')).join('\r\n')}`;
      await Share.share({ title: 'تقرير المبيعات CSV', message: csv });
      if ((firstPage.totalCount ?? allRows.length) > allRows.length) {
        Alert.alert('تصدير جزئي', `تم تجهيز ${allRows.length} من أصل ${firstPage.totalCount} عملية. استخدم فترة زمنية أضيق لتصدير الباقي.`);
      }
    } catch (exportError) {
      const message = exportError instanceof Error ? exportError.message : 'تعذر تجهيز ملف CSV.';
      setActionError(message);
      Alert.alert('تعذر التصدير', message);
    } finally {
      setExporting(false);
    }
  }, [getAccessToken, appliedFilters, user?.id]);
  if (isRestoring)
    return <ScreenFrame><LoadingState message="جارٍ استعادة الجلسة…"/></ScreenFrame>;
  if (!user)
    return <ScreenFrame><EmptyState title="سجّل الدخول لعرض بيانات المبيعات" actionLabel="تسجيل الدخول" onAction={() => pushOnce('/login')}/></ScreenFrame>;
  const metric = (label: string, value: string, danger = false) => <View key={label} style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue, danger && styles.danger]}>{value}</Text></View>;
  return <ScreenFrame>
  <AppHeader title={title}/>
  <ScrollView contentContainerStyle={styles.content} refreshControl={<BrandRefreshControl refreshing={refreshing} onRefresh={() => void load(true)}/>}>
   {loading ? <LoadingState message="جارٍ تحميل بيانات المبيعات…"/> : error ? <ErrorState title="تعذر تحميل البيانات" description={error} onAction={() => void load(true)}/> : null}
   {!loading && !error && (mode === 'analytics' || mode === 'overview') && dashboard ? <>
    <SectionCard><Text style={styles.heading}>ملخص الأداء · هذا الشهر</Text><View style={styles.metrics}>
     {metric('إجمالي الإيرادات', money(dashboard.summary.totalRevenue))}{metric('صافي الربح', money(dashboard.summary.netProfit))}{metric('المبالغ المحصّلة', money(dashboard.summary.totalPaid))}{metric('المبالغ المستحقة لهذا الشهر', money(dashboard.summary.totalDue), true)}{metric('عدد عمليات البيع', formatNumber(dashboard.summary.salesCount))}{metric('الكمية الصافية بعد المرتجعات', formatNumber(dashboard.summary.quantity))}
    </View></SectionCard>
    <SectionCard><Text style={styles.heading}>مقارنة الفترة السابقة</Text><View style={styles.metrics}>{metric('الإيراد الحالي', money(dashboard.compare.current.totalRevenue))}{metric('الإيراد السابق', money(dashboard.compare.previous.totalRevenue))}{metric('نسبة التغير', dashboard.compare.revenueChangePercentage == null ? 'غير متاح' : `${dashboard.compare.revenueChangePercentage.toFixed(1)}%`)}{metric('الديون المتأخرة حاليًا', money(dashboard.debt.overdueDue), true)}</View></SectionCard>
    <SectionCard><Text style={styles.heading}>أفضل المنتجات · كل الفترة</Text>{dashboard.topProducts.length ? dashboard.topProducts.slice(0, 8).map((item, index) => <View key={`${item.productId ?? item.title}:${index}`} style={styles.row}><Text style={styles.rowMain}>{item.title}</Text><Text style={styles.rowMeta}>{formatNumber(item.quantity)} · {money(item.revenue)}</Text></View>) : <Text style={styles.muted}>لا توجد بيانات منتجات كافية.</Text>}</SectionCard>
    <SectionCard><Text style={styles.heading}>المنتجات منخفضة المخزون حاليًا</Text>{dashboard.lowStock.length ? dashboard.lowStock.slice(0, 8).map(item => <View key={item.id} style={styles.row}><Text style={styles.rowMain}>{item.name}</Text><Text style={styles.danger}>{item.stockQuantity ?? 'غير محدد'}</Text></View>) : <Text style={styles.muted}>لا توجد منتجات منخفضة المخزون.</Text>}</SectionCard>
   </> : null}
   {!loading && !error && mode === 'reports' ? <>
    <SectionCard><Text style={styles.heading}>تصفية التقرير</Text><DatePickerField label="من تاريخ" value={from} onChange={setFrom} /><DatePickerField label="إلى تاريخ" value={to} onChange={setTo} /><Text style={styles.label}>حالة الدفع</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{STATUS.map(item => <Pressable accessibilityRole="button" key={item.value || 'all'} onPress={() => setStatus(item.value)} style={[styles.filter, status === item.value && styles.filterActive]}><Text style={[styles.filterText, status === item.value && styles.filterTextActive]}>{item.label}</Text></Pressable>)}</ScrollView><Pressable accessibilityRole="button" onPress={() => {
        const validDate = (value: string) => {
          if (!value)
            return true;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
            return false;
          const parsed = new Date(`${value}T00:00:00.000Z`);
          return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
        };
        if (!validDate(from) || !validDate(to) || (from && to && from > to)) {
          setActionError('أدخل تاريخًا صحيحًا بصيغة YYYY-MM-DD، وتأكد أن تاريخ البداية لا يتجاوز تاريخ النهاية.');
          return;
        }
        setActionError('');
        setReportPage(1);
        setAppliedFilters({
          from, to, status
        });
      }} style={styles.primary}><Text style={styles.primaryText}>تطبيق الفلاتر</Text></Pressable></SectionCard>
    {report ? <><SectionCard><Text style={styles.heading}>إجماليات التقرير</Text><View style={styles.metrics}>{metric('الإيراد', money(report.totals.revenue))}{metric('التكلفة', money(report.totals.cost))}{metric('الربح', money(report.totals.profit))}{metric('المدفوع', money(report.totals.paid))}{metric('المتبقي', money(report.totals.due), true)}{metric('المسترد', money(report.totals.refunded))}</View><Text style={styles.muted}>الصفحة {report.page ?? reportPage} · عرض {report.count} عملية من أصل {report.totalCount ?? report.count} عملية.</Text><Pressable accessibilityRole="button" disabled={exporting} onPress={() => void exportCsv()} style={[styles.primary, exporting && { opacity: 0.6 }]}><Text style={styles.primaryText}>{exporting ? 'جارٍ تجهيز CSV…' : 'مشاركة التقرير بصيغة CSV'}</Text></Pressable><Text style={styles.muted}>تصدير الموبايل يشارك بيانات CSV كنص عبر قائمة المشاركة، وبحد أقصى 1000 عملية في المرة الواحدة.</Text></SectionCard><SectionCard><Text style={styles.heading}>تفاصيل العمليات</Text>{report.rows.length ? report.rows.map(row => <View key={row.id} style={styles.reportRow}><Text style={styles.rowMain}>{row.title}</Text><Text style={styles.rowMeta}>{row.buyerName} · {formatDate(row.soldAt, 'date')}</Text><View style={styles.rowBetween}><Text style={styles.rowMeta}>الإيراد {money(row.revenue)}</Text><Text style={styles.rowMeta}>الربح {money(row.profit)}</Text></View></View>) : <Text style={styles.muted}>لا توجد عمليات ضمن الفلاتر.</Text>}<View style={styles.rowBetween}>{reportPage > 1 ? <Pressable accessibilityRole="button" onPress={() => setReportPage((page) => Math.max(1, page - 1))} style={styles.filter}><Text style={styles.filterText}>الصفحة السابقة</Text></Pressable> : <View/>}{report.hasMore ? <Pressable accessibilityRole="button" onPress={() => setReportPage((page) => page + 1)} style={styles.filter}><Text style={styles.filterText}>الصفحة التالية</Text></Pressable> : null}</View></SectionCard></> : null}
   </> : null}
   {!loading && !error && mode === 'smart' && smart ? <>
    <SectionCard><Text style={styles.heading}>مؤشرات آخر {smart.periodDays} يومًا</Text><View style={styles.metrics}>{metric('الإيرادات', money(smart.kpis.revenue))}{metric('التغير', `${smart.kpis.revenueChange.toFixed(1)}%`)}{metric('عدد المبيعات', formatNumber(smart.kpis.orders))}{metric('متوسط الفاتورة', money(smart.kpis.averageTicket))}{metric('الديون المتأخرة', money(smart.kpis.overdueAmount), true)}{metric('مخزون منخفض', formatNumber(smart.kpis.lowStockProducts))}</View></SectionCard>
    <SectionCard><Text style={styles.heading}>توقع الإيراد خلال 30 يومًا</Text><Text style={styles.forecast}>{money(smart.forecast.next30DaysRevenue)}</Text><Text style={styles.muted}>تقدير إحصائي وليس ضمانًا للمبيعات.</Text></SectionCard>
    <SectionCard><Text style={styles.heading}>التوصيات والملاحظات</Text>{smart.insights.length ? smart.insights.map(item => <View key={item.id} style={styles.reportRow}><Text style={styles.rowMain}>{item.title}</Text><Text style={styles.rowMeta}>{item.body}</Text></View>) : <Text style={styles.muted}>لا توجد ملاحظات ذكية حاليًا.</Text>}</SectionCard>
    <SectionCard><Text style={styles.heading}>أفضل المنتجات</Text>{smart.topProducts.slice(0, 8).map((item, index) => <View key={`${item.title}:${index}`} style={styles.row}><Text style={styles.rowMain}>{item.title}</Text><Text style={styles.rowMeta}>ربح {money(item.profit)} · هامش {item.margin.toFixed(1)}%</Text></View>)}</SectionCard>
   </> : null}
  </ScrollView>
 </ScreenFrame>;
}
const createStyles = (c: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  content: {
    padding: spacing.lg, gap: spacing.md, paddingBottom: insets.formBottom
  }, heading: {
    color: c.ink, fontSize: fontSizes[16], fontWeight: fontWeights.bold, textAlign: 'right', marginBottom: spacing.sm
  }, metrics: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm
  }, metric: {
    flexGrow: 1, width: '47%', minHeight: 78, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, justifyContent: 'center', gap: spacing.sm
  }, metricLabel: {
    color: c.muted, fontSize: fontSizes[11], textAlign: 'right'
  }, metricValue: {
    color: c.ink, fontSize: fontSizes[16], fontWeight: fontWeights.bold, textAlign: 'right'
  }, danger: {
    color: c.danger, fontWeight: fontWeights.bold
  }, muted: {
    color: c.muted, textAlign: 'right', fontSize: fontSizes[12], lineHeight: 19
  }, row: {
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm
  }, rowMain: {
    color: c.ink, fontWeight: fontWeights.bold, flex: 1, textAlign: 'right'
  }, rowMeta: {
    color: c.muted, fontSize: fontSizes[11], textAlign: 'right'
  }, label: {
    color: c.ink, fontSize: fontSizes[12], fontWeight: fontWeights.bold, textAlign: 'right', marginTop: spacing.sm
  }, input: {
    minHeight: 44, borderWidth: 1, borderColor: c.controlBorder, borderRadius: radius.md, paddingHorizontal: spacing.md, color: c.ink, textAlign: 'left'
  }, filters: {
    flexDirection: 'row', gap: spacing.xs, paddingVertical: spacing.sm
  }, filter: {
    minHeight: sizes.touchTarget, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface
  }, filterActive: {
    borderColor: c.brand, backgroundColor: c.brandSoft
  }, filterText: {
    color: c.muted, fontSize: fontSizes[11], fontWeight: fontWeights.bold
  }, filterTextActive: { color: c.brand }, primary: {
    minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: c.brand, marginTop: spacing.sm
  }, primaryText: {
    color: c.onBrand, fontWeight: fontWeights.bold
  }, reportRow: {
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.border, gap: spacing.xs
  }, rowBetween: {
    flexDirection: 'row', justifyContent: 'space-between'
  }, forecast: {
    color: c.brand, fontSize: fontSizes[24], fontWeight: fontWeights.bold, textAlign: 'right'
  },
});
