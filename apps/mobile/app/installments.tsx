import { useAppTheme } from '@/theme/ThemeProvider';
import { formatMoney } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, TextInput, View } from 'react-native';
import { Spinner, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/ui';
import { confirmAlert } from '@/lib/confirm';

import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchInstallments, payInstallment, type InstallmentRow } from '@/features/sales/sales-extra.api';
import { fontSizes, spacing, fontWeights, radius } from '@/theme/tokens';
import { ApiError } from '@/api/client';
import { createMobileOperationId } from '@/lib/operation-id';
import { normalizeNumericInput } from '@/lib/normalize-numeric-input';
import { formatSafeDate } from '@/lib/date-format';

import { useAsyncResource } from '@/hooks/useAsyncResource';
import { AppFlashList } from '@/components/ui/AppFlashList';
import { ListGapMd } from '@/components/ui/ListSeparator';

const money = (n: unknown) =>
  formatMoney(Number(n) || 0);

const EMPTY_INSTALLMENTS: InstallmentRow[] = [];

export default function InstallmentsScreen() {
  const { colors } = useAppTheme();

  const { accessToken, csrfToken, user, isRestoring } = useAuth();
  const [kind, setKind] = useState<'upcoming' | 'overdue'>('upcoming');
  const listKey = `${user?.id ?? 'guest'}:${kind}`;
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState('');
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const paymentOperationsRef = useRef<Record<string, { amount: number; id: string }>>({});

  // دورة الجلب الموحّدة (إلغاء الطلب القديم + تجاهل المتأخر). تُخزَّن هوية القائمة مع الصفوف
  // حتى لا تظهر أقساط «القادمة» أثناء تحميل «المتأخرة» (أو حساب آخر).
  const resource = useAsyncResource<{ key: string; rows: InstallmentRow[] }>(
    async (signal) => {
      const rows = await fetchInstallments(kind, accessToken as string, user?.id as string, signal);
      return { key: listKey, rows };
    },
    {
      key: listKey,
      manual: isRestoring || !accessToken || !user?.id,
      tag: 'installments',
      mapError: (e) => (e instanceof Error && e.message ? e.message : 'تعذر تحميل الأقساط.'),
    },
  );
  const { loading, reload } = resource;
  const visibleItems = resource.data?.key === listKey ? resource.data.rows : EMPTY_INSTALLMENTS;
  const error = actionError || resource.error || '';
  const load = useCallback(() => reload({ soft: true }), [reload]);
  const pullReload = useCallback(() => { void reload({ soft: true }); }, [reload]);

  useEffect(() => {
    setAmounts({});
    paymentOperationsRef.current = {};
  }, [user?.id]);

  const collect = async (item: InstallmentRow) => {
    if (!accessToken) return;
    const remaining = Math.round((Number(item.amount) - Number(item.paidAmount)) * 100) / 100;
    const amount = Number(amounts[item.id] ?? String(remaining));
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining) {
      setActionError(`أدخل مبلغًا أكبر من صفر ولا يتجاوز ${money(remaining)}.`);
      return;
    }
    confirmAlert('تأكيد تحصيل القسط', `تسجيل دفعة بقيمة ${money(amount)}؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'تأكيد',
        onPress: () => {
          setBusyId(item.id);
          setActionError('');
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
              setActionError(e instanceof Error ? e.message : 'تعذر تسجيل الدفعة.');
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
        <PrimaryButton label="تسجيل الدخول" onPress={() => pushOnce('/login')} />
      </PageShell>
    );
  }

  return (
    <PageShell title="الأقساط" scroll={false}>
      <AppFlashList refreshControl={<RefreshControl refreshing={resource.refreshing} onRefresh={pullReload} tintColor={colors.brand} />}
        data={loading && visibleItems.length === 0 ? [] : visibleItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: spacing.x4l }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <Notice tone="muted">
              تعرض الصفحة الأقساط المرتبطة بمبيعاتك. سجّل فقط المبلغ الذي استلمته فعليًا من العميل.
            </Notice>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
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
            {loading ? <Spinner color={colors.brand} /> : null}
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
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                <Text style={{ flex: 1, textAlign: 'right', fontSize: fontSizes[16], fontWeight: fontWeights.bold, color: colors.ink }}>
                  {item.sale?.entityTitle || `القسط ${item.installmentNo}`}
                </Text>
                <Text
                  style={{
                    fontWeight: fontWeights.bold,
                    color: kind === 'overdue' ? colors.danger : colors.brand,
                  }}
                >
                  {money(remaining)}
                </Text>
              </View>
              <Text tone="muted">
                العميل: {item.sale?.customer?.name || item.sale?.buyerName || 'غير محدد'}
              </Text>
              <Text tone="muted">
                القسط رقم {item.installmentNo} · الاستحقاق {formatSafeDate(item.dueDate, 'date')}
              </Text>
              <Text tone="muted">
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
                  borderRadius: radius.control,
                  padding: spacing.lg,
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
              <Pressable accessibilityRole="button" onPress={() => pushOnce({ pathname: '/sales/[id]', params: { id: item.sale.id } })}>
                <Text tone="brand" strong>عرض البيع المرتبط ←</Text>
              </Pressable>
            </SectionCard>
          );
        }}
        ItemSeparatorComponent={ListGapMd}
        ListFooterComponent={
          <PrimaryButton label="عرض الديون" variant="secondary" onPress={() => pushOnce('/debts')} />
        }
      />
    </PageShell>
  );
}
