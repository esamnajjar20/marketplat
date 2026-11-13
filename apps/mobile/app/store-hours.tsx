import { useState } from 'react';

import { Notice, PageShell, PrimaryButton } from '@/components/ui';
import { fetchMyStore, type StoreSummary } from '@/features/commerce/commerce.api';
import { saveStoreHours } from '@/features/commerce/store-management.api';
import { useAuth } from '@/features/auth/AuthContext';
import { WeeklyHoursEditor } from '@/features/hours/WeeklyHoursEditor';
import { emptyWeeklyHours, normalizeWeeklyHours, validateWeeklyHours, type WeeklyHours } from '@/features/hours/weekly-hours';
import { pushOnce } from '@/lib/navigation';
import { useAsyncResource } from '@/hooks/useAsyncResource';

export default function StoreHoursScreen() {
  const { accessToken, getAccessToken, csrfToken, user } = useAuth();
  const userId = user?.id;
  const [hours, setHours] = useState<WeeklyHours>(emptyWeeklyHours());
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');

  // دورة الجلب الموحّدة؛ محرّر الساعات يُهيَّأ من المتجر المُحمَّل.
  const resource = useAsyncResource<StoreSummary | null>(
    async () => {
      const mine = await fetchMyStore(getAccessToken() as string);
      setHours(normalizeWeeklyHours(mine?.workingHours));
      return mine;
    },
    {
      key: userId ?? '',
      manual: !userId || !accessToken,
      tag: 'store-hours',
      mapError: (e) => (e instanceof Error && e.message ? e.message : 'تعذر تحميل ساعات العمل.'),
    },
  );
  const { data: store, loading, setData: setStore } = resource;
  const error = actionError || resource.error || '';

  const save = async () => {
    const token = getAccessToken();
    if (!token) return pushOnce('/login');
    const invalid = validateWeeklyHours(hours);
    if (invalid) { setActionError(invalid); return; }
    setBusy(true);
    setActionError('');
    setMessage('');
    try {
      const updated = await saveStoreHours(hours, token, csrfToken);
      setStore(updated);
      setMessage('تم حفظ ساعات العمل.');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'تعذر حفظ ساعات العمل.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell title="ساعات عمل المتجر">
      {!accessToken ? (
        <>
          <Notice>سجّل الدخول لإدارة ساعات العمل.</Notice>
          <PrimaryButton label="تسجيل الدخول" onPress={() => pushOnce('/login')} />
        </>
      ) : loading ? (
        <Notice tone="muted">جارٍ تحميل ساعات العمل…</Notice>
      ) : !store ? (
        <Notice>أنشئ متجرك أولًا.</Notice>
      ) : (
        <>
          <Notice tone="muted">يمكن ترك اليوم مغلقًا. تُستخدم هذه الساعات لعرض حالة «مفتوح الآن» عندما تكون البيانات متاحة.</Notice>
          <WeeklyHoursEditor hours={hours} onChange={setHours} />
          <PrimaryButton label="حفظ ساعات العمل" onPress={() => void save()} busy={busy} />
        </>
      )}
      {error ? <Notice>{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}
    </PageShell>
  );
}
