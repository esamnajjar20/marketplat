import { useState } from 'react';

import { Notice, PageShell, PrimaryButton } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthContext';
import { WeeklyHoursEditor } from '@/features/hours/WeeklyHoursEditor';
import { emptyWeeklyHours, normalizeWeeklyHours, validateWeeklyHours, type WeeklyHours } from '@/features/hours/weekly-hours';
import { fetchMyServiceProvider, updateMyServiceProviderWorkingHours } from '@/features/services/providers.api';
import { pushOnce } from '@/lib/navigation';
import { useAsyncResource } from '@/hooks/useAsyncResource';

export default function ServiceProviderHoursScreen() {
  const { accessToken, getAccessToken, csrfToken, user } = useAuth();
  const userId = user?.id;
  const [hours, setHours] = useState<WeeklyHours>(emptyWeeklyHours());
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');

  // دورة الجلب الموحّدة؛ محرّر الساعات يُهيَّأ من ملف مقدم الخدمة المُحمَّل.
  const resource = useAsyncResource<{ hasProfile: boolean }>(
    async () => {
      const provider = await fetchMyServiceProvider(getAccessToken() as string);
      if (!provider) return { hasProfile: false };
      setHours(normalizeWeeklyHours(provider.workingHours));
      return { hasProfile: true };
    },
    {
      key: userId ?? '',
      manual: !userId || !accessToken,
      tag: 'service-provider-hours',
      mapError: (e) => (e instanceof Error && e.message ? e.message : 'تعذر تحميل ساعات العمل.'),
    },
  );
  const { loading } = resource;
  const noProfile = resource.data ? !resource.data.hasProfile : false;
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
      await updateMyServiceProviderWorkingHours(hours, token, csrfToken);
      setMessage('تم حفظ ساعات عمل مقدم الخدمة.');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'تعذر حفظ ساعات العمل.');
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
