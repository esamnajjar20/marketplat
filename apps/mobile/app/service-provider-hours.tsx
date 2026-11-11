import { useCallback, useEffect, useState } from 'react';

import { Notice, PageShell, PrimaryButton } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthContext';
import { WeeklyHoursEditor } from '@/features/hours/WeeklyHoursEditor';
import { emptyWeeklyHours, normalizeWeeklyHours, validateWeeklyHours, type WeeklyHours } from '@/features/hours/weekly-hours';
import { fetchMyServiceProvider, updateMyServiceProviderWorkingHours } from '@/features/services/providers.api';
import { pushOnce } from '@/lib/navigation';

export default function ServiceProviderHoursScreen() {
  const { accessToken, getAccessToken, csrfToken, user } = useAuth();
  const userId = user?.id;
  const [hours, setHours] = useState<WeeklyHours>(emptyWeeklyHours());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [noProfile, setNoProfile] = useState(false);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!userId || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const provider = await fetchMyServiceProvider(token);
      if (!provider) {
        setNoProfile(true);
        return;
      }
      setNoProfile(false);
      setHours(normalizeWeeklyHours(provider.workingHours));
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
      await updateMyServiceProviderWorkingHours(hours, token, csrfToken);
      setMessage('تم حفظ ساعات عمل مقدم الخدمة.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حفظ ساعات العمل.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell title="ساعات عمل مقدم الخدمة">
      {!accessToken ? (
        <>
          <Notice>سجّل الدخول لإدارة ساعات العمل.</Notice>
          <PrimaryButton label="تسجيل الدخول" onPress={() => pushOnce('/login')} />
        </>
      ) : loading ? (
        <Notice tone="muted">جارٍ تحميل ساعات العمل…</Notice>
      ) : noProfile ? (
        <Notice>أنشئ ملف مقدم الخدمة أولًا من صفحة «ملف مقدم الخدمة» قبل ضبط ساعات العمل.</Notice>
      ) : (
        <>
          <Notice tone="muted">حدد أوقات توفر نشاطك. اترك اليوم مغلقًا إذا لم تكن تستقبل الحجوزات فيه.</Notice>
          <WeeklyHoursEditor hours={hours} onChange={setHours} />
          <PrimaryButton label="حفظ ساعات العمل" onPress={() => void save()} busy={busy} />
        </>
      )}
      {error ? <Notice>{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}
    </PageShell>
  );
}
