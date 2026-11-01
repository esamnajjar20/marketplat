import { formatMoney } from '@/lib/formatters';
import { showToast } from '@/lib/toast';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { deleteMyServiceListing, fetchMyServiceListingsPage, type ServiceListing } from '@/features/services/services.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { statusLabel } from '@/lib/status-labels';
import { fontSizes, colors } from '@/theme/tokens';
import { usePaginatedList } from '@/hooks/usePaginatedList';

export default function MyServicesScreen() {
  const { user, accessToken, csrfToken } = useAuth();
  const fetchPage = useCallback(async (page: number, signal: AbortSignal) => {
    if (!accessToken) return { items: [], meta: { page: 1, totalPages: 1 } };
    const result = await fetchMyServiceListingsPage(accessToken, page, 30, signal);
    return { items: result.items, meta: { page: result.page, totalPages: result.totalPages, total: result.total } };
  }, [accessToken]);
  const list = usePaginatedList<ServiceListing>({
    key: `my-services:${user?.id ?? 'anonymous'}:${Boolean(accessToken)}`,
    pageSize: 30,
    enabled: Boolean(accessToken),
    fetchPage,
    getItemKey: (item) => item.id,
    mapError: () => 'تعذر تحميل خدماتك. حاول مجددًا.',
  });

  const remove = (id: string) => Alert.alert('حذف الخدمة', 'هل تريد حذف هذه الخدمة؟', [
    { text: 'إلغاء', style: 'cancel' },
    {
      text: 'حذف',
      style: 'destructive',
      onPress: () => {
        if (!accessToken) return;
        void deleteMyServiceListing(id, accessToken, csrfToken)
          .then(() => list.refresh())
          .catch((error) => showToast('تعذر الحذف', error instanceof Error ? error.message : 'حاول مجددًا.', 'error'));
      },
    },
  ]);

  return <PageShell title="خدماتي">
    <Text style={{ textAlign: 'right', fontSize: fontSizes[12], lineHeight: 20, color: colors.muted }}>نظّم خدماتك وتابع أسعارها وحالتها من مكان واحد.</Text>
    <PrimaryButton label="+ إضافة خدمة" onPress={() => router.push('/service-editor')} />
    {!accessToken ? <><Notice>سجّل الدخول لإدارة خدماتك.</Notice><PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} /></> : list.loading && list.items.length === 0 ? <ActivityIndicator color={colors.brand} /> : list.error && list.items.length === 0 ? <><Notice>{list.error}</Notice><PrimaryButton label="إعادة المحاولة" onPress={() => void list.retry()} /></> : list.items.length === 0 ? <Notice tone="muted">لم تضف أي خدمة بعد. أنشئ أول خدمة ليتمكن العملاء من العثور عليها.</Notice> : <>
      {list.error ? <Notice>{list.error}</Notice> : null}
      {list.items.map((item) => <SectionCard key={item.id}>
        <Pressable onPress={() => router.push({ pathname: '/services/[id]', params: { id: item.id } })}><Text style={{ textAlign: 'right', fontSize: fontSizes[16], fontWeight: '800', color: colors.ink }}>{item.title}</Text></Pressable>
        <Text style={{ textAlign: 'right', color: colors.muted }}>{item.category?.nameAr || item.category?.name || 'بدون تصنيف'}</Text>
        <Text style={{ textAlign: 'right', color: colors.brand, fontWeight: '800' }}>{item.pricingType === 'NEGOTIABLE' ? 'السعر قابل للتفاوض' : formatMoney(item.price)}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><PrimaryButton label="تعديل" variant="secondary" onPress={() => router.push({ pathname: '/service-editor', params: { id: item.id } })} /></View><View style={{ flex: 1 }}><PrimaryButton label="حذف" variant="danger" onPress={() => remove(item.id)} /></View></View>
        <Text style={{ textAlign: 'right', color: colors.muted, fontSize: fontSizes[12] }}>الحالة: {statusLabel(item.status || 'ACTIVE')}</Text>
      </SectionCard>)}
      {list.loadMoreError ? <Notice>{list.loadMoreError}</Notice> : null}
      {list.hasNextPage ? <PrimaryButton label={list.loadingMore ? 'جارٍ التحميل…' : list.loadMoreError ? 'إعادة المحاولة' : 'تحميل المزيد'} busy={list.loadingMore} onPress={() => void list.loadMore()} /> : null}
    </>}
  </PageShell>;
}
