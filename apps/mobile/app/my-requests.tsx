import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMyRequests, type MarketplaceRequest } from '@/features/requests/requests.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { statusLabel } from '@/lib/status-labels';
import { fontSizes, spacing } from '@/theme/tokens';
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
          <PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} />
        </View>
      ) : (
        <FlatList
          data={list.items}
          keyExtractor={(item) => item.id}
          {...marketListPerf}
          contentContainerStyle={{ paddingBottom: 48, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} tintColor={colors.brand} />}
          ListHeaderComponent={
            <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
              
              <PrimaryButton label="+ طلب جديد" onPress={() => router.push('/request-create')} />
              {list.loading ? <ActivityIndicator color={colors.brand} /> : null}
              {list.error ? <Notice>{list.error}</Notice> : null}
              {list.error && list.items.length === 0 ? <PrimaryButton label="إعادة المحاولة" variant="secondary" onPress={() => void list.refresh()} /> : null}
            </View>
          }
          ListEmptyComponent={!list.loading && !list.error ? <Notice tone="muted">لم تنشر أي طلب بعد.</Notice> : undefined}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/requests/[id]', params: { id: item.id } })}>
              <SectionCard>
                <Text style={{ textAlign: 'right', fontSize: fontSizes[17], fontWeight: '900', color: colors.ink }}>{item.title}</Text>
                <Text style={{ textAlign: 'right', color: colors.brand, fontWeight: '800' }}>الحالة: {statusLabel(item.status || 'OPEN')}</Text>
                <Text style={{ textAlign: 'right', color: colors.muted }}>{item._count?.offers ?? item.offers?.length ?? 0} عروض · {item.city || 'مدينة غير محددة'}</Text>
              </SectionCard>
            </Pressable>
          )}
          ListFooterComponent={
            list.loadingMore ? <ActivityIndicator color={colors.brand} /> : list.loadMoreError ? (
              <View style={{ gap: spacing.sm }}>
                <Notice>{list.loadMoreError}</Notice>
                <PrimaryButton label="إعادة محاولة تحميل المزيد" variant="secondary" onPress={() => void list.loadMore()} />
              </View>
            ) : list.hasNextPage ? <PrimaryButton label="تحميل المزيد" variant="secondary" onPress={() => void list.loadMore()} /> : undefined
          }
          onEndReached={() => { void list.loadMore(); }}
          onEndReachedThreshold={0.4}
        />
      )}
    </PageShell>
  );
}
