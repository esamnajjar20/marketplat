import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { Spinner, ListEmpty, ListStaleError, PaginatedFooter } from '@/components/ui';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { createCustomer, fetchCustomerSummary, fetchCustomers, type CustomerRow, type CustomerSummary } from '@/features/sales/sales-extra.api';
import { Field, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { spacing } from '@/theme/tokens';
import { marketListPerf } from '@/lib/listPerformance';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { formatMoney } from '@/lib/formatters';


export default function CustomersScreen() {
  const { colors } = useAppTheme();

  const { getAccessToken, csrfToken, user, isRestoring } = useAuth();
  const userId = user?.id;
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState('');
  const [summaryOwnerId, setSummaryOwnerId] = useState<string | null>(null);
  const visibleSummary = summaryOwnerId === user?.id ? summary : null;
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const summaryControllerRef = useRef<AbortController | null>(null);

  const list = usePaginatedList<CustomerRow>({
    key: `customers:${user?.id ?? 'guest'}:${debouncedQ}`,
    pageSize: 20,
    enabled: Boolean(user && !isRestoring && getAccessToken()),
    fetchPage: async (page, signal) => {
      const token = getAccessToken();
      if (!token) throw new Error('سجّل الدخول لإدارة العملاء.');
      const result = await fetchCustomers(token, debouncedQ, page, signal, user?.id);
      return { items: result.items, meta: result.meta };
    },
    getItemKey: (customer) => customer.id,
  });

  const refreshList = list.refresh;

  const loadSummary = useCallback(async () => {
    if (!userId || isRestoring) return;
    const token = getAccessToken();
    if (!token) return;
    summaryControllerRef.current?.abort();
    const controller = new AbortController();
    summaryControllerRef.current = controller;
    setSummaryLoading(true);
    setSummaryError('');
    try {
      const next = await fetchCustomerSummary(token, controller.signal, userId);
      if (!controller.signal.aborted) { setSummary(next); setSummaryOwnerId(userId); }
    } catch (cause) {
      if (!controller.signal.aborted) setSummaryError(cause instanceof Error ? cause.message : 'تعذر تحميل ملخص العملاء.');
    } finally {
      if (!controller.signal.aborted) {
        setSummaryLoading(false);
        if (summaryControllerRef.current === controller) summaryControllerRef.current = null;
      }
    }
  }, [getAccessToken, isRestoring, userId]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    void loadSummary();
    return () => {
      summaryControllerRef.current?.abort();
      summaryControllerRef.current = null;
    };
  }, [loadSummary]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshList(), loadSummary()]);
  }, [refreshList, loadSummary]);

  const save = async () => {
    const token = getAccessToken();
    if (!token || !user) {
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
        user.id,
      );
      setName('');
      setPhone('');
      setEmail('');
      setShowForm(false);
      setMessage('تمت إضافة العميل.');
      await Promise.all([list.refresh(), loadSummary()]);
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
        data={list.loading && list.items.length === 0 ? [] : list.items}
        keyExtractor={(item) => item.id}
        {...marketListPerf}
        contentContainerStyle={{ paddingBottom: spacing.x4l, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={list.refreshing || summaryLoading} onRefresh={() => void refreshAll()} tintColor={colors.brand} />}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <Notice tone="muted">
              إدارة العملاء المسجلين في دفتر المبيعات، ومتابعة إجمالي مشترياتهم والمبالغ المستحقة.
            </Notice>
            {visibleSummary ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                <SectionCard>
                  <Text tone="muted">عدد العملاء</Text>
                  <Text tone="ink" strong>
                    {visibleSummary.totalCustomers ?? list.items.length}
                  </Text>
                </SectionCard>
              </View>
            ) : null}
            <Field label="بحث بالاسم أو الهاتف" value={q} onChangeText={setQ} placeholder="ابحث…" />
            <PrimaryButton label="تطبيق البحث" variant="secondary" onPress={() => { const next = q.trim(); if (next === debouncedQ) void list.refresh(); else setDebouncedQ(next); }} />
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
            {summaryError ? <View style={{ gap: spacing.xs }}><Notice>{summaryError}</Notice><PrimaryButton label="إعادة تحميل الملخص" variant="secondary" onPress={() => void loadSummary()} /></View> : null}
            <ListStaleError list={list} />
            {summaryLoading ? <Spinner color={colors.brand} /> : null}
          </View>
        }
        ListEmptyComponent={<ListEmpty list={list} loadingMessage="جاري تحميل العملاء…" errorTitle="تعذر تحميل العملاء" emptyTitle="لا يوجد عملاء بعد" />}
        renderItem={({ item }) => (
          <SectionCard>
            <Text tone="ink" strong size={16}>{item.name}</Text>
            {item.phone ? (
              <Text tone="muted">{item.phone}</Text>
            ) : null}
            {item.email ? (
              <Text tone="muted">{item.email}</Text>
            ) : null}
            {item.totalSpent != null ? (
              <Text tone="brand" strong>
                إجمالي المشتريات: {formatMoney(item.totalSpent)}
              </Text>
            ) : null}
            {item.totalDue != null ? <Text tone="muted">المبلغ المستحق: {formatMoney(item.totalDue)}</Text> : null}
            {item.purchaseCount != null ? <Text tone="muted" size={12}>عدد المشتريات: {item.purchaseCount}</Text> : null}
          </SectionCard>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListFooterComponent={<PaginatedFooter list={list} />}
      />
    </PageShell>
  );
}
