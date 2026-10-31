import { useCallback, useEffect, useRef, useState } from 'react';
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
  const { getAccessToken, csrfToken, user, isRestoring } = useAuth();
  const [items, setItems] = useState<CustomerRow[]>([]);
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');
  const requestSequence = useRef(0);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const current = ++requestSequence.current;
    if (isRestoring) return;
    const token = getAccessToken();
    if (!token) { setLoading(false); return; }
    setLoading(true);
    setError('');
    setMoreError('');
    try {
      const [list, stats] = await Promise.all([
        fetchCustomers(token, debouncedQ, 1),
        fetchCustomerSummary(token),
      ]);
      if (current !== requestSequence.current) return;
      setItems(list.items);
      setPage(list.meta.page);
      setHasMore(list.meta.hasNextPage);
      setSummary(stats);
    } catch (e) {
      if (current === requestSequence.current) setError(e instanceof Error ? e.message : 'تعذر تحميل العملاء.');
    } finally {
      if (current === requestSequence.current) setLoading(false);
    }
  }, [getAccessToken, debouncedQ, user?.id, isRestoring]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    if (!isRestoring) void load();
    return () => { requestSequence.current += 1; };
  }, [isRestoring, load]);

  const loadMore = async () => {
    const token = getAccessToken();
    if (!token || loadingMore || loading || !hasMore) return;
    const current = requestSequence.current;
    setLoadingMore(true);
    setMoreError('');
    try {
      const result = await fetchCustomers(token, debouncedQ, page + 1);
      if (current !== requestSequence.current) return;
      setItems((old) => [...old, ...result.items.filter((item) => !old.some((existing) => existing.id === item.id))]);
      setPage(result.meta.page);
      setHasMore(result.meta.hasNextPage);
    } catch (e) {
      if (current === requestSequence.current) setMoreError(e instanceof Error ? e.message : 'تعذر تحميل المزيد من العملاء.');
    } finally {
      if (current === requestSequence.current) setLoadingMore(false);
    }
  };

  const save = async () => {
    const token = getAccessToken();
    if (!token) {
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
        token,
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
        ListEmptyComponent={!loading ? <Notice tone="muted">لا يوجد عملاء بعد.</Notice> : undefined}
        renderItem={({ item }) => (
          <SectionCard>
            <Text style={{ textAlign: 'right', fontSize: 16, fontWeight: '900', color: colors.ink }}>{item.name}</Text>
            {item.phone ? (
              <Text style={{ textAlign: 'right', color: colors.muted }}>{item.phone}</Text>
            ) : null}
            {item.email ? (
              <Text style={{ textAlign: 'right', color: colors.muted }}>{item.email}</Text>
            ) : null}
            {item.totalSpent != null ? (
              <Text style={{ textAlign: 'right', color: colors.brand, fontWeight: '800' }}>
                إجمالي المشتريات: {money(item.totalSpent)}
              </Text>
            ) : null}
            {item.totalDue != null ? <Text style={{ textAlign: 'right', color: colors.muted }}>المبلغ المستحق: {money(item.totalDue)}</Text> : null}
            {item.purchaseCount != null ? <Text style={{ textAlign: 'right', color: colors.muted, fontSize: 12 }}>عدد المشتريات: {item.purchaseCount}</Text> : null}
          </SectionCard>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListFooterComponent={hasMore ? <View style={{ gap: spacing.sm, paddingBottom: 20 }}>{moreError ? <Notice>{moreError}</Notice> : null}<PrimaryButton label={loadingMore ? 'جارٍ تحميل المزيد…' : moreError ? 'إعادة المحاولة' : 'تحميل المزيد'} variant="secondary" busy={loadingMore} onPress={() => void loadMore()} /></View> : null}
      />
    </PageShell>
  );
}
