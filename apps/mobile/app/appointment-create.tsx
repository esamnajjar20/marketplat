import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { createAppointment, fetchProviderAvailability, type ProviderAvailability } from '@/features/appointments/appointments.api';
import { buildAppointmentSlots, type AppointmentSlot } from '@/features/appointments/appointment-slots';
import { fetchServiceRequest } from '@/features/services/services.api';
import { Field, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/ui';
import { fontSizes, radius, spacing, fontWeights } from '@/theme/tokens';
import { onlineOnlyBlockReason } from '@/lib/offline-support';
import { showToast } from '@/lib/toast';

const MARKET_TIME_ZONE = 'Asia/Gaza';
const marketDateParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: MARKET_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});
function makeDateOptions(page: number) {
  const parts = Object.fromEntries(marketDateParts.formatToParts(new Date()).map((part) => [part.type, part.value]));
  const marketToday = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  return Array.from({ length: 14 }, (_, index) => {
    // Construct calendar days in UTC from market-local date parts. This avoids
    // device-timezone and daylight-saving shifts in the provider's calendar.
    const date = new Date(marketToday.getTime() + ((page * 14) + index) * 86_400_000);
    return {
      value: date.toISOString().slice(0, 10),
      weekday: new Intl.DateTimeFormat('ar-PS', { weekday: 'short', timeZone: 'UTC' }).format(date),
      day: new Intl.DateTimeFormat('ar-PS', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date),
    };
  });
}

export default function AppointmentCreateScreen() {
  const { colors } = useAppTheme();

  const params = useLocalSearchParams<{ requestId?: string | string[] }>();
  const requestId = Array.isArray(params.requestId) ? params.requestId[0] : params.requestId;
  const { getAccessToken, csrfToken, user, isRestoring } = useAuth();
  const [providerId, setProviderId] = useState('');
  const [datePage, setDatePage] = useState(0);
  const [date, setDate] = useState(() => makeDateOptions(0)[0].value);
  const [selectedSlot, setSelectedSlot] = useState<AppointmentSlot | null>(null);
  const [notes, setNotes] = useState('');
  const [availability, setAvailability] = useState<ProviderAvailability | null>(null);
  const [loadingProvider, setLoadingProvider] = useState(true);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [busy, setBusy] = useState(false);
  const [providerError, setProviderError] = useState('');
  const [availabilityError, setAvailabilityError] = useState('');
  const availabilityRequestRef = useRef(0);
  const availabilityAbortRef = useRef<AbortController | null>(null);

  const dateOptions = useMemo(() => makeDateOptions(datePage), [datePage]);
  const slots = useMemo(
    () => buildAppointmentSlots(availability?.freeRanges ?? [], date),
    [availability, date],
  );

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const loadProvider = async () => {
      if (isRestoring) return;
      const token = getAccessToken();
      setProviderId('');
      if (!requestId) {
        setProviderError('رابط حجز الموعد غير مكتمل؛ افتح الحجز من تفاصيل طلب الخدمة.');
        setLoadingProvider(false);
        return;
      }
      if (!token) {
        setLoadingProvider(false);
        return;
      }
      setLoadingProvider(true);
      setProviderError('');
      try {
        const request = await fetchServiceRequest(requestId, token, controller.signal);
        const id = request.listing?.provider?.id;
        if (!id) throw new Error('تعذر تحديد مقدم الخدمة لهذا الطلب.');
        if (active) setProviderId(id);
      } catch (error) {
        if (active && !controller.signal.aborted) setProviderError(error instanceof Error ? error.message : 'تعذر تحميل بيانات مقدم الخدمة.');
      } finally {
        if (active) setLoadingProvider(false);
      }
    };
    void loadProvider();
    return () => { active = false; controller.abort(); };
  }, [requestId, getAccessToken, isRestoring, user?.id]);

  const loadAvailability = useCallback(async () => {
    availabilityAbortRef.current?.abort();
    availabilityAbortRef.current = null;
    const requestSequence = ++availabilityRequestRef.current;
    if (!providerId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setAvailability(null);
      setSelectedSlot(null);
      setLoadingAvailability(false);
      return;
    }
    const controller = new AbortController();
    availabilityAbortRef.current = controller;
    setLoadingAvailability(true);
    setAvailability(null);
    setAvailabilityError('');
    setSelectedSlot(null);
    try {
      const result = await fetchProviderAvailability(providerId, date, controller.signal);
      if (requestSequence !== availabilityRequestRef.current || controller.signal.aborted) return;
      setAvailability(result);
    } catch (error) {
      if (requestSequence !== availabilityRequestRef.current || controller.signal.aborted) return;
      setAvailability(null);
      setAvailabilityError(error instanceof Error ? error.message : 'تعذر تحميل الأوقات المتاحة.');
    } finally {
      if (requestSequence === availabilityRequestRef.current) {
        setLoadingAvailability(false);
        if (availabilityAbortRef.current === controller) availabilityAbortRef.current = null;
      }
    }
  }, [providerId, date]);

  useEffect(() => {
    if (!providerId || isRestoring) return undefined;
    void loadAvailability();
    return () => {
      availabilityRequestRef.current += 1;
      availabilityAbortRef.current?.abort();
      availabilityAbortRef.current = null;
    };
  }, [loadAvailability, providerId, isRestoring]);

  const setDatePageAndDate = (nextPage: number) => {
    const safePage = Math.max(0, nextPage);
    setDatePage(safePage);
    const nextDates = makeDateOptions(safePage);
    setDate(nextDates[0]?.value ?? date);
    setSelectedSlot(null);
  };

  const submit = async () => {
    const token = getAccessToken();
    if (!token) {
      pushOnce({ pathname: '/login', params: { redirect: `/appointment-create?requestId=${encodeURIComponent(requestId ?? '')}` } });
      return;
    }
    if (!requestId) { setProviderError('رقم طلب الخدمة غير موجود.'); return; }
    if (!selectedSlot) { setAvailabilityError('اختر فترة متاحة قبل تأكيد الحجز.'); return; }
    // Booking needs the server to confirm availability: say so before sending, instead of a raw network error.
    const blocked = await onlineOnlyBlockReason('create-appointment');
    if (blocked) {
      setAvailabilityError(blocked.message);
      showToast(blocked.title, blocked.message, 'info');
      return;
    }
    const from = new Date(selectedSlot.start);
    const to = new Date(selectedSlot.end);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from.getTime() <= Date.now() || to <= from) {
      const message = 'انتهت صلاحية الفترة المختارة. حدّث الأوقات واختر فترة أخرى.';
      setAvailabilityError(message);
      setSelectedSlot(null);
      await loadAvailability();
      setAvailabilityError((current) => current || message);
      return;
    }
    setBusy(true);
    setAvailabilityError('');
    try {
      await createAppointment({ requestId, scheduledStart: from.toISOString(), scheduledEnd: to.toISOString(), notes: notes.trim() || undefined }, token, csrfToken);
      router.replace('/appointments');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر حجز الموعد. حدّث الأوقات المتاحة وحاول مرة أخرى.';
      setAvailabilityError(message);
      setSelectedSlot(null);
      await loadAvailability();
      setAvailabilityError((current) => current || message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell title="حجز موعد">
      <Notice tone="muted">اختر تاريخًا ثم إحدى الفترات الشاغرة. مدة كل موعد ساعة، ويتحقق الخادم من الإتاحة مرة أخرى قبل التأكيد.</Notice>
      {loadingProvider ? <Notice tone="muted">جارٍ تحميل بيانات طلب الخدمة…</Notice> : null}
      {!user && !isRestoring ? <View style={{ gap: spacing.sm }}><Notice>سجّل الدخول لحجز الموعد.</Notice><PrimaryButton label="تسجيل الدخول" onPress={() => pushOnce({ pathname: '/login', params: { redirect: `/appointment-create?requestId=${encodeURIComponent(requestId ?? '')}` } })} /></View> : null}
      {providerError ? <Notice tone="error">{providerError}</Notice> : null}
      {providerId ? (
        <SectionCard>
          <Text tone="ink" strong size={16}>اختر تاريخ الموعد</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Pressable accessibilityRole="button" accessibilityLabel="التواريخ السابقة" accessibilityState={{ disabled: datePage === 0 }} disabled={datePage === 0} onPress={() => setDatePageAndDate(datePage - 1)} style={{ minHeight: 44, minWidth: 64, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: datePage === 0 ? colors.muted : colors.brand, fontWeight: fontWeights.bold }}>السابق</Text>
            </Pressable>
            <Text style={{ color: colors.muted, fontSize: fontSizes[12] }}>عرض 14 يومًا</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="التواريخ التالية" onPress={() => setDatePageAndDate(datePage + 1)} style={{ minHeight: 44, minWidth: 64, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: colors.brand, fontWeight: fontWeights.bold }}>التالي</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs }}>
            {dateOptions.map((option) => {
              const selected = option.value === date;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityLabel={`${option.weekday} ${option.day}`}
                  accessibilityState={{ selected }}
                  onPress={() => { setDate(option.value); setSelectedSlot(null); }}
                  style={{ minWidth: 76, minHeight: 64, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: selected ? colors.brand : colors.border, backgroundColor: selected ? colors.brandSoft : colors.surface, justifyContent: 'center', alignItems: 'center', gap: spacing.xs }}
                >
                  <Text style={{ color: selected ? colors.brand : colors.muted, fontSize: fontSizes[12], fontWeight: fontWeights.bold }}>{option.weekday}</Text>
                  <Text style={{ color: selected ? colors.brand : colors.ink, fontWeight: fontWeights.bold }}>{option.day}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </SectionCard>
      ) : null}

      {providerId ? (
        <SectionCard>
          <Text tone="ink" strong size={16}>الفترات المتاحة</Text>
          {loadingAvailability ? <Notice tone="muted">جارٍ تحميل الأوقات المتاحة…</Notice> : null}
          {!loadingAvailability && !availabilityError && slots.length === 0 ? (
            <Notice tone="muted">لا توجد فترة مدتها ساعة متاحة في هذا اليوم. اختر تاريخًا آخر.</Notice>
          ) : null}
          {slots.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {slots.map((slot) => {
                const selected = selectedSlot?.start === slot.start;
                return (
                  <Pressable
                    key={slot.start}
                    accessibilityRole="button"
                    accessibilityLabel={`حجز ${slot.label}`}
                    accessibilityState={{ selected }}
                    onPress={() => setSelectedSlot(slot)}
                    style={{ minHeight: 44, minWidth: 112, paddingHorizontal: spacing.md, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: selected ? colors.brand : colors.border, borderRadius: radius.md, backgroundColor: selected ? colors.brandSoft : colors.surface }}
                  >
                    <Text style={{ color: selected ? colors.brand : colors.ink, fontWeight: fontWeights.bold }}>{slot.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <PrimaryButton label="تحديث الأوقات المتاحة" variant="secondary" onPress={() => void loadAvailability()} busy={loadingAvailability} disabled={loadingAvailability} />
        </SectionCard>
      ) : null}
      {selectedSlot ? <Notice tone="success">الفترة المختارة: {selectedSlot.label} · مدة الموعد ساعة واحدة.</Notice> : null}
      <SectionCard>
        <Text tone="ink" strong>ملاحظات (اختياري)</Text>
        <Field label="تفاصيل إضافية للموعد" value={notes} onChangeText={setNotes} multiline maxLength={500} placeholder="أضف ما يحتاج مقدم الخدمة إلى معرفته" />
      </SectionCard>
      {availabilityError ? <Notice tone="error">{availabilityError}</Notice> : null}
      <PrimaryButton label="تأكيد حجز الموعد" onPress={() => void submit()} busy={busy} disabled={!selectedSlot || loadingProvider || loadingAvailability || busy || !providerId} />
    </PageShell>
  );
}
