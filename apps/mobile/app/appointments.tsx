import { AppText as Text } from '@/components/ui/AppText';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyAppointments, updateAppointmentStatus, type AppointmentRow } from '@/features/appointments/appointments.api';
import { fetchMyServiceProvider } from '@/features/services/providers.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { fontSizes, colors, spacing } from '@/theme/tokens';
import { formatDate } from '@/lib/formatters';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { marketListPerf } from '@/lib/listPerformance';

const labels: Record<string, string> = { SCHEDULED: 'مجدول', COMPLETED: 'مكتمل', CANCELLED: 'ملغى', NO_SHOW: 'لم يحضر' };

export default function AppointmentsScreen() {
  const { accessToken, getAccessToken, csrfToken, user, isRestoring } = useAuth();
  const [providerId, setProviderId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState('');
  const [actionError, setActionError] = useState('');
  const list = usePaginatedList<AppointmentRow>({
    key: `appointments:${user?.id ?? 'guest'}`,
    pageSize: 20,
    enabled: Boolean(accessToken && user && !isRestoring),
    fetchPage: async (page, signal) => {
      const token = getAccessToken();
      if (!token) throw new Error('انتهت جلسة الدخول. سجّل الدخول مجددًا.');
      const result = await fetchMyAppointments(token, user?.id, page, 20, signal);
      return { items: result.items, meta: { page: result.page, totalPages: result.totalPages, total: result.total } };
    },
    getItemKey: (item) => item.id,
    mapError: () => 'تعذر تحميل المواعيد. تحقق من الاتصال وحاول مجددًا.',
  });

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
          .then(async () => { await list.refresh(); })
          .catch((e) => setActionError(e instanceof Error ? e.message : 'تعذر تحديث الموعد.'))
          .finally(() => setBusyId(''));
      } },
    ]);
  };

  const formatted = (value: string) => formatDate(value, 'dateTime');
  const needsLogin = !isRestoring && (!accessToken || !user);
  const showInitialState = isRestoring || list.loading || needsLogin || (!!list.error && list.items.length === 0);

  const renderAppointment = ({ item }: { item: AppointmentRow }) => {
    const isCustomer = item.request?.customerId === user?.id;
    const isProvider = !!providerId && item.providerId === providerId;
    const scheduled = item.status === 'SCHEDULED';
    return (
      <SectionCard>
        <Text style={{ textAlign: 'right', fontSize: fontSizes[17], fontWeight: '900', color: colors.ink }}>{item.request?.listing?.title || 'موعد خدمة'}</Text>
        <Text style={{ textAlign: 'right', fontWeight: '900', color: colors.brand }}>{labels[item.status || ''] || item.status || 'مجدول'}</Text>
        <Text style={{ textAlign: 'right', color: colors.ink }}>البداية: {formatted(item.scheduledStart)}</Text>
        <Text style={{ textAlign: 'right', color: colors.ink }}>النهاية: {formatted(item.scheduledEnd)}</Text>
        {item.notes ? <Text style={{ textAlign: 'right', color: colors.muted }}>{item.notes}</Text> : null}
        {scheduled && (isCustomer || isProvider) ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {isCustomer ? <View style={{ flex: 1, minWidth: 120 }}><PrimaryButton label="إلغاء الموعد" variant="danger" busy={busyId === item.id} disabled={Boolean(busyId)} onPress={() => update(item, 'CANCELLED')} /></View> : null}
            {isProvider && !isCustomer ? <>
              <View style={{ flex: 1, minWidth: 120 }}><PrimaryButton label="إتمام" variant="secondary" busy={busyId === item.id} disabled={Boolean(busyId)} onPress={() => update(item, 'COMPLETED')} /></View>
              <View style={{ flex: 1, minWidth: 120 }}><PrimaryButton label="لم يحضر" variant="secondary" busy={busyId === item.id} disabled={Boolean(busyId)} onPress={() => update(item, 'NO_SHOW')} /></View>
            </> : null}
          </View>
        ) : null}
      </SectionCard>
    );
  };

  return (
    <PageShell title="المواعيد" scroll={false}>
      <FlatList
        data={showInitialState ? [] : list.items}
        keyExtractor={(item) => item.id}
        {...marketListPerf}
        contentContainerStyle={{ paddingBottom: spacing.xl, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} />}
        ListHeaderComponent={(
          <View style={{ gap: spacing.md }}>
            <Notice tone="muted">تظهر هنا المواعيد المرتبطة بطلبات الخدمات. يمكن للعميل الإلغاء، ولمقدم الخدمة الإتمام أو تسجيل عدم الحضور.</Notice>
            {isRestoring || list.loading ? <View style={{ paddingVertical: spacing.md, alignItems: 'center' }}><ActivityIndicator color={colors.brand} /></View> : null}
            {needsLogin ? <PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} /> : null}
            {!isRestoring && list.error && list.items.length === 0 ? <><Notice>{list.error}</Notice><PrimaryButton label="إعادة المحاولة" variant="secondary" onPress={() => void list.retry()} /></> : null}
            {list.error && list.items.length > 0 ? <Notice>{list.error}</Notice> : null}
            {actionError ? <Notice>{actionError}</Notice> : null}
          </View>
        )}
        ListEmptyComponent={!showInitialState && !list.error ? <Notice tone="muted">لا توجد مواعيد حاليًا. بعد قبول طلب خدمة، يمكنك ترتيب موعد من تفاصيل الطلب.</Notice> : null}
        renderItem={renderAppointment}
        onEndReached={() => void list.loadMore()}
        onEndReachedThreshold={0.4}
        ListFooterComponent={list.loadingMore
          ? <View style={{ padding: spacing.md, alignItems: 'center' }}><ActivityIndicator color={colors.brand} /></View>
          : list.loadMoreError
            ? <View style={{ gap: spacing.sm }}><Notice>{list.loadMoreError}</Notice><PrimaryButton label="إعادة المحاولة" variant="secondary" onPress={() => void list.retry()} /></View>
            : list.hasNextPage
              ? <PrimaryButton label="تحميل مواعيد أقدم" variant="secondary" onPress={() => void list.loadMore()} />
              : null}
      />
    </PageShell>
  );
}
