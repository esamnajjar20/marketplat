import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchDebtSummary, fetchDebts, type DebtSummary } from '@/features/sales/sales-extra.api';
import type { SaleRecord } from '@/features/sales/sales.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { fontSizes, colors, spacing } from '@/theme/tokens';
import { marketListPerf } from '@/lib/listPerformance';
import { formatSafeDate } from '@/lib/date-format';
import { formatMoney } from '@/lib/formatters';
import { usePaginatedList } from '@/hooks/usePaginatedList';

const money = (n: unknown, c = 'ILS') => formatMoney(n, c);

export default function DebtsScreen() {
  const { accessToken, user, isRestoring } = useAuth();
  const userId = user?.id;
  const [summary, setSummary] = useState<DebtSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState('');
  const [summaryOwnerId, setSummaryOwnerId] = useState<string | null>(null);
  const visibleSummary = summaryOwnerId === user?.id ? summary : null;
  const summaryControllerRef = useRef<AbortController | null>(null);
  const list = usePaginatedList<SaleRecord>({
    key: `debts:${user?.id ?? 'guest'}`,
    pageSize: 20,
    enabled: Boolean(accessToken && user && !isRestoring),
    fetchPage: async (page, signal) => {
      if (!accessToken) throw new Error('سجّل الدخول لعرض الديون.');
      const result = await fetchDebts(page, accessToken, signal, user?.id);
      return {
        items: result.rows,
        meta: { page: result.page, totalPages: result.totalPages, total: result.totalCount, hasNextPage: result.hasNextPage },
      };
    },
    getItemKey: (sale) => sale.id,
  });

  const loadSummary = useCallback(async () => {
    if (!accessToken || !userId || isRestoring) return;
    summaryControllerRef.current?.abort();
    const controller = new AbortController();
    summaryControllerRef.current = controller;
    setSummaryLoading(true);
    setSummaryError('');
    try {
      const next = await fetchDebtSummary(accessToken, controller.signal, userId);
      if (!controller.signal.aborted) { setSummary(next); setSummaryOwnerId(userId); }
    } catch (error) {
      if (!controller.signal.aborted) setSummaryError(error instanceof Error ? error.message : 'تعذر تحميل ملخص الديون.');
    } finally {
      if (!controller.signal.aborted) {
        setSummaryLoading(false);
        if (summaryControllerRef.current === controller) summaryControllerRef.current = null;
      }
    }
  }, [accessToken, isRestoring, userId]);

  useEffect(() => {
    void loadSummary();
    return () => {
      summaryControllerRef.current?.abort();
      summaryControllerRef.current = null;
    };
  }, [loadSummary]);

  if (!user) {
    return (
      <PageShell title="الديون">
        <Notice>سجّل الدخول لعرض الديون المستحقة لك.</Notice>
        <PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} />
      </PageShell>
    );
  }

  return (
    <PageShell title="الديون والمبالغ المستحقة" scroll={false}>
      <FlatList
        data={list.loading && list.items.length === 0 ? [] : list.items}
        keyExtractor={(sale) => sale.id}
        {...marketListPerf}
        contentContainerStyle={{ paddingBottom: 48, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} />}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <Notice tone="muted">
              هذه الديون تخص مبيعاتك المسجلة في النظام، وليست ديون طلبات المتجر أو طلبات الخدمات.
            </Notice>
            {visibleSummary ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {(
                  [
                    ['إجمالي المستحق', money(visibleSummary.totalDue)],
                    ['متأخر', money(visibleSummary.overdueDue)],
                    ['مستحق اليوم', money(visibleSummary.dueToday)],
                    ['عدد المبيعات المدينة', String(visibleSummary.debtorCount)],
                  ] as const
                ).map(([l, v]) => (
                  <SectionCard key={l}>
                    <Text style={{ textAlign: 'right', fontSize: fontSizes[12], color: colors.muted }}>{l}</Text>
                    <Text
                      style={{
                        textAlign: 'right',
                        fontSize: fontSizes[20],
                        fontWeight: '900',
                        color: l === 'متأخر' ? colors.danger : colors.ink,
                      }}
                    >
                      {v}
                    </Text>
                  </SectionCard>
                ))}
              </View>
            ) : null}
            {list.loading || summaryLoading ? <ActivityIndicator color={colors.brand} /> : null}
            {summaryError ? <View style={{ gap: spacing.xs }}><Notice>{summaryError}</Notice><PrimaryButton label="إعادة تحميل الملخص" variant="secondary" onPress={() => void loadSummary()} /></View> : null}{list.error ? <Notice>{list.error}</Notice> : null}
          </View>
        }
        ListEmptyComponent={list.error ? <View style={{ gap: spacing.sm }}><Notice>{list.error}</Notice><PrimaryButton label="إعادة المحاولة" variant="secondary" onPress={() => void list.retry()} /></View> : !list.loading ? <Notice tone="success">لا توجد مبالغ مستحقة حاليًا.</Notice> : undefined}
        renderItem={({ item: sale }) => (
          <Pressable onPress={() => router.push({ pathname: '/sales/[id]', params: { id: sale.id } })}>
            <SectionCard>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ flex: 1, textAlign: 'right', fontWeight: '900', fontSize: fontSizes[15], color: colors.ink }}>
                  {sale.entityTitle}
                </Text>
                <Text style={{ fontWeight: '900', color: colors.danger }}>
                  {money(sale.dueAmount, sale.currency)}
                </Text>
              </View>
              <Text style={{ textAlign: 'right', color: colors.muted }}>
                العميل: {sale.buyerName} · الفاتورة: {sale.invoiceNumber || 'بدون رقم'}
              </Text>
              <Text style={{ textAlign: 'right', color: colors.muted }}>
                تاريخ الاستحقاق:{' '}
                {sale.dueDate ? formatSafeDate(sale.dueDate, 'date') : 'غير محدد'}
              </Text>
              <Text style={{ textAlign: 'right', fontWeight: '800', color: colors.brand }}>عرض تفاصيل البيع ←</Text>
            </SectionCard>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListFooterComponent={
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            {list.loadMoreError ? <Notice>{list.loadMoreError}</Notice> : null}
            {list.hasNextPage || list.loadMoreError ? (
              <PrimaryButton label={list.loadMoreError ? 'إعادة المحاولة' : 'تحميل المزيد'} onPress={() => void (list.loadMoreError ? list.retry() : list.loadMore())} busy={list.loadingMore} variant="secondary" />
            ) : null}
            <PrimaryButton label="إدارة الأقساط" onPress={() => router.push('/installments')} variant="secondary" />
            <PrimaryButton label="العودة إلى مبيعاتي" onPress={() => router.push('/my-sales')} variant="secondary" />
          </View>
        }
      />
    </PageShell>
  );
}
