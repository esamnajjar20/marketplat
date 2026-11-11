import { useAppTheme } from '@/theme/ThemeProvider';
import { formatMoney } from '@/lib/formatters';
import { AppIcon } from '@/components/Icons';
import { AppImage } from '@/components/AppImage';
import { marketListPerf } from '@/lib/listPerformance';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { FlatList, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchFollowingFeed, type FollowingFeedItem } from '@/features/account/social.api';
import { AppHeader, EmptyState, ErrorState, LoadingState, PrimaryButton } from '@/components/MobileUI';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fontSizes, radius, spacing, fontWeights } from '@/theme/tokens';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { toAppHref } from '@/lib/typed-navigation';

const PAGE_SIZE = 20;
const itemKey = (item: FollowingFeedItem) => `${item.type}:${item.id}`;

function price(value?: number | string | null): string {
  if (value === null || value === undefined || value === '') return 'السعر عند التواصل';
  const amount = Number(value);
  return Number.isFinite(amount) ? formatMoney(amount) : 'السعر غير متاح';
}

function target(item: FollowingFeedItem): string {
  return item.type === 'AD' ? `/ads/${encodeURIComponent(item.id)}` : item.type === 'PRODUCT' ? `/products/${encodeURIComponent(item.id)}` : `/services/${encodeURIComponent(item.id)}`;
}

export default function FollowingFeedScreen() {
  const { colors } = useAppTheme();

  const { user, getAccessToken, isRestoring } = useAuth();
  const list = usePaginatedList<FollowingFeedItem>({
    key: `following-feed:${user?.id ?? 'guest'}`,
    pageSize: PAGE_SIZE,
    enabled: !isRestoring && Boolean(user),
    fetchPage: async (page, signal) => {
      const token = getAccessToken();
      if (!token) throw new Error('انتهت جلسة الدخول. سجّل الدخول مجددًا.');
      return fetchFollowingFeed(token, page, PAGE_SIZE, signal);
    },
    getItemKey: itemKey,
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}>
      <AppHeader title="نشاط من تتابعهم" />
      {isRestoring ? <LoadingState message="جارٍ استعادة الجلسة…" /> : !user ? (
        <EmptyState title="سجّل الدخول أولًا" description="سجّل الدخول لمشاهدة أحدث نشاط من الحسابات التي تتابعها." actionLabel="تسجيل الدخول" onAction={() => router.push('/login')} />
      ) : list.loading ? <LoadingState message="جارٍ تحميل الموجز…" /> : list.error && !list.items.length ? (
        <ErrorState title="تعذر تحميل الموجز" description={list.error} onAction={() => void list.refresh()} />
      ) : (
        <FlatList
          {...marketListPerf}
          data={list.items}
          keyExtractor={itemKey}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.x4l, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} tintColor={colors.brand} />}
          ListEmptyComponent={<EmptyState title="لا يوجد نشاط بعد" description="ستظهر هنا الإعلانات والمنتجات والخدمات الجديدة من الحسابات والمتاجر التي تتابعها." />}
          ListHeaderComponent={list.error ? <ErrorState title="تعذر تحديث الموجز" description={list.error} onAction={() => void list.refresh()} /> : undefined}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`فتح ${item.type === 'AD' ? 'الإعلان' : item.type === 'PRODUCT' ? 'المنتج' : 'الخدمة'}: ${item.title}`}
              onPress={() => router.push(toAppHref(target(item)))}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
            >
              {item.images?.[0] ? (
                <AppImage uri={item.images[0]} style={{ width: 76, height: 76, borderRadius: radius.md, backgroundColor: colors.border }} />
              ) : (
                <View style={{ width: 76, height: 76, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft }}>
                  <Text style={{ color: colors.brandOnSoft, fontWeight: fontWeights.bold }}>{item.type === 'AD' ? 'إعلان' : item.type === 'PRODUCT' ? 'منتج' : 'خدمة'}</Text>
                </View>
              )}
              <View style={{ flex: 1, gap: 5, alignItems: 'flex-end' }}>
                <Text numberOfLines={2} tone="ink" strong>{item.title}</Text>
                <Text style={{ color: colors.brand, fontWeight: fontWeights.bold }}>{price(item.price)}</Text>
                <Text style={{ color: colors.muted, fontSize: fontSizes[12] }}>{item.type === 'AD' ? 'إعلان' : item.type === 'PRODUCT' ? 'منتج' : 'خدمة'}{item.city ? ` · ${item.city}` : ''}</Text>
              </View>
              <AppIcon name="forward" size={20} color={colors.brand} />
            </Pressable>
          )}
          ListFooterComponent={
            list.loadingMore ? <LoadingState message="جارٍ تحميل المزيد…" /> : list.loadMoreError ? (
              <View style={{ gap: spacing.sm }}>
                <ErrorState title="تعذر تحميل بقية الموجز" description={list.loadMoreError} onAction={() => void list.loadMore()} />
              </View>
            ) : list.hasNextPage ? <PrimaryButton label="تحميل المزيد" variant="secondary" onPress={() => void list.loadMore()} /> : undefined
          }
          onEndReached={() => { void list.loadMore(); }}
          onEndReachedThreshold={0.4}
        />
      )}
    </SafeAreaView>
  );
}
