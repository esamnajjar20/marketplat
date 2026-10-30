import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchInstallments, payInstallment, type InstallmentRow } from '@/features/sales/sales-extra.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { colors, spacing } from '@/theme/tokens';
import { marketListPerf } from '@/lib/listPerformance';

const money = (n: unknown) =>
  `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(Number(n) || 0)} ₪`;

export default function InstallmentsScreen() {
  const { accessToken, csrfToken, user, isRestoring } = useAuth();
  const [kind, setKind] = useState<'upcoming' | 'overdue'>('upcoming');
  const [items, setItems] = useState<InstallmentRow[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setItems(await fetchInstallments(kind, accessToken));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل الأقساط.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, kind]);

  useEffect(() => {
    if (!isRestoring) void load();
  }, [isRestoring, load]);

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
          void payInstallment(item.id, amount, accessToken, csrfToken)
            .then(() => {
              setMessage('تم تسجيل الدفعة بنجاح.');
              setAmounts((old) => ({ ...old, [item.id]: '' }));
              return load();
            })
            .catch((e) => setError(e instanceof Error ? e.message : 'تعذر تسجيل الدفعة.'))
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
        data={loading && items.length === 0 ? [] : items}
        keyExtractor={(item) => item.id}
        {...marketListPerf}
        contentContainerStyle={{ paddingBottom: 48, gap: spacing.md }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <Notice tone="muted">
              تعرض الصفحة الأقساط المرتبطة بمبيعاتك. سجّل فقط المبلغ الذي استلمته فعليًا من العميل.
            </Notice>
            <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
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
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ flex: 1, textAlign: 'right', fontSize: 16, fontWeight: '900', color: colors.ink }}>
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
                القسط رقم {item.installmentNo} · الاستحقاق {new Date(item.dueDate).toLocaleDateString('ar')}
              </Text>
              <Text style={{ textAlign: 'right', color: colors.muted }}>
                قيمة القسط: {money(item.amount)} · المدفوع: {money(item.paidAmount)}
              </Text>
              <TextInput
                accessibilityLabel={`مبلغ تحصيل القسط ${item.installmentNo}`}
                value={amounts[item.id] ?? String(remaining)}
                onChangeText={(v) => setAmounts((old) => ({ ...old, [item.id]: v }))}
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
