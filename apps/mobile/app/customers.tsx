import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';

import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { BrandRefreshControl } from '@/components/ui/BrandRefreshControl';
import { Spinner, ListEmpty, ListStaleError, PaginatedFooter, Field, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/ui';

import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { createCustomer, fetchCustomerSummary, fetchCustomers, updateCustomer, type CustomerRow, type CustomerSummary } from '@/features/sales/sales-extra.api';
import { spacing } from '@/theme/tokens';
import { confirmAlert } from '@/lib/confirm';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { formatMoney } from '@/lib/formatters';
import { AppFlashList } from '@/components/ui/AppFlashList';
import { ListGapMd } from '@/components/ui/ListSeparator';


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
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string; phone: string; email: string; address: string; note: string } | null>(null);
  const [busyCustomerId, setBusyCustomerId] = useState('');
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
      pushOnce('/login');
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
          ...(address.trim() ? { address: address.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
        token,
        csrfToken,
        user.id,
      );
      setName('');
      setPhone('');
      setEmail('');
      setAddress('');
      setNote('');
      setShowForm(false);
      setMessage('تمت إضافة العميل.');
      await Promise.all([list.refresh(), loadSummary()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذرت إضافة العميل.');
    } finally {
      setBusy(false);
    }
  };

  const saveCustomerEdits = async () => {
    const token = getAccessToken();
    if (!token || !user || !editing) return;
    if (editing.name.trim().length < 2) { setError('اسم العميل يجب أن يتكون من حرفين على الأقل.'); return; }
    setBusyCustomerId(editing.id); setError(''); setMessage('');
    try {
      await updateCustomer(editing.id, {
        name: editing.name.trim(),
        phone: editing.phone.trim() || null,
        email: editing.email.trim() || null,
        address: editing.address.trim() || null,
        note: editing.note.trim() || null,
      }, token, csrfToken, user.id);
      setEditing(null); setMessage('تم تحديث بيانات العميل.');
      await Promise.all([list.refresh(), loadSummary()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحديث بيانات العميل.');
    } finally { setBusyCustomerId(''); }
  };

  const toggleCustomerFlag = (customer: CustomerRow, flag: 'isVip' | 'isBlacklisted') => {
    const nextValue = !customer[flag];
    const title = flag === 'isVip' ? (nextValue ? 'تعيين العميل VIP' : 'إزالة تصنيف VIP') : (nextValue ? 'حظر العميل' : 'إلغاء حظر العميل');
    const messageText = flag === 'isBlacklisted'
      ? (nextValue ? 'سيُعلَّم هذا العميل كمحظور في سجل متجرك. هل تريد المتابعة؟' : 'سيُزال الحظر عن هذا العميل. هل تريد المتابعة؟')
      : (nextValue ? 'سيُضاف العميل إلى قائمة العملاء المميزين. هل تريد المتابعة؟' : 'سيُزال تصنيف العميل المميز. هل تريد المتابعة؟');
    confirmAlert(title, messageText, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', onPress: () => {
        const token = getAccessToken();
        if (!token || !user) return;
        setBusyCustomerId(customer.id); setError(''); setMessage('');
        const changes = flag === 'isVip' ? { isVip: nextValue } : { isBlacklisted: nextValue };
        void updateCustomer(customer.id, changes, token, csrfToken, user.id)
          .then(async () => { setMessage(flag === 'isVip' ? 'تم تحديث تصنيف VIP.' : 'تم تحديث حالة الحظر.'); await Promise.all([list.refresh(), loadSummary()]); })
          .catch(cause => setError(cause instanceof Error ? cause.message : 'تعذر تحديث حالة العميل.'))
          .finally(() => setBusyCustomerId(''));
      } },
    ]);
  };

  if (!user) {
    return (
      <PageShell title="عملائي">
        <Notice>سجّل الدخول لإدارة سجل العملاء الخاص بك.</Notice>
        <PrimaryButton label="تسجيل الدخول" onPress={() => pushOnce('/login')} />
      </PageShell>
    );
  }

  return (
    <PageShell title="عملائي" scroll={false}>
      <AppFlashList
        data={list.loading && list.items.length === 0 ? [] : list.items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: spacing.x4l }}
        refreshControl={<BrandRefreshControl refreshing={list.refreshing || summaryLoading} onRefresh={() => void refreshAll()} />}
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
                <Field label="العنوان (اختياري)" value={address} onChangeText={setAddress} placeholder="عنوان العميل" multiline maxLength={500} />
                <Field label="ملاحظات (اختياري)" value={note} onChangeText={setNote} placeholder="ملاحظات داخلية عن العميل" multiline maxLength={1000} />
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
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {item.isVip ? <Text tone="brand" strong size={12}>عميل VIP</Text> : null}
              {item.isBlacklisted ? <Text tone="danger" strong size={12}>محظور</Text> : null}
            </View>
            {item.phone ? <Text tone="muted">{item.phone}</Text> : null}
            {item.email ? <Text tone="muted">{item.email}</Text> : null}
            {item.address ? <Text tone="muted">العنوان: {item.address}</Text> : null}
            {item.note ? <Text tone="muted">ملاحظة: {item.note}</Text> : null}
            {item.totalSpent != null ? <Text tone="brand" strong>إجمالي المشتريات: {formatMoney(item.totalSpent)}</Text> : null}
            {item.totalDue != null ? <Text tone="muted">المبلغ المستحق: {formatMoney(item.totalDue)}</Text> : null}
            {item.purchaseCount != null ? <Text tone="muted" size={12}>عدد المشتريات: {item.purchaseCount}</Text> : null}
            {editing?.id === item.id ? <View style={{ gap: spacing.sm }}>
              <Field label="اسم العميل" value={editing.name} onChangeText={value => setEditing(old => old ? { ...old, name: value } : old)} />
              <Field label="الهاتف" value={editing.phone} onChangeText={value => setEditing(old => old ? { ...old, phone: value } : old)} keyboardType="phone-pad" />
              <Field label="البريد" value={editing.email} onChangeText={value => setEditing(old => old ? { ...old, email: value } : old)} keyboardType="email-address" />
              <Field label="العنوان" value={editing.address} onChangeText={value => setEditing(old => old ? { ...old, address: value } : old)} multiline maxLength={500} />
              <Field label="ملاحظات" value={editing.note} onChangeText={value => setEditing(old => old ? { ...old, note: value } : old)} multiline maxLength={1000} />
              <PrimaryButton label="حفظ التعديلات" busy={busyCustomerId === item.id} disabled={Boolean(busyCustomerId)} onPress={() => void saveCustomerEdits()} />
              <PrimaryButton label="إلغاء التعديل" variant="secondary" disabled={Boolean(busyCustomerId)} onPress={() => setEditing(null)} />
            </View> : <View style={{ gap: spacing.xs }}>
              <PrimaryButton label="تعديل البيانات" variant="secondary" size="sm" disabled={Boolean(busyCustomerId)} onPress={() => setEditing({ id: item.id, name: item.name, phone: item.phone ?? '', email: item.email ?? '', address: item.address ?? '', note: item.note ?? '' })} />
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                <View style={{ flex: 1 }}><PrimaryButton label={item.isVip ? 'إزالة VIP' : 'تعيين VIP'} variant="secondary" size="sm" busy={busyCustomerId === item.id} disabled={Boolean(busyCustomerId)} onPress={() => toggleCustomerFlag(item, 'isVip')} /></View>
                <View style={{ flex: 1 }}><PrimaryButton label={item.isBlacklisted ? 'إلغاء الحظر' : 'حظر العميل'} variant={item.isBlacklisted ? 'secondary' : 'danger'} size="sm" busy={busyCustomerId === item.id} disabled={Boolean(busyCustomerId)} onPress={() => toggleCustomerFlag(item, 'isBlacklisted')} /></View>
              </View>
            </View>}
          </SectionCard>
        )}
        ItemSeparatorComponent={ListGapMd}
        ListFooterComponent={<PaginatedFooter list={list} />}
      />
    </PageShell>
  );
}
