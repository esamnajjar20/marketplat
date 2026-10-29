import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchDebtSummary, fetchDebts, type DebtSummary } from '@/features/sales/sales-extra.api';
import type { SaleRecord } from '@/features/sales/sales.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { colors, spacing } from '@/theme/tokens';
import { marketListPerf } from '@/lib/listPerformance';

const money = (n: unknown, c = 'ILS') =>
  `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(Number(n) || 0)} ${c === 'ILS' ? '₪' : c}`;

export default function DebtsScreen() {
  const { accessToken, user, isRestoring } = useAuth();
  const [summary, setSummary] = useState<DebtSummary | null>(null);
  const [items, setItems] = useState<SaleRecord[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    const current = ++seq.current;
    setLoading(true);
    setError('');
    try {
      const [sR, dR] = await Promise.allSettled([
        fetchDebtSummary(accessToken),
        fetchDebts(1, accessToken),
      ]);
      if (current !== seq.current) return;
      if (sR.status === 'fulfilled') setSummary(sR.value);
      if (dR.status === 'fulfilled') {
        setItems(dR.value.rows);
        setPage(dR.value.page);
        setHasMore(dR.value.hasNextPage);
      }
      if (sR.status === 'rejected' && dR.status === 'rejected') setError('تعذر تحميل الديون.');
      else if (sR.status === 'rejected') setError('تعذر تحميل ملخص الديون.');
      else if (dR.status === 'rejected') setError('تعذر تحميل قائمة الديون.');
    } catch (e) {
      if (current === seq.current) setError(e instanceof Error ? e.message : 'تعذر تحميل الديون.');
    } finally {
      if (current === seq.current) setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!isRestoring) void load();
    return () => {
      seq.current += 1;
    };
  }, [isRestoring, load]);

  const loadMore = async () => {
    if (!accessToken || more || !hasMore) return;
    const current = seq.current;
    setMore(true);
    try {
      const d = await fetchDebts(page + 1, accessToken);
      if (current !== seq.current) return;
      setItems((old) => [...old, ...d.rows.filter((x) => !old.some((y) => y.id === x.id))]);
      setPage(d.page);
      setHasMore(d.hasNextPage);
    } catch (e) {
      if (current === seq.current) setError(e instanceof Error ? e.message : 'تعذر تحميل المزيد.');
    } finally {
      setMore(false);
    }
  };

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
        data={loading && items.length === 0 ? [] : items}
        keyExtractor={(sale) => sale.id}
        {...marketListPerf}
        contentContainerStyle={{ paddingBottom: 48, gap: spacing.md }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <Notice tone="muted">
              هذه الديون تخص مبيعاتك المسجلة في النظام، وليست ديون طلبات المتجر أو طلبات الخدمات.
            </Notice>
            {summary ? (
              <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 }}>
                {(
                  [
                    ['إجمالي المستحق', money(summary.totalDue)],
                    ['متأخر', money(summary.overdueDue)],
                    ['مستحق اليوم', money(summary.dueToday)],
                    ['عدد المبيعات المدينة', String(summary.debtorCount)],
                  ] as const
                ).map(([l, v]) => (
                  <SectionCard key={l}>
                    <Text style={{ textAlign: 'right', fontSize: 12, color: colors.muted }}>{l}</Text>
                    <Text
                      style={{
                        textAlign: 'right',
                        fontSize: 20,
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
            {loading ? <ActivityIndicator color={colors.brand} /> : null}
            {error ? <Notice>{error}</Notice> : null}
          </View>
        }
        ListEmptyComponent={
          !loading && !error ? <Notice tone="success">لا توجد مبالغ مستحقة حاليًا.</Notice> : null
        }
        renderItem={({ item: sale }) => (
          <Pressable onPress={() => router.push({ pathname: '/sales/[id]', params: { id: sale.id } })}>
            <SectionCard>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ flex: 1, textAlign: 'right', fontWeight: '900', fontSize: 15, color: colors.ink }}>
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
                {sale.dueDate ? new Date(sale.dueDate).toLocaleDateString('ar') : 'غير محدد'}
              </Text>
              <Text style={{ textAlign: 'right', fontWeight: '800', color: colors.brand }}>عرض تفاصيل البيع ←</Text>
            </SectionCard>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListFooterComponent={
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            {hasMore ? (
              <PrimaryButton label="تحميل المزيد" onPress={() => void loadMore()} busy={more} variant="secondary" />
            ) : null}
            <PrimaryButton label="إدارة الأقساط" onPress={() => router.push('/installments')} variant="secondary" />
            <PrimaryButton label="العودة إلى مبيعاتي" onPress={() => router.push('/my-sales')} variant="secondary" />
          </View>
        }
      />
    </PageShell>
  );
}
