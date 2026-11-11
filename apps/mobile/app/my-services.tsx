import { useAppTheme } from '@/theme/ThemeProvider';
import { formatMoney } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Press } from '@/components/AccessiblePressable';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { ListEmpty, ListStaleError, PaginatedFooter, Notice, PageShell, PrimaryButton, SectionCard, LoadingState } from '@/components/ui';
import { confirmAlert } from '@/lib/confirm';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { deleteMyServiceListing, fetchMyServiceListingsPage, type ServiceListing } from '@/features/services/services.api';
import { statusLabel } from '@/lib/status-labels';
import { fontSizes, spacing } from '@/theme/tokens';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { marketListPerf } from '@/lib/listPerformance';
import { showToast } from '@/lib/toast';

export default function MyServicesScreen() {
  const { colors } = useAppTheme();

  const { user, accessToken, csrfToken, isRestoring } = useAuth();
  const [deletingId, setDeletingId] = useState('');
  const fetchPage = useCallback(async (page: number, signal: AbortSignal) => {
    if (!accessToken) return { items: [], meta: { page: 1, totalPages: 1 } };
    const result = await fetchMyServiceListingsPage(accessToken, page, 30, signal);
    return { items: result.items, meta: { page: result.page, totalPages: result.totalPages, total: result.total } };
  }, [accessToken]);
  const list = usePaginatedList<ServiceListing>({
    key: `my-services:${user?.id ?? 'anonymous'}:${Boolean(accessToken)}`,
    pageSize: 30,
    enabled: Boolean(accessToken && user && !isRestoring),
    fetchPage,
    getItemKey: (item) => item.id,
    mapError: () => 'تعذر تحميل خدماتك. حاول مرة أخرى.',
  });

  const remove = (id: string) => confirmAlert('حذف الخدمة', 'هل تريد حذف هذه الخدمة؟', [
    { text: 'إلغاء', style: 'cancel' },
    {
      text: 'حذف',
      style: 'destructive',
      onPress: () => {
        if (!accessToken || deletingId) return;
        setDeletingId(id);
        void deleteMyServiceListing(id, accessToken, csrfToken)
          .then(async () => {
            list.updateItems((current) => current.filter((item) => item.id !== id));
            showToast('تم حذف الخدمة', 'تم حذف الخدمة من قائمتك.', 'success');
            await list.refresh();
          })
          .catch((error) => showToast('تعذر الحذف', error instanceof Error ? error.message : 'حاول مرة أخرى.', 'error'))
          .finally(() => setDeletingId(''));
      },
    },
  ]);

  const needsLogin = !isRestoring && (!accessToken || !user);
  const initialLoading = isRestoring || (list.loading && list.items.length === 0);

  return (
    <PageShell title="خدماتي" scroll={false}>
      <FlatList
        data={initialLoading || needsLogin || (list.error && list.items.length === 0) ? [] : list.items}
        keyExtractor={(item) => item.id}
        {...marketListPerf}
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: spacing.xl }}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} tintColor={colors.brand} />}
        ListHeaderComponent={(
          <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
            
            <Text style={{ textAlign: 'right', fontSize: fontSizes[12], lineHeight: 20, color: colors.muted }}>نظّم خدماتك وتابع أسعارها وحالتها من مكان واحد.</Text>
            {needsLogin ? <><Notice>سجّل الدخول لإدارة خدماتك.</Notice><PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} /></> : undefined}
            {!needsLogin && accessToken ? <PrimaryButton label="+ إضافة خدمة" onPress={() => router.push('/service-editor')} /> : undefined}
            <ListStaleError list={list} />
          </View>
        )}
        ListEmptyComponent={isRestoring ? <LoadingState message="جارٍ استعادة الجلسة…" /> : needsLogin ? undefined : <ListEmpty list={list} loadingMessage="جاري تحميل خدماتك…" errorTitle="تعذر تحميل الخدمات" emptyTitle="لم تضف أي خدمة بعد" emptyDescription="أنشئ أول خدمة ليتمكن العملاء من العثور عليها." />}
        renderItem={({ item }) => (
          <SectionCard>
            <Press accessibilityRole="button" onPress={() => router.push({ pathname: '/services/[id]', params: { id: item.id } })}>
              <Text tone="ink" strong size={16}>{item.title}</Text>
            </Press>
            <Text tone="muted">{item.category?.nameAr || item.category?.name || 'بدون تصنيف'}</Text>
            <Text tone="brand" strong>{item.pricingType === 'NEGOTIABLE' ? 'السعر قابل للتفاوض' : formatMoney(item.price)}</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}><PrimaryButton label="تعديل" variant="secondary" onPress={() => router.push({ pathname: '/service-editor', params: { id: item.id } })} /></View>
              <View style={{ flex: 1 }}><PrimaryButton label="حذف" variant="danger" busy={deletingId === item.id} disabled={Boolean(deletingId)} onPress={() => remove(item.id)} /></View>
            </View>
            <Text tone="muted" size={12}>الحالة: {statusLabel(item.status || 'ACTIVE')}</Text>
          </SectionCard>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListFooterComponent={<PaginatedFooter list={list} />}
      />
    </PageShell>
  );
}
