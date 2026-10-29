import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import {
  createCustomer,
  fetchCustomerSummary,
  fetchCustomers,
  type CustomerRow,
  type CustomerSummary,
} from '@/features/sales/sales-extra.api';
import { Field, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { colors, spacing } from '@/theme/tokens';
import { marketListPerf } from '@/lib/listPerformance';

const money = (n: unknown) =>
  `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(Number(n) || 0)} ₪`;

export default function CustomersScreen() {
  const { accessToken, csrfToken, user, isRestoring } = useAuth();
  const [items, setItems] = useState<CustomerRow[]>([]);
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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
      const [list, stats] = await Promise.all([
        fetchCustomers(accessToken, q),
        fetchCustomerSummary(accessToken),
      ]);
      setItems(list.items);
      setSummary(stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل العملاء.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, q]);

  useEffect(() => {
    if (!isRestoring) void load();
  }, [isRestoring, load]);

  const save = async () => {
    if (!accessToken) {
      router.push('/login');
      return;
    }
    if (name.trim().length < 2) {
      setError('أدخل اسم العميل (حرفين على الأقل).');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await createCustomer(
        {
          name: name.trim(),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          ...(email.trim() ? { email: email.trim() } : {}),
        },
        accessToken,
        csrfToken,
      );
      setName('');
      setPhone('');
      setEmail('');
      setShowForm(false);
      setMessage('تمت إضافة العميل.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذرت إضافة العميل.');
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <PageShell title="عملائي">
        <Notice>سجّل الدخول لإدارة سجل العملاء الخاص بك.</Notice>
        <PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} />
      </PageShell>
    );
  }

  return (
    <PageShell title="عملائي" scroll={false}>
      <FlatList
        data={loading && items.length === 0 ? [] : items}
        keyExtractor={(item) => item.id}
        {...marketListPerf}
        contentContainerStyle={{ paddingBottom: 48, gap: spacing.md }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <Notice tone="muted">
              إدارة العملاء المسجلين في دفتر المبيعات، ومتابعة إجمالي مشترياتهم والمبالغ المستحقة.
            </Notice>
            {summary ? (
              <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 }}>
                <SectionCard>
                  <Text style={{ textAlign: 'right', color: colors.muted }}>عدد العملاء</Text>
                  <Text style={{ textAlign: 'right', fontWeight: '900', color: colors.ink }}>
                    {summary.totalCustomers ?? items.length}
                  </Text>
                </SectionCard>
              </View>
            ) : null}
            <Field label="بحث بالاسم أو الهاتف" value={q} onChangeText={setQ} placeholder="ابحث…" />
            <PrimaryButton label="تطبيق البحث" variant="secondary" onPress={() => void load()} />
            <PrimaryButton
              label={showForm ? 'إخفاء نموذج الإضافة' : '+ إضافة عميل'}
              onPress={() => setShowForm((v) => !v)}
              variant={showForm ? 'secondary' : 'primary'}
            />
            {showForm ? (
              <SectionCard>
                <Field label="اسم العميل" value={name} onChangeText={setName} placeholder="الاسم الكامل" />
                <Field label="الهاتف" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
                <Field label="البريد (اختياري)" value={email} onChangeText={setEmail} keyboardType="email-address" />
                <PrimaryButton label="حفظ العميل" onPress={() => void save()} busy={busy} />
              </SectionCard>
            ) : null}
            {message ? <Notice tone="success">{message}</Notice> : null}
            {error ? <Notice>{error}</Notice> : null}
            {loading ? <ActivityIndicator color={colors.brand} /> : null}
          </View>
        }
        ListEmptyComponent={!loading ? <Notice tone="muted">لا يوجد عملاء بعد.</Notice> : null}
        renderItem={({ item }) => (
          <SectionCard>
            <Text style={{ textAlign: 'right', fontSize: 16, fontWeight: '900', color: colors.ink }}>{item.name}</Text>
            {item.phone ? (
              <Text style={{ textAlign: 'right', color: colors.muted }}>{item.phone}</Text>
            ) : null}
            {item.email ? (
              <Text style={{ textAlign: 'right', color: colors.muted }}>{item.email}</Text>
            ) : null}
            {'totalPurchases' in item && item.totalPurchases != null ? (
              <Text style={{ textAlign: 'right', color: colors.brand, fontWeight: '800' }}>
                المشتريات: {money(item.totalPurchases)}
              </Text>
            ) : null}
          </SectionCard>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
      />
    </PageShell>
  );
}
