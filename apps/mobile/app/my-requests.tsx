import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { FlatList, RefreshControl, View } from 'react-native';
import { ListEmpty, ListStaleError, PaginatedFooter } from '@/components/ui';
import { router } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyRequests, type MarketplaceRequest } from '@/features/requests/requests.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { statusLabel } from '@/lib/status-labels';
import { spacing } from '@/theme/tokens';
import { marketListPerf } from '@/lib/listPerformance';
import { usePaginatedList } from '@/hooks/usePaginatedList';

const PAGE_SIZE = 30;

export default function MyRequestsScreen() {
  const { colors } = useAppTheme();

  const { user, getAccessToken } = useAuth();
  const list = usePaginatedList<MarketplaceRequest>({
    key: `my-requests:${user?.id ?? 'guest'}`,
    pageSize: PAGE_SIZE,
    enabled: Boolean(user),
    fetchPage: async (page, signal) => {
      const token = getAccessToken();
      if (!token) throw new Error('انتهت جلسة الدخول. سجّل الدخول مجددًا.');
      const result = await fetchMyRequests(token, user?.id, page, PAGE_SIZE, signal);
      return { items: result.items, meta: { page: result.page, totalPages: result.totalPages, total: result.total } };
    },
    getItemKey: (item) => item.id,
  });

  return (
    <PageShell title="طلباتي" scroll={false}>
      {!user ? (
        <View style={{ gap: spacing.md }}>
          <Notice>سجّل الدخول لعرض طلباتك.</Notice>
          <PrimaryButton label="تسجيل الدخول" onPress={() => pushOnce('/login')} />
        </View>
      ) : (
        <FlatList
          data={list.items}
          keyExtractor={(item) => item.id}
          {...marketListPerf}
          contentContainerStyle={{ paddingBottom: spacing.x4l, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} tintColor={colors.brand} />}
          ListHeaderComponent={
            <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
              
              <PrimaryButton label="+ طلب جديد" onPress={() => router.push('/request-create')} />
              <ListStaleError list={list} />
            </View>
          }
          ListEmptyComponent={<ListEmpty list={list} loadingMessage="جاري تحميل طلباتك…" errorTitle="تعذر تحميل الطلبات" emptyTitle="لم تنشر أي طلب بعد" />}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/requests/[id]', params: { id: item.id } })}>
              <SectionCard>
                <Text tone="ink" strong size={17}>{item.title}</Text>
                <Text tone="brand" strong>الحالة: {statusLabel(item.status || 'OPEN')}</Text>
                <Text tone="muted">{item._count?.offers ?? item.offers?.length ?? 0} عروض · {item.city || 'مدينة غير محددة'}</Text>
              </SectionCard>
            </Pressable>
          )}
          ListFooterComponent={
            <PaginatedFooter list={list} />
          }
          onEndReached={() => { void list.loadMore(); }}
          onEndReachedThreshold={0.4}
        />
      )}
    </PageShell>
  );
}
