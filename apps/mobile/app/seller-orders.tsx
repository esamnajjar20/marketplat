import { RefreshControl, View } from 'react-native';

import { pushOnce } from '@/lib/navigation';
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
import { spacing, radius, fontSizes, typography, fontWeights } from '@/theme/tokens';
import { formatDate, formatMoney } from '@/lib/formatters';
import { fetchSellerOrders, type MarketplaceOrder } from '@/features/commerce/orders.api';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { useAuth } from '@/features/auth/AuthContext';
import { AppFlashList } from '@/components/ui/AppFlashList';
import { ListGapMd } from '@/components/ui/ListSeparator';

const STATUS: Record<string, { label: string; tone: 'brand' | 'danger' | 'success' | 'muted' | 'accent' }> = {
  PENDING: { label: 'بانتظار التأكيد', tone: 'accent' },
  CONFIRMED: { label: 'تم التأكيد', tone: 'brand' },
  PROCESSING: { label: 'قيد التجهيز', tone: 'brand' },
  SHIPPED: { label: 'تم الشحن', tone: 'brand' },
  DELIVERED: { label: 'تم التسليم', tone: 'success' },
  CANCELLED: { label: 'ملغي', tone: 'danger' },
};

export default function SellerOrdersScreen() {
  const { colors } = useAppTheme();
  const { accessToken, user, isRestoring } = useAuth();
  const list = usePaginatedList<MarketplaceOrder>({
    key: `seller-orders:${user?.id ?? 'guest'}`,
    pageSize: 20,
    enabled: Boolean(accessToken && user && !isRestoring),
    fetchPage: async (page, signal) => {
      if (!accessToken) throw new Error('سجّل الدخول لعرض طلبات متجرك.');
      const result = await fetchSellerOrders(accessToken, page, undefined, user?.id, signal);
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
        title="سجّل الدخول لعرض طلبات متجرك"
        description="ستظهر الطلبات الواردة بعد تسجيل الدخول بالحساب المالك للمتجر."
        actionLabel="تسجيل الدخول"
        onAction={() => pushOnce('/login')}
      />
    );
  } else if (initialError) {
    body = <ErrorState description={list.error ?? undefined} onAction={() => void list.retry()} />;
  } else {
    body = (
      <AppFlashList
        data={list.items}
        keyExtractor={(order) => order.id}
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
              الطلبات الواردة للمتجر الذي تملكه.
            </Text>
            {list.error ? (
              <Text accessibilityRole="alert" style={{ color: colors.danger, marginBottom: spacing.md }}>
                {list.error}
              </Text>
            ) : null}
          </>
        }
        ListEmptyComponent={
          <EmptyState title="لا توجد طلبات واردة" description="ستظهر هنا الطلبات الجديدة من المشترين." />
        }
        ItemSeparatorComponent={ListGapMd}
        renderItem={({ item: order }) => {
          const status = STATUS[order.status] ?? { label: order.status, tone: 'muted' as const };
          const first = order.items[0];
          const totalQty = order.items.reduce((sum, item) => sum + item.quantity, 0);
          return (
            <SectionCard
              accessibilityLabel={`فتح طلب ${order.id.slice(-8)}`}
              onPress={() => pushOnce(`/orders/${encodeURIComponent(order.id)}`)}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
                <Text style={{ ...typography.title, color: colors.brand }}>{formatMoney(order.total)}</Text>
                <Badge label={status.label} tone={status.tone} />
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                {first?.productImage ? (
                  <AppImage variant="list"
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
                    المشتري: {order.buyer?.name || order.recipientName}
                  </Text>
                  <Text tone="muted" size={12}>
                    الكمية: {totalQty} · {formatDate(order.createdAt, 'date')}
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
                  <Text style={{ fontSize: fontSizes[13], fontWeight: fontWeights.bold, color: colors.brand }}>فتح الطلب وإدارة حالته</Text>
                  <AppIcon name="forward" size={16} color={colors.brand} />
                </View>
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
    <PageShell title="طلبات متجري" scroll={false}>
      {body}
    </PageShell>
  );
}
