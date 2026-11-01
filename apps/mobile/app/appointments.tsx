import { AppText as Text } from '@/components/ui/AppText';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyAppointments, updateAppointmentStatus, type AppointmentRow } from '@/features/appointments/appointments.api';
import { fetchMyServiceProvider } from '@/features/services/services.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { fontSizes, colors } from '@/theme/tokens';

const labels: Record<string, string> = { SCHEDULED: 'مجدول', COMPLETED: 'مكتمل', CANCELLED: 'ملغى', NO_SHOW: 'لم يحضر' };

export default function AppointmentsScreen() {
  const { accessToken, getAccessToken, csrfToken, user, isRestoring } = useAuth();
  const [items, setItems] = useState<AppointmentRow[]>([]);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    if (isRestoring) return;
    const token = getAccessToken();
    if (!token) { setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const result = await fetchMyAppointments(token, user?.id);
      setItems(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل المواعيد.');
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, user?.id, isRestoring]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (isRestoring) return;
    const token = getAccessToken();
    if (!token) { setProviderId(null); return; }
    let active = true;
    void fetchMyServiceProvider(token)
      .then((provider) => { if (active) setProviderId(provider?.id ?? null); })
      .catch(() => { if (active) setProviderId(null); });
    return () => { active = false; };
  }, [getAccessToken, isRestoring, user?.id]);

  const update = (item: AppointmentRow, status: 'COMPLETED' | 'CANCELLED' | 'NO_SHOW') => {
    const token = getAccessToken();
    if (!token) { router.push('/login'); return; }
    Alert.alert('تحديث الموعد', `هل تريد تغيير الحالة إلى «${labels[status]}»؟`, [
      { text: 'تراجع', style: 'cancel' },
      { text: 'تأكيد', onPress: () => {
        const currentToken = getAccessToken();
        if (!currentToken) { router.push('/login'); return; }
        setBusyId(item.id);
        setActionError('');
        void updateAppointmentStatus(item.id, status, currentToken, csrfToken)
          .then(async () => { await load(); })
          .catch((e) => setActionError(e instanceof Error ? e.message : 'تعذر تحديث الموعد.'))
          .finally(() => setBusyId(''));
      } },
    ]);
  };

  const formatted = useMemo(() => (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'غير متاح' : new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }, []);

  return (
    <PageShell title="المواعيد">
      <Notice tone="muted">تظهر هنا المواعيد المرتبطة بطلبات الخدمات. يمكن للعميل الإلغاء، ولمقدم الخدمة الإتمام أو تسجيل عدم الحضور.</Notice>
      {!accessToken ? <PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} /> : null}
      {loading ? <ActivityIndicator color={colors.brand} /> : null}
      {error ? <Notice>{error}</Notice> : null}
      {error && accessToken ? <PrimaryButton label="إعادة المحاولة" variant="secondary" onPress={() => void load()} /> : null}
      {actionError ? <Notice>{actionError}</Notice> : null}
      {!loading && !error && items.length === 0 ? <Notice tone="muted">لا توجد مواعيد حاليًا. بعد قبول طلب خدمة، يمكنك ترتيب موعد من تفاصيل الطلب.</Notice> : null}
      {items.map((item) => {
        const isCustomer = item.request?.customerId === user?.id;
        const isProvider = !!providerId && item.providerId === providerId;
        const scheduled = item.status === 'SCHEDULED';
        return (
          <SectionCard key={item.id}>
            <Text style={{ textAlign: 'right', fontSize: fontSizes[17], fontWeight: '900', color: colors.ink }}>{item.request?.listing?.title || 'موعد خدمة'}</Text>
            <Text style={{ textAlign: 'right', fontWeight: '900', color: colors.brand }}>{labels[item.status || ''] || item.status || 'مجدول'}</Text>
            <Text style={{ textAlign: 'right', color: colors.ink }}>البداية: {formatted(item.scheduledStart)}</Text>
            <Text style={{ textAlign: 'right', color: colors.ink }}>النهاية: {formatted(item.scheduledEnd)}</Text>
            {item.notes ? <Text style={{ textAlign: 'right', color: colors.muted }}>{item.notes}</Text> : null}
            {scheduled && (isCustomer || isProvider) ? (
              <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 }}>
                {isCustomer ? <View style={{ flex: 1, minWidth: 120 }}><PrimaryButton label="إلغاء الموعد" variant="danger" busy={busyId === item.id} onPress={() => update(item, 'CANCELLED')} /></View> : null}
                {isProvider && !isCustomer ? <>
                  <View style={{ flex: 1, minWidth: 120 }}><PrimaryButton label="إتمام" variant="secondary" busy={busyId === item.id} onPress={() => update(item, 'COMPLETED')} /></View>
                  <View style={{ flex: 1, minWidth: 120 }}><PrimaryButton label="لم يحضر" variant="secondary" busy={busyId === item.id} onPress={() => update(item, 'NO_SHOW')} /></View>
                </> : null}
              </View>
            ) : null}
          </SectionCard>
        );
      })}
    </PageShell>
  );
}
