import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { BrandRefreshControl } from '@/components/ui/BrandRefreshControl';
import { Spinner, ListEmpty, ListStaleError, PaginatedFooter, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/ui';
import { router } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchDebtSummary, fetchDebts, type DebtSummary } from '@/features/sales/sales-extra.api';
import type { SaleRecord } from '@/features/sales/sales.api';
import { fontSizes, spacing, fontWeights } from '@/theme/tokens';
import { formatSafeDate } from '@/lib/date-format';
import { formatMoney } from '@/lib/formatters';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { AppFlashList } from '@/components/ui/AppFlashList';
import { ListGapMd } from '@/components/ui/ListSeparator';

const money = (n: unknown, c = 'ILS') => formatMoney(n, c);

export default function DebtsScreen() {
  const { colors } = useAppTheme();

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
        <PrimaryButton label="تسجيل الدخول" onPress={() => pushOnce('/login')} />
      </PageShell>
    );
  }

  return (
    <PageShell title="الديون والمبالغ المستحقة" scroll={false}>
      <AppFlashList
        data={list.loading && list.items.length === 0 ? [] : list.items}
        keyExtractor={(sale) => sale.id}
        contentContainerStyle={{ paddingBottom: spacing.x4l }}
        refreshControl={<BrandRefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} />}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <Notice tone="muted">
              هذه الديون تخص مبيعاتك المسجلة في النظام، وليست ديون طلبات المتجر أو طلبات الخدمات.
            </Notice>
            {visibleSummary ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
                {(
                  [
                    ['إجمالي المستحق', money(visibleSummary.totalDue)],
                    ['متأخر', money(visibleSummary.overdueDue)],
                    ['مستحق اليوم', money(visibleSummary.dueToday)],
                    ['عدد المبيعات المدينة', String(visibleSummary.debtorCount)],
                  ] as const
                ).map(([l, v]) => (
                  <SectionCard key={l}>
                    <Text tone="muted" size={12}>{l}</Text>
                    <Text
                      style={{
                        textAlign: 'right',
                        fontSize: fontSizes[20],
                        fontWeight: fontWeights.bold,
                        color: l === 'متأخر' ? colors.danger : colors.ink,
                      }}
                    >
                      {v}
                    </Text>
                  </SectionCard>
                ))}
              </View>
            ) : null}
            {summaryLoading ? <Spinner color={colors.brand} /> : null}
            {summaryError ? <View style={{ gap: spacing.xs }}><Notice>{summaryError}</Notice><PrimaryButton label="إعادة تحميل الملخص" variant="secondary" onPress={() => void loadSummary()} /></View> : null}<ListStaleError list={list} />
          </View>
        }
        ListEmptyComponent={<ListEmpty list={list} loadingMessage="جاري تحميل الديون…" errorTitle="تعذر تحميل الديون" emptyTitle="لا توجد مبالغ مستحقة حاليًا" />}
        renderItem={({ item: sale }) => (
          <Pressable accessibilityRole="button" onPress={() => pushOnce({ pathname: '/sales/[id]', params: { id: sale.id } })}>
            <SectionCard>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                <Text style={{ flex: 1, textAlign: 'right', fontWeight: fontWeights.bold, fontSize: fontSizes[15], color: colors.ink }}>
                  {sale.entityTitle}
                </Text>
                <Text style={{ fontWeight: fontWeights.bold, color: colors.danger }}>
                  {money(sale.dueAmount, sale.currency)}
                </Text>
              </View>
              <Text tone="muted">
                العميل: {sale.buyerName} · الفاتورة: {sale.invoiceNumber || 'بدون رقم'}
              </Text>
              <Text tone="muted">
                تاريخ الاستحقاق:{' '}
                {sale.dueDate ? formatSafeDate(sale.dueDate, 'date') : 'غير محدد'}
              </Text>
              <Text tone="brand" strong>عرض تفاصيل البيع ←</Text>
            </SectionCard>
          </Pressable>
        )}
        ItemSeparatorComponent={ListGapMd}
        ListFooterComponent={
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            <PaginatedFooter list={list} />
            <PrimaryButton label="إدارة الأقساط" onPress={() => router.push('/installments')} variant="secondary" />
            <PrimaryButton label="العودة إلى مبيعاتي" onPress={() => router.push('/my-sales')} variant="secondary" />
          </View>
        }
      />
    </PageShell>
  );
}
