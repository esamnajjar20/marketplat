import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { AppHeader, EmptyState, ErrorState, LoadingState, PageShell } from '@/components/ui';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { BrandRefreshControl } from '@/components/ui/BrandRefreshControl';
import { ScreenFrame } from '@/components/ui/ScreenFrame';

import { pushOnce } from '@/lib/navigation';
import { fontSizes, radius, spacing, fontWeights, insets } from '@/theme/tokens';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchSales, fetchSalesSummary, type SalePaymentStatus, type SaleRecord, type SalesPeriod, type SalesSummary } from '@/features/sales/sales.api';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { formatDate, formatMoney, formatNumber } from '@/lib/formatters';
import { AppFlashList } from '@/components/ui/AppFlashList';
import { ListGapLg } from '@/components/ui/ListSeparator';
const periodOptions: {
    value: SalesPeriod;
    label: string;
}[] = [
    {
        value: 'day', label: 'اليوم'
    },
    {
        value: 'week', label: 'أسبوع'
    },
    {
        value: 'month', label: 'شهر'
    },
    {
        value: 'year', label: 'سنة'
    },
];
const statusOptions: {
    value: SalePaymentStatus | 'ALL';
    label: string;
}[] = [
    {
        value: 'ALL', label: 'الكل'
    },
    {
        value: 'PAID', label: 'مدفوعة'
    },
    {
        value: 'PARTIAL', label: 'مدفوعة جزئيًا'
    },
    {
        value: 'UNPAID', label: 'غير مدفوعة'
    },
    {
        value: 'OVERDUE', label: 'متأخرة'
    },
];
const statusLabel: Record<SalePaymentStatus, string> = {
    PAID: 'مدفوعة', PARTIAL: 'مدفوعة جزئيًا', UNPAID: 'غير مدفوعة', OVERDUE: 'متأخرة'
};
const money = (value: unknown, currency = 'ILS') => formatMoney(value, currency);
const dateLabel = (value: string) => formatDate(value, 'date');
export default function MySalesScreen() {
    const { colors } = useAppTheme();
    const s = useMemo(() => createThemeS(colors), [colors]);
    const { accessToken, isRestoring, user } = useAuth();
    const userId = user?.id;
    const [period, setPeriod] = useState<SalesPeriod>('month');
    const [status, setStatus] = useState<SalePaymentStatus | 'ALL'>('ALL');
    const [summary, setSummary] = useState<SalesSummary | null>(null);
    const [summaryLoading, setSummaryLoading] = useState(true);
    const [summaryError, setSummaryError] = useState('');
    const [summaryOwnerId, setSummaryOwnerId] = useState<string | null>(null);
    const visibleSummary = summaryOwnerId === user?.id ? summary : null;
    const [refreshingSummary, setRefreshingSummary] = useState(false);
    const summaryControllerRef = useRef<AbortController | null>(null);
    const list = usePaginatedList<SaleRecord>({
        key: `sales:${user?.id ?? 'guest'}:${status}`,
        pageSize: 15,
        enabled: Boolean(accessToken && user && !isRestoring),
        fetchPage: async (page, signal) => {
            if (!accessToken)
                throw new Error('سجّل الدخول لعرض مبيعاتك.');
            const result = await fetchSales(accessToken, page, status === 'ALL' ? undefined : status, user?.id, signal);
            return {
                items: result.items, meta: result.meta
            };
        },
        getItemKey: (sale) => sale.id,
    });
    const loadSummary = useCallback(async (refresh = false) => {
        if (!accessToken || !userId || isRestoring)
            return;
        summaryControllerRef.current?.abort();
        const controller = new AbortController();
        summaryControllerRef.current = controller;
        if (refresh)
            setRefreshingSummary(true);
        else
            setSummaryLoading(true);
        setSummaryError('');
        try {
            const next = await fetchSalesSummary(period, accessToken, userId, controller.signal);
            if (!controller.signal.aborted) {
                setSummary(next);
                setSummaryOwnerId(userId);
            }
        }
        catch (error) {
            if (!controller.signal.aborted)
                setSummaryError(error instanceof Error ? error.message : 'تعذر تحميل ملخص المبيعات.');
        }
        finally {
            if (!controller.signal.aborted) {
                setSummaryLoading(false);
                setRefreshingSummary(false);
                if (summaryControllerRef.current === controller)
                    summaryControllerRef.current = null;
            }
        }
    }, [
        accessToken, isRestoring, period, userId
    ]);
    useEffect(() => {
        void loadSummary();
        return () => {
            summaryControllerRef.current?.abort();
            summaryControllerRef.current = null;
        };
    }, [loadSummary]);
    const refreshList = list.refresh;
    const refreshAll = useCallback(async () => {
        await Promise.all([refreshList(), loadSummary(true)]);
    }, [refreshList, loadSummary]);
    if (!user)
        return <PageShell title="مبيعاتي"><EmptyState title="مبيعاتي" description="سجّل الدخول لعرض سجل مبيعاتك." actionLabel="تسجيل الدخول" onAction={() => pushOnce('/login')}/></PageShell>;
    return <ScreenFrame><AppHeader title="مبيعاتي"/><AppFlashList ItemSeparatorComponent={ListGapLg} data={list.items} keyExtractor={(sale) => sale.id} contentContainerStyle={s.content} refreshControl={<BrandRefreshControl refreshing={list.refreshing || refreshingSummary} onRefresh={() => void refreshAll()} />} ListHeaderComponent={<>
    
    <Text style={s.subtitle}>سجل عمليات البيع والمدفوعات والمبالغ المستحقة.</Text>
    <Text style={s.sectionTitle}>ملخص المبيعات</Text>
    <View style={s.segmentRow}>{periodOptions.map(option => <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: period === option.value }} onPress={() => setPeriod(option.value)} style={[s.segment, period === option.value && s.segmentActive]}><Text style={[s.segmentText, period === option.value && s.segmentTextActive]}>{option.label}</Text></Pressable>)}</View>
    {list.loading || summaryLoading || isRestoring ? <LoadingState message="جاري تحميل المبيعات…"/> : summaryError && !visibleSummary ? <View style={s.state}><Text style={s.error}>{summaryError}</Text><Pressable accessibilityRole="button" onPress={() => void loadSummary(true)} style={s.primary}><Text style={s.primaryText}>إعادة المحاولة</Text></Pressable></View> : <>
      {visibleSummary ? <View style={s.metrics}>
        <View style={s.metric}><Text style={s.metricLabel}>إجمالي الإيرادات</Text><Text style={s.metricValue}>{money(visibleSummary.totalRevenue)}</Text></View>
        <View style={s.metric}><Text style={s.metricLabel}>المبالغ المحصّلة</Text><Text style={s.metricValue}>{money(visibleSummary.totalPaid)}</Text></View>
        <View style={s.metric}><Text style={s.metricLabel}>المبالغ المستحقة</Text><Text style={[s.metricValue, s.dueValue]}>{money(visibleSummary.totalDue)}</Text></View>
        <View style={s.metric}><Text style={s.metricLabel}>عدد عمليات البيع</Text><Text style={s.metricValue}>{formatNumber(visibleSummary.salesCount)}</Text></View>
        <View style={s.metric}><Text style={s.metricLabel}>صافي الربح التقديري</Text><Text style={s.metricValue}>{money(visibleSummary.netProfit)}</Text></View>
        <View style={s.metric}><Text style={s.metricLabel}>المبالغ المستردة</Text><Text style={s.metricValue}>{money(visibleSummary.totalRefunded)}</Text></View>
      </View> : null}
      <View style={s.listHeading}><Text style={s.sectionTitle}>سجل عمليات البيع</Text><Text style={s.count}>{list.items.length ? `المعروض ${list.items.length}` : 'لا توجد نتائج'}</Text></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>{statusOptions.map(option => <Pressable key={option.value} accessibilityRole="button" accessibilityLabel={`فلتر الحالة: ${option.label}`} accessibilityState={{ selected: status === option.value }} onPress={() => setStatus(option.value)} style={[s.filter, status === option.value && s.filterActive]}><Text style={[s.filterText, status === option.value && s.filterTextActive]}>{option.label}</Text></Pressable>)}</ScrollView>
      {summaryError ? <Text style={s.error}>{summaryError}</Text> : null}{list.error ? <Pressable accessibilityRole="button" onPress={() => void list.retry()}><Text style={s.error}>{list.error} — إعادة المحاولة</Text></Pressable> : null}
      </>}
ListEmptyComponent={list.error ? <ErrorState title="تعذر تحميل المبيعات" description={list.error} onAction={() => void list.retry()} /> : <EmptyState title="لا توجد مبيعات هنا بعد" description="ستظهر عمليات البيع المسجلة في حسابك في هذه القائمة." />}
renderItem={({ item: sale }: {
                item: SaleRecord;
            }) => (<View style={s.saleCard}>
        <View style={s.saleTop}><Text style={s.saleTotal}>{money(sale.totalPrice, sale.currency)}</Text><Text style={[s.status, sale.paymentStatus === 'OVERDUE' && s.statusDanger, sale.paymentStatus === 'PAID' && s.statusPaid]}>{statusLabel[sale.paymentStatus] || sale.paymentStatus}</Text></View>
        <Text style={s.saleName}>{sale.entityTitle}</Text>
        <Text style={s.saleMeta}>العميل: {sale.buyerName}{sale.invoiceNumber ? ` · فاتورة ${sale.invoiceNumber}` : ''}</Text>
        <Text style={s.saleMeta}>التاريخ: {dateLabel(sale.soldAt)} · الكمية: {sale.quantity}</Text>
        <View style={s.amountRow}><Text style={s.amountLabel}>المحصّل: {money(sale.paidAmount, sale.currency)}</Text><Text style={[s.amountLabel, Number(sale.dueAmount) > 0 && s.dueValue]}>المتبقي: {money(sale.dueAmount, sale.currency)}</Text></View>
      </View>)}
ListFooterComponent={<>
      {list.hasNextPage ? <Pressable accessibilityRole="button" disabled={list.loadingMore || list.loading} onPress={() => void list.loadMore()} style={[s.moreButton, (list.loadingMore || list.loading) && s.disabled]}><Text style={s.moreText}>{list.loadingMore ? 'جاري التحميل…' : 'تحميل المزيد'}</Text></Pressable> : null}{list.loadMoreError ? <Pressable accessibilityRole="button" onPress={() => void list.retry()}><Text style={s.error}>{list.loadMoreError} — إعادة المحاولة</Text></Pressable> : null}
      <Text style={s.sectionTitle}>أدوات إدارة المبيعات</Text>
      <View style={{
                flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm
            }}>
        {([
                ['/debts', 'الديون والمستحقات'], ['/installments', 'الأقساط'], ['/customers', 'عملائي'], ['/activity', 'سجل النشاط']
            ] as const).map(([path, label]) => <Pressable key={path} accessibilityRole="button" accessibilityLabel={label} onPress={() => pushOnce(path)} style={{
                flexGrow: 1, minWidth: '46%', minHeight: 44, justifyContent: 'center', padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.controlBorder
            }}><Text style={{
                textAlign: 'center', color: colors.brand, fontWeight: fontWeights.bold
            }}>{label}</Text></Pressable>)}
      </View>
      <Text style={s.footnote}>الملخص للفترة المحددة، بينما سجل العمليات يعرض أحدث المبيعات المطابقة للفلتر.</Text>
    </>}
  </>}/></ScreenFrame>;
}
const createThemeS = (colors: ColorPalette) => StyleSheet.create({ content: {
        padding: spacing.lg, paddingBottom: insets.pageBottom
    }, subtitle: {
        fontSize: fontSizes[12], color: colors.muted, textAlign: 'right', lineHeight: 19
    }, sectionTitle: {
        fontSize: fontSizes[16], fontWeight: fontWeights.bold, color: colors.ink, textAlign: 'right'
    },
    segmentRow: {
        flexDirection: 'row', gap: spacing.sm, padding: spacing.xs, borderRadius: radius.lg, backgroundColor: colors.brandSoft
    }, segment: {
        flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.controlBorder, backgroundColor: colors.surface
    }, segmentActive: {
        backgroundColor: colors.brand, borderColor: colors.brand
    }, segmentText: {
        color: colors.muted, fontSize: fontSizes[12], fontWeight: fontWeights.bold
    }, segmentTextActive: { color: colors.onBrand },
    metrics: {
        flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm
    }, metric: {
        width: '48%', flexGrow: 1, minHeight: 104, justifyContent: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border
    }, metricLabel: {
        fontSize: fontSizes[12], color: colors.muted, textAlign: 'right'
    }, metricValue: {
        fontSize: fontSizes[17], fontWeight: fontWeights.bold, color: colors.ink, textAlign: 'right'
    }, dueValue: { color: colors.danger },
    listHeading: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm
    }, count: {
        fontSize: fontSizes[12], color: colors.muted
    }, filterRow: {
        flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xxs
    }, filter: {
        minHeight: 44, minWidth: 44, justifyContent: 'center', borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radius.pill, backgroundColor: colors.surface, paddingHorizontal: 13, paddingVertical: spacing.sm
    }, filterActive: {
        backgroundColor: colors.brandSoft, borderColor: colors.brand
    }, filterText: {
        color: colors.muted, fontSize: fontSizes[12], fontWeight: fontWeights.bold
    }, filterTextActive: { color: colors.brandOnSoft },
    saleCard: {
        backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md
    }, saleTop: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm
    }, saleTotal: {
        color: colors.brand, fontSize: fontSizes[17], fontWeight: fontWeights.bold
    }, status: {
        overflow: 'hidden', borderRadius: radius.pill, backgroundColor: colors.warningSoft, color: colors.warningText, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, fontSize: fontSizes[11], fontWeight: fontWeights.bold
    }, statusPaid: {
        backgroundColor: colors.successSoft, color: colors.brandOnSoft
    }, statusDanger: {
        backgroundColor: colors.dangerSoft, color: colors.danger
    }, saleName: {
        color: colors.ink, fontSize: fontSizes[15], fontWeight: fontWeights.bold, textAlign: 'right'
    }, saleMeta: {
        color: colors.muted, fontSize: fontSizes[12], textAlign: 'right', lineHeight: 18
    }, amountRow: {
        flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginTop: spacing.xxs
    }, amountLabel: {
        color: colors.muted, fontSize: fontSizes[12], fontWeight: fontWeights.bold
    },
    state: {
        alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg
    }, emptyTitle: {
        fontSize: fontSizes[16], fontWeight: fontWeights.bold, color: colors.ink
    }, muted: {
        fontSize: fontSizes[13], color: colors.muted, textAlign: 'center', lineHeight: 20
    }, error: {
        color: colors.danger, textAlign: 'right', fontSize: fontSizes[13]
    }, primary: {
        backgroundColor: colors.brand, borderRadius: radius.md, padding: spacing.md
    }, primaryText: {
        color: colors.onBrand, fontWeight: fontWeights.bold
    }, moreButton: {
        alignItems: 'center', padding: spacing.md, borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md
    }, moreText: {
        color: colors.brand, fontWeight: fontWeights.bold
    }, disabled: { opacity: .6 }, footnote: {
        fontSize: fontSizes[11], color: colors.muted, textAlign: 'right', lineHeight: 18
    },
});
