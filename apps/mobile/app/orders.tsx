import { FlatList, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { AppText as Text } from '@/components/ui/AppText';
import {
  Badge,
  EmptyState,
  ErrorState,
  LoadingState,
  PageShell,
  PrimaryButton,
  SectionCard,
} from '@/components/ui';
import { AppIcon } from '@/components/Icons';
import { AppImage } from '@/components/AppImage';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing, radius, fontSizes, typography } from '@/theme/tokens';
import { formatDate, formatMoney } from '@/lib/formatters';
import { fetchMyOrders, type MarketplaceOrder } from '@/features/commerce/orders.api';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { useAuth } from '@/features/auth/AuthContext';
import { marketListPerf } from '@/lib/listPerformance';

const STATUS: Record<string, { label: string; tone: 'brand' | 'danger' | 'success' | 'muted' | 'accent' }> = {
  PENDING: { label: 'بانتظار تأكيد المتجر', tone: 'accent' },
  CONFIRMED: { label: 'تم تأكيد الطلب', tone: 'brand' },
  PROCESSING: { label: 'قيد التجهيز', tone: 'brand' },
  SHIPPED: { label: 'تم الشحن', tone: 'brand' },
  DELIVERED: { label: 'تم التسليم', tone: 'success' },
  CANCELLED: { label: 'ملغي', tone: 'danger' },
};

export default function MyOrdersScreen() {
  const { colors } = useAppTheme();
  const { accessToken, user, isRestoring } = useAuth();
  const list = usePaginatedList<MarketplaceOrder>({
    key: `my-orders:${user?.id ?? 'guest'}`,
    pageSize: 20,
    enabled: Boolean(accessToken && user && !isRestoring),
    fetchPage: async (page, signal) => {
      if (!accessToken) throw new Error('سجّل الدخول لعرض طلباتك.');
      const result = await fetchMyOrders(accessToken, page, undefined, user?.id, signal);
      return { items: result.items, meta: { page: result.page, totalPages: result.totalPages, total: result.total } };
    },
    getItemKey: (order) => order.id,
  });

  const needsLogin = !isRestoring && !user;
  const initialError = !!list.error && list.items.length === 0;

  let body;
  if (isRestoring || list.loading) {
    body = <LoadingState message="جاري تحميل الطلبات…" />;
  } else if (needsLogin) {
    body = (
      <EmptyState
        title="سجّل الدخول لعرض طلباتك"
        description="ستظهر مشترياتك بعد تسجيل الدخول بالحساب الذي أرسل الطلب."
        actionLabel="تسجيل الدخول"
        onAction={() => router.push('/login')}
      />
    );
  } else if (initialError) {
    body = <ErrorState description={list.error ?? undefined} onAction={() => void list.retry()} />;
  } else {
    body = (
      <FlatList
        data={list.items}
        keyExtractor={(order) => order.id}
        {...marketListPerf}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={list.refreshing}
            onRefresh={() => void list.refresh()}
            tintColor={colors.brand}
            colors={[colors.brand]}
          />
        }
        ListHeaderComponent={
          <>
            <Text style={{ fontSize: fontSizes[13], color: colors.muted, marginBottom: spacing.lg }}>
              تابع حالة مشترياتك وتفاصيل التسليم.
            </Text>
            {list.error ? (
              <Text accessibilityRole="alert" style={{ color: colors.danger, marginBottom: spacing.md }}>
                {list.error}
              </Text>
            ) : null}
          </>
        }
        ListEmptyComponent={
          <EmptyState
            title="لا توجد طلبات حتى الآن"
            description="عندما تطلب منتجًا من أحد المتاجر، سيظهر هنا."
            actionLabel="تصفح المنتجات"
            onAction={() => router.push('/products')}
          />
        }
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        renderItem={({ item: order }) => {
          const status = STATUS[order.status] ?? { label: order.status, tone: 'muted' as const };
          const first = order.items[0];
          const totalQty = order.items.reduce((sum, item) => sum + item.quantity, 0);
          return (
            <SectionCard
              accessibilityLabel={`تفاصيل الطلب ${order.id.slice(-8)}`}
              onPress={() => router.push(`/orders/${encodeURIComponent(order.id)}`)}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
                <Text style={{ ...typography.title, color: colors.brand }}>{formatMoney(order.total)}</Text>
                <Badge label={status.label} tone={status.tone} />
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                {first?.productImage ? (
                  <AppImage
                    uri={first.productImage}
                    style={{ width: 76, height: 76, borderRadius: radius.md, backgroundColor: colors.border }}
                    resizeMode="cover"
                  />
                ) : (
                  <View
                    style={{
                      width: 76,
                      height: 76,
                      borderRadius: radius.md,
                      backgroundColor: colors.brandSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: colors.brand }}>◇</Text>
                  </View>
                )}
                <View style={{ flex: 1, gap: spacing.xs, justifyContent: 'center' }}>
                  <Text numberOfLines={2} style={{ ...typography.subtitle, color: colors.ink, textAlign: 'right' }}>
                    {first?.productName || 'طلب منتجات'}
                  </Text>
                  <Text tone="muted" size={12}>
                    {order.items.length > 1 ? `و ${order.items.length - 1} منتجات أخرى · ` : ''}الكمية: {totalQty}
                  </Text>
                  <Text tone="muted" size={12}>
                    {order.store?.name || 'متجر'} · {formatDate(order.createdAt)}
                  </Text>
                </View>
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  paddingTop: spacing.sm,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <Text style={{ fontSize: fontSizes[13], fontWeight: '700', color: colors.brand }}>تفاصيل الطلب</Text>
                  <AppIcon name="forward" size={16} color={colors.brand} />
                </View>
                <Text style={{ fontSize: fontSizes[12], color: colors.muted }}>الدفع عند الاستلام</Text>
              </View>
            </SectionCard>
          );
        }}
        onEndReached={() => void list.loadMore()}
        onEndReachedThreshold={0.45}
        ListFooterComponent={
          list.loadingMore ? (
            <LoadingState message="تحميل الطلبات الأقدم…" />
          ) : list.loadMoreError ? (
            <PrimaryButton variant="secondary" label="تعذر تحميل المزيد — إعادة المحاولة" onPress={() => void list.retry()} />
          ) : list.hasNextPage ? (
            <PrimaryButton variant="secondary" label="عرض الطلبات الأقدم" onPress={() => void list.loadMore()} />
          ) : undefined
        }
      />
    );
  }

  return (
    <PageShell title="طلباتي" scroll={false}>
      {body}
    </PageShell>
  );
}
