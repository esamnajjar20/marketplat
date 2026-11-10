import { useAppTheme } from '@/theme/ThemeProvider';
import { formatMoney } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { FlatList, RefreshControl, View } from 'react-native';
import { Spinner } from '@/components/ui';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyOffers, type RequestOffer } from '@/features/requests/requests.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { statusLabel } from '@/lib/status-labels';
import { spacing } from '@/theme/tokens';
import { marketListPerf } from '@/lib/listPerformance';
import { usePaginatedList } from '@/hooks/usePaginatedList';

const PAGE_SIZE = 30;

export default function MyOffersScreen() {
  const { colors } = useAppTheme();

  const { user, getAccessToken } = useAuth();
  const list = usePaginatedList<RequestOffer>({
    key: `my-offers:${user?.id ?? 'guest'}`,
    pageSize: PAGE_SIZE,
    enabled: Boolean(user),
    fetchPage: async (page, signal) => {
      const token = getAccessToken();
      if (!token) throw new Error('انتهت جلسة الدخول. سجّل الدخول مجددًا.');
      const result = await fetchMyOffers(token, user?.id, page, PAGE_SIZE, signal);
      return { items: result.items, meta: { page: result.page, totalPages: result.totalPages, total: result.total } };
    },
    getItemKey: (item) => item.id,
  });

  return (
    <PageShell title="عروضي" scroll={false}>
      <FlatList
        data={user ? list.items : []}
        keyExtractor={(item, index) => item.id || String(index)}
        {...marketListPerf}
        contentContainerStyle={{ paddingBottom: spacing.x4l, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} tintColor={colors.brand} />}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <PrimaryButton label="استعراض الطلبات المفتوحة" onPress={() => router.push('/requests')} />
            {!user ? <Notice>سجّل الدخول لعرض عروضك.</Notice> : null}
            {list.loading ? <Spinner color={colors.brand} /> : null}
            {list.error ? <Notice>{list.error}</Notice> : null}
            {list.error && list.items.length === 0 ? <PrimaryButton label="إعادة المحاولة" variant="secondary" onPress={() => void list.refresh()} /> : null}
          </View>
        }
        ListEmptyComponent={user && !list.loading && !list.error ? <Notice tone="muted">لم تقدم أي عروض بعد.</Notice> : undefined}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => item.request?.id && router.push({ pathname: '/requests/[id]', params: { id: item.request.id } })}>
            <SectionCard>
              <Text tone="ink" strong size={17}>{item.request?.title || 'عرض على طلب'}</Text>
              <Text tone="brand" strong size={20}>{formatMoney(item.price)}</Text>
              <Text tone="muted">{item.message || 'بدون رسالة'}</Text>
              <Text tone="muted" size={12}>الحالة: {statusLabel(item.status || 'PENDING')}</Text>
            </SectionCard>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListFooterComponent={
          list.loadingMore ? <Spinner color={colors.brand} /> : list.loadMoreError ? (
            <View style={{ gap: spacing.sm }}>
              <Notice>{list.loadMoreError}</Notice>
              <PrimaryButton label="إعادة محاولة تحميل المزيد" variant="secondary" onPress={() => void list.loadMore()} />
            </View>
          ) : list.hasNextPage ? <PrimaryButton label="تحميل المزيد" variant="secondary" onPress={() => void list.loadMore()} /> : undefined
        }
        onEndReached={() => { void list.loadMore(); }}
        onEndReachedThreshold={0.4}
      />
    </PageShell>
  );
}
