import { useCallback, useEffect, useState } from 'react';

import { Notice, PageShell, PrimaryButton } from '@/components/ui';
import { fetchMyStore, type StoreSummary } from '@/features/commerce/commerce.api';
import { saveStoreHours } from '@/features/commerce/store-management.api';
import { useAuth } from '@/features/auth/AuthContext';
import { WeeklyHoursEditor } from '@/features/hours/WeeklyHoursEditor';
import { emptyWeeklyHours, normalizeWeeklyHours, validateWeeklyHours, type WeeklyHours } from '@/features/hours/weekly-hours';
import { pushOnce } from '@/lib/navigation';

export default function StoreHoursScreen() {
  const { accessToken, getAccessToken, csrfToken, user } = useAuth();
  const userId = user?.id;
  const [store, setStore] = useState<StoreSummary | null>(null);
  const [hours, setHours] = useState<WeeklyHours>(emptyWeeklyHours());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!userId || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const mine = await fetchMyStore(token);
      setStore(mine);
      setHours(normalizeWeeklyHours(mine?.workingHours));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل ساعات العمل.');
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, userId]);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    const token = getAccessToken();
    if (!token) return pushOnce('/login');
    const invalid = validateWeeklyHours(hours);
    if (invalid) { setError(invalid); return; }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const updated = await saveStoreHours(hours, token, csrfToken);
      setStore(updated);
      setMessage('تم حفظ ساعات العمل.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حفظ ساعات العمل.');
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
