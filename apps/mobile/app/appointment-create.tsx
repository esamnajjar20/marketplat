import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { createAppointment, fetchProviderAvailability, type ProviderAvailability } from '@/features/appointments/appointments.api';
import { fetchServiceRequest } from '@/features/services/services.api';
import { Field, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { colors } from '@/theme/tokens';

const localDateInput = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const localTime = (iso: string) => {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

export default function AppointmentCreateScreen() {
  const params = useLocalSearchParams<{ requestId?: string | string[] }>();
  const requestId = Array.isArray(params.requestId) ? params.requestId[0] : params.requestId;
  const { getAccessToken, csrfToken, user, isRestoring } = useAuth();
  const [providerId, setProviderId] = useState('');
  const [date, setDate] = useState(() => localDateInput(new Date(Date.now() + 86400000)));
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('11:00');
  const [notes, setNotes] = useState('');
  const [availability, setAvailability] = useState<ProviderAvailability | null>(null);
  const [loadingProvider, setLoadingProvider] = useState(true);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const loadProvider = async () => {
      if (isRestoring) return;
      const token = getAccessToken();
      if (!requestId || !token) { setLoadingProvider(false); return; }
      setLoadingProvider(true);
      try {
        const request = await fetchServiceRequest(requestId, token);
        const id = request.listing?.provider?.id;
        if (!id) throw new Error('تعذر تحديد مقدم الخدمة لهذا الطلب.');
        if (active) setProviderId(id);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'تعذر تحميل بيانات مقدم الخدمة.');
      } finally {
        if (active) setLoadingProvider(false);
      }
    };
    void loadProvider();
    return () => { active = false; };
  }, [requestId, getAccessToken, isRestoring, user?.id]);

  const loadAvailability = useCallback(async () => {
    if (!providerId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { setAvailability(null); return; }
    setLoadingAvailability(true);
    try {
      const result = await fetchProviderAvailability(providerId, date);
      setAvailability(result);
      setError('');
    } catch (e) {
      setAvailability(null);
      setError(e instanceof Error ? e.message : 'تعذر تحميل الأوقات المتاحة.');
    } finally {
      setLoadingAvailability(false);
    }
  }, [providerId, date]);

  useEffect(() => { void loadAvailability(); }, [loadAvailability]);

  const selectedRangeIsValid = useMemo(() => {
    if (!availability?.freeRanges?.length) return false;
    const [y, m, d] = date.split('-').map(Number);
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const from = new Date(y, m - 1, d, sh, sm).getTime();
    const to = new Date(y, m - 1, d, eh, em).getTime();
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return false;
    return availability.freeRanges.some((range) => from >= new Date(range.start).getTime() && to <= new Date(range.end).getTime());
  }, [availability, date, start, end]);

  const chooseRange = (range: { start: string; end: string }) => {
    const from = new Date(range.start);
    const to = new Date(range.end);
    const oneHour = new Date(Math.min(from.getTime() + 60 * 60 * 1000, to.getTime()));
    setStart(localTime(from.toISOString()));
    setEnd(localTime(oneHour.toISOString()));
  };

  const submit = async () => {
    const token = getAccessToken();
    if (!token) { router.push('/login'); return; }
    if (!requestId) { setError('رقم طلب الخدمة غير موجود.'); return; }
    if (!selectedRangeIsValid) { setError('اختر فترة تقع بالكامل ضمن الأوقات المتاحة لمقدم الخدمة.'); return; }
    const [year, month, day] = date.split('-').map(Number);
    const [startHour, startMinute] = start.split(':').map(Number);
    const [endHour, endMinute] = end.split(':').map(Number);
    const from = new Date(year, month - 1, day, startHour, startMinute, 0, 0);
    const to = new Date(year, month - 1, day, endHour, endMinute, 0, 0);
    if (from.getTime() <= Date.now()) { setError('اختر موعدًا في المستقبل.'); return; }
    setBusy(true);
    setError('');
    try {
      await createAppointment({ requestId, scheduledStart: from.toISOString(), scheduledEnd: to.toISOString(), notes: notes.trim() || undefined }, token, csrfToken);
      router.replace('/appointments');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حجز الموعد. حدّث الأوقات المتاحة وحاول مجددًا.');
      await loadAvailability();
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell title="حجز موعد">
      <Notice tone="muted">يعرض التطبيق فترات العمل المتاحة لمقدم الخدمة بعد خصم المواعيد المحجوزة. قد تتغير الإتاحة قبل التأكيد؛ لذلك يتحقق الخادم منها مرة أخرى.</Notice>
      {loadingProvider ? <Notice tone="muted">جارٍ تحميل مقدم الخدمة…</Notice> : null}
      <Field label="التاريخ" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
      <PrimaryButton label="تحديث الأوقات المتاحة" variant="secondary" onPress={() => void loadAvailability()} busy={loadingAvailability} />
      {loadingAvailability ? <Notice tone="muted">جارٍ تحميل الأوقات…</Notice> : null}
      {!loadingAvailability && providerId && availability && availability.freeRanges.length === 0 ? <Notice tone="muted">لا توجد أوقات شاغرة في هذا اليوم. اختر تاريخًا آخر.</Notice> : null}
      {availability?.freeRanges?.length ? <SectionCard>
        <Text style={{ textAlign: 'right', fontWeight: '900', color: colors.ink }}>الفترات الشاغرة</Text>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 }}>
          {availability.freeRanges.map((range, index) => {
            const label = `${localTime(range.start)} – ${localTime(range.end)}`;
            return <Pressable key={`${range.start}-${index}`} accessibilityRole="button" onPress={() => chooseRange(range)} style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 10, backgroundColor: colors.surface }}><Text style={{ color: colors.ink, fontWeight: '700' }}>{label}</Text></Pressable>;
          })}
        </View>
      </SectionCard> : null}
      <Field label="وقت البداية (HH:MM)" value={start} onChangeText={setStart} placeholder="10:00" />
      <Field label="وقت النهاية (HH:MM)" value={end} onChangeText={setEnd} placeholder="11:00" />
      {availability ? <Notice tone={selectedRangeIsValid ? 'success' : 'muted'}>{selectedRangeIsValid ? 'الفترة المختارة تقع ضمن الأوقات الشاغرة.' : 'اختر فترة متاحة أو عدّل وقت البداية والنهاية ضمن إحدى الفترات أعلاه.'}</Notice> : null}
      <Field label="ملاحظات (اختياري)" value={notes} onChangeText={setNotes} multiline maxLength={500} placeholder="تفاصيل إضافية للموعد" />
      {error ? <Notice>{error}</Notice> : null}
      <PrimaryButton label="تأكيد حجز الموعد" onPress={() => void submit()} busy={busy} disabled={!selectedRangeIsValid || loadingProvider || loadingAvailability} />
    </PageShell>
  );
}
