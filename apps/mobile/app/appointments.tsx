import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { ListEmpty, ListStaleError, PaginatedFooter, LoadingState, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/ui';
import { confirmAlert } from '@/lib/confirm';
import { router } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyAppointments, updateAppointmentStatus, type AppointmentRow } from '@/features/appointments/appointments.api';
import { fetchMyServiceProvider } from '@/features/services/providers.api';
import { spacing } from '@/theme/tokens';
import { formatDate } from '@/lib/formatters';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { marketListPerf } from '@/lib/listPerformance';

const labels: Record<string, string> = { SCHEDULED: 'مجدول', COMPLETED: 'مكتمل', CANCELLED: 'ملغى', NO_SHOW: 'لم يحضر' };

export default function AppointmentsScreen() {
  const { colors } = useAppTheme();

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
    confirmAlert('تحديث الموعد', `هل تريد تغيير الحالة إلى «${labels[status]}»؟`, [
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
        <Text tone="ink" strong size={17}>{item.request?.listing?.title || 'موعد خدمة'}</Text>
        <Text tone="brand" strong>{labels[item.status || ''] || item.status || 'مجدول'}</Text>
        <Text tone="ink">البداية: {formatted(item.scheduledStart)}</Text>
        <Text tone="ink">النهاية: {formatted(item.scheduledEnd)}</Text>
        {item.notes ? <Text tone="muted">{item.notes}</Text> : undefined}
        {scheduled && (isCustomer || isProvider) ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {isCustomer ? <View style={{ flex: 1, minWidth: 120 }}><PrimaryButton label="إلغاء الموعد" variant="danger" busy={busyId === item.id} disabled={Boolean(busyId)} onPress={() => update(item, 'CANCELLED')} /></View> : undefined}
            {isProvider && !isCustomer ? <>
              <View style={{ flex: 1, minWidth: 120 }}><PrimaryButton label="إتمام" variant="secondary" busy={busyId === item.id} disabled={Boolean(busyId)} onPress={() => update(item, 'COMPLETED')} /></View>
              <View style={{ flex: 1, minWidth: 120 }}><PrimaryButton label="لم يحضر" variant="secondary" busy={busyId === item.id} disabled={Boolean(busyId)} onPress={() => update(item, 'NO_SHOW')} /></View>
            </> : undefined}
          </View>
        ) : undefined}
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
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} tintColor={colors.brand} />}
        ListHeaderComponent={(
          <View style={{ gap: spacing.md }}>
            <Notice tone="muted">تظهر هنا المواعيد المرتبطة بطلبات الخدمات. يمكن للعميل الإلغاء، ولمقدم الخدمة الإتمام أو تسجيل عدم الحضور.</Notice>
            {needsLogin ? <PrimaryButton label="تسجيل الدخول" onPress={() => pushOnce('/login')} /> : undefined}
            <ListStaleError list={list} />
            {actionError ? <Notice>{actionError}</Notice> : undefined}
          </View>
        )}
        ListEmptyComponent={isRestoring ? <LoadingState message="جارٍ استعادة الجلسة…" /> : needsLogin ? undefined : <ListEmpty list={list} loadingMessage="جاري تحميل المواعيد…" errorTitle="تعذر تحميل المواعيد" emptyTitle="لا توجد مواعيد حاليًا" emptyDescription="بعد قبول طلب خدمة، يمكنك ترتيب موعد من تفاصيل الطلب." />}
        renderItem={renderAppointment}
        onEndReached={() => void list.loadMore()}
        onEndReachedThreshold={0.4}
        ListFooterComponent={<PaginatedFooter list={list} moreLabel="تحميل مواعيد أقدم" />}
      />
    </PageShell>
  );
}
