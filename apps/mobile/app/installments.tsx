import { useAppTheme } from '@/theme/ThemeProvider';
import { formatMoney } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchInstallments, payInstallment, type InstallmentRow } from '@/features/sales/sales-extra.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { fontSizes, spacing } from '@/theme/tokens';
import { marketListPerf } from '@/lib/listPerformance';
import { ApiError } from '@/api/client';
import { createMobileOperationId } from '@/lib/operation-id';
import { normalizeNumericInput } from '@/lib/normalize-numeric-input';
import { formatSafeDate } from '@/lib/date-format';

const money = (n: unknown) =>
  formatMoney(Number(n) || 0);

export default function InstallmentsScreen() {
  const { colors } = useAppTheme();

  const { accessToken, csrfToken, user, isRestoring } = useAuth();
  const [kind, setKind] = useState<'upcoming' | 'overdue'>('upcoming');
  const [items, setItems] = useState<InstallmentRow[]>([]);
  const [itemsKey, setItemsKey] = useState('');
  const listKey = `${user?.id ?? 'guest'}:${kind}`;
  const visibleItems = itemsKey === listKey ? items : [];
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const paymentOperationsRef = useRef<Record<string, { amount: number; id: string }>>({});
  const loadControllerRef = useRef<AbortController | null>(null);
  const loadRequestRef = useRef(0);

  const load = useCallback(async () => {
    loadControllerRef.current?.abort();
    const controller = new AbortController();
    loadControllerRef.current = controller;
    const requestId = ++loadRequestRef.current;
    if (!accessToken || !user?.id) {
      setItems([]);
      setItemsKey('');
      setAmounts({});
      paymentOperationsRef.current = {};
      setError('');
      setLoading(false);
      loadControllerRef.current = null;
      return;
    }
    setLoading(true);
    setError('');
    try {
      const next = await fetchInstallments(kind, accessToken, user.id, controller.signal);
      if (!controller.signal.aborted && requestId === loadRequestRef.current) {
        setItems(next);
        setItemsKey(`${user.id}:${kind}`);
      }
    } catch (e) {
      if (!controller.signal.aborted && requestId === loadRequestRef.current) {
        setError(e instanceof Error ? e.message : 'تعذر تحميل الأقساط.');
      }
    } finally {
      if (!controller.signal.aborted && requestId === loadRequestRef.current) {
        setLoading(false);
        if (loadControllerRef.current === controller) loadControllerRef.current = null;
      }
    }
  }, [accessToken, kind, user?.id]);

  useEffect(() => {
    if (!isRestoring) void load();
    return () => {
      loadRequestRef.current += 1;
      loadControllerRef.current?.abort();
      loadControllerRef.current = null;
    };
  }, [isRestoring, load]);

  useEffect(() => {
    setAmounts({});
    paymentOperationsRef.current = {};
  }, [user?.id]);

  const collect = async (item: InstallmentRow) => {
    if (!accessToken) return;
    const remaining = Math.round((Number(item.amount) - Number(item.paidAmount)) * 100) / 100;
    const amount = Number(amounts[item.id] ?? String(remaining));
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining) {
      setError(`أدخل مبلغًا أكبر من صفر ولا يتجاوز ${money(remaining)}.`);
      return;
    }
    Alert.alert('تأكيد تحصيل القسط', `تسجيل دفعة بقيمة ${money(amount)}؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'تأكيد',
        onPress: () => {
          setBusyId(item.id);
          setError('');
          setMessage('');
          const existing = paymentOperationsRef.current[item.id];
          const operation = existing?.amount === amount
            ? existing
            : { amount, id: createMobileOperationId(`installment-${item.id}`) };
          paymentOperationsRef.current[item.id] = operation;
          void payInstallment(item.id, amount, accessToken, csrfToken, operation.id, user?.id)
            .then(() => {
              delete paymentOperationsRef.current[item.id];
              setMessage('تم تسجيل الدفعة بنجاح.');
              setAmounts((old) => ({ ...old, [item.id]: '' }));
              return load();
            })
            .catch((e) => {
              if (e instanceof ApiError && e.status !== undefined && e.status >= 400 && e.status < 500) {
                delete paymentOperationsRef.current[item.id];
              }
              setError(e instanceof Error ? e.message : 'تعذر تسجيل الدفعة.');
            })
            .finally(() => setBusyId(''));
        },
      },
    ]);
  };

  if (!user) {
    return (
      <PageShell title="الأقساط">
        <Notice>سجّل الدخول لإدارة الأقساط.</Notice>
        <PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} />
      </PageShell>
    );
  }

  return (
    <PageShell title="الأقساط" scroll={false}>
      <FlatList
        data={loading && visibleItems.length === 0 ? [] : visibleItems}
        keyExtractor={(item) => item.id}
        {...marketListPerf}
        contentContainerStyle={{ paddingBottom: 48, gap: spacing.md }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <Notice tone="muted">
              تعرض الصفحة الأقساط المرتبطة بمبيعاتك. سجّل فقط المبلغ الذي استلمته فعليًا من العميل.
            </Notice>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  label="القادمة"
                  variant={kind === 'upcoming' ? 'primary' : 'secondary'}
                  onPress={() => setKind('upcoming')}
                />
              </View>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  label="المتأخرة"
                  variant={kind === 'overdue' ? 'primary' : 'secondary'}
                  onPress={() => setKind('overdue')}
                />
              </View>
            </View>
            {message ? <Notice tone="success">{message}</Notice> : null}
            {error ? <Notice>{error}</Notice> : null}
            {loading ? <ActivityIndicator color={colors.brand} /> : null}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <Notice tone="muted">لا توجد أقساط {kind === 'overdue' ? 'متأخرة' : 'قادمة'}.</Notice>
          ) : undefined
        }
        renderItem={({ item }) => {
          const remaining = Math.max(0, Number(item.amount) - Number(item.paidAmount));
          return (
            <SectionCard>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ flex: 1, textAlign: 'right', fontSize: fontSizes[16], fontWeight: '900', color: colors.ink }}>
                  {item.sale?.entityTitle || `القسط ${item.installmentNo}`}
                </Text>
                <Text
                  style={{
                    fontWeight: '900',
                    color: kind === 'overdue' ? colors.danger : colors.brand,
                  }}
                >
                  {money(remaining)}
                </Text>
              </View>
              <Text style={{ textAlign: 'right', color: colors.muted }}>
                العميل: {item.sale?.customer?.name || item.sale?.buyerName || 'غير محدد'}
              </Text>
              <Text style={{ textAlign: 'right', color: colors.muted }}>
                القسط رقم {item.installmentNo} · الاستحقاق {formatSafeDate(item.dueDate, 'date')}
              </Text>
              <Text style={{ textAlign: 'right', color: colors.muted }}>
                قيمة القسط: {money(item.amount)} · المدفوع: {money(item.paidAmount)}
              </Text>
              <TextInput allowFontScaling maxFontSizeMultiplier={1.3}
                accessibilityLabel={`مبلغ تحصيل القسط ${item.installmentNo}`}
                value={amounts[item.id] ?? String(remaining)}
                onChangeText={(v) => setAmounts((old) => ({ ...old, [item.id]: normalizeNumericInput(v) }))}
                keyboardType="decimal-pad"
                placeholder="مبلغ التحصيل"
                textAlign="right"
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 12,
                  padding: 14,
                  minHeight: 52,
                  color: colors.ink,
                }}
              />
              <PrimaryButton
                label="تسجيل التحصيل"
                onPress={() => void collect(item)}
                busy={busyId === item.id}
                disabled={remaining <= 0}
              />
              <Pressable onPress={() => router.push({ pathname: '/sales/[id]', params: { id: item.sale.id } })}>
                <Text style={{ textAlign: 'right', color: colors.brand, fontWeight: '800' }}>عرض البيع المرتبط ←</Text>
              </Pressable>
            </SectionCard>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListFooterComponent={
          <PrimaryButton label="عرض الديون" variant="secondary" onPress={() => router.push('/debts')} />
        }
      />
    </PageShell>
  );
}
