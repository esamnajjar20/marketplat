import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { AppIcon } from '@/components/Icons';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppImage } from '@/components/AppImage';
import { formatDate, formatMoney } from '@/lib/formatters';
import { fontSizes, colors, radius, spacing } from '@/theme/tokens';
import { fetchMyOrders, type MarketplaceOrder } from '@/features/commerce/orders.api';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { useAuth } from '@/features/auth/AuthContext';
import { marketListPerf } from '@/lib/listPerformance';

const labels: Record<string, string> = {
  PENDING: 'بانتظار تأكيد المتجر', CONFIRMED: 'تم تأكيد الطلب', PROCESSING: 'قيد التجهيز',
  SHIPPED: 'تم الشحن', DELIVERED: 'تم التسليم', CANCELLED: 'ملغي',
};

export default function MyOrdersScreen() {
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
  const showInitialState = isRestoring || list.loading || needsLogin || (!!list.error && list.items.length === 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={showInitialState ? [] : list.items}
        keyExtractor={(order) => order.id}
        {...marketListPerf}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} />}
        ListHeaderComponent={(
          <>
            <View style={styles.header}>
              <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} style={styles.back}><AppIcon name="back" size={24} color={colors.brand} /></Pressable>
              <Text style={styles.title}>طلباتي</Text>
            </View>
            <Text style={styles.subtitle}>تابع حالة مشترياتك وتفاصيل التسليم.</Text>
            {isRestoring || list.loading ? <View style={styles.state}><ActivityIndicator color={colors.brand} /><Text style={styles.muted}>جاري تحميل الطلبات…</Text></View> : null}
            {needsLogin ? <View style={styles.state}><Text style={styles.emptyTitle}>سجّل الدخول لعرض طلباتك</Text><Text style={styles.muted}>ستظهر مشترياتك بعد تسجيل الدخول بالحساب الذي أرسل الطلب.</Text><Pressable style={styles.primary} onPress={() => router.push('/login')}><Text style={styles.primaryText}>تسجيل الدخول</Text></Pressable></View> : null}
            {!isRestoring && !list.loading && list.error && list.items.length === 0 ? <View style={styles.state}><Text style={styles.error}>{list.error}</Text><Pressable style={styles.primary} onPress={() => void list.retry()}><Text style={styles.primaryText}>إعادة المحاولة</Text></Pressable></View> : null}
            {list.error && list.items.length > 0 ? <Text accessibilityRole="alert" style={styles.error}>{list.error}</Text> : null}
          </>
        )}
        ListEmptyComponent={!showInitialState ? <View style={styles.state}><Text style={styles.emptyTitle}>لا توجد طلبات حتى الآن</Text><Text style={styles.muted}>عندما تطلب منتجًا من أحد المتاجر، سيظهر هنا.</Text><Pressable style={styles.primary} onPress={() => router.push('/products')}><Text style={styles.primaryText}>تصفح المنتجات</Text></Pressable></View> : undefined}
        renderItem={({ item: order }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`تفاصيل الطلب ${order.id.slice(-8)}`} onPress={() => router.push(`/orders/${encodeURIComponent(order.id)}`)} style={styles.card}>
            <View style={styles.cardTop}><Text style={styles.total}>{formatMoney(order.total)}</Text><Text style={styles.status}>{labels[order.status] || order.status}</Text></View>
            <View style={styles.itemLine}>
              {order.items[0]?.productImage ? <AppImage uri={order.items[0].productImage} style={styles.image} resizeMode="cover" /> : <View style={styles.imagePlaceholder}><Text>◇</Text></View>}
              <View style={styles.itemInfo}>
                <Text style={styles.productName}>{order.items[0]?.productName || 'طلب منتجات'}</Text>
                <Text style={styles.muted}>{order.items.length > 1 ? `و ${order.items.length - 1} منتجات أخرى · ` : ''}الكمية: {order.items.reduce((sum, item) => sum + item.quantity, 0)}</Text>
                <Text style={styles.muted}>{order.store?.name || 'متجر'} · {formatDate(order.createdAt)}</Text>
              </View>
            </View>
            <View style={styles.cardBottom}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Text style={styles.link}>تفاصيل الطلب</Text><AppIcon name="forward" size={16} color={colors.brand} /></View><Text style={styles.muted}>الدفع عند الاستلام</Text></View>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        onEndReached={() => void list.loadMore()}
        onEndReachedThreshold={0.45}
        ListFooterComponent={list.loadingMore ? <View style={styles.footerLoading}><ActivityIndicator color={colors.brand} /><Text style={styles.muted}>تحميل الطلبات الأقدم…</Text></View> : list.loadMoreError ? <Pressable accessibilityRole="button" onPress={() => void list.retry()} style={styles.secondary}><Text style={styles.secondaryText}>تعذر تحميل المزيد — إعادة المحاولة</Text></Pressable> : list.hasNextPage ? <Pressable accessibilityRole="button" onPress={() => void list.loadMore()} style={styles.secondary}><Text style={styles.secondaryText}>عرض الطلبات الأقدم</Text></Pressable> : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas }, content: { padding: spacing.lg, paddingBottom: 52 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  back: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
title: { fontSize: fontSizes[24], fontWeight: '900', color: colors.ink, letterSpacing: -0.4 }, subtitle: { fontSize: fontSizes[13], color: colors.muted, textAlign: 'right', marginBottom: spacing.lg },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, elevation: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, total: { fontSize: fontSizes[17], fontWeight: '900', color: colors.brand },
  status: { fontSize: fontSizes[12], fontWeight: '800', color: colors.ink, backgroundColor: colors.brandSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, overflow: 'hidden' },
  itemLine: { flexDirection: 'row', gap: spacing.md }, image: { width: 76, height: 76, borderRadius: radius.md, backgroundColor: colors.border },
  imagePlaceholder: { width: 76, height: 76, borderRadius: radius.md, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  itemInfo: { flex: 1, alignItems: 'flex-end', gap: 5, justifyContent: 'center' }, productName: { fontSize: fontSizes[15], fontWeight: '800', color: colors.ink, textAlign: 'right' },
  muted: { fontSize: fontSizes[12], color: colors.muted, textAlign: 'right', lineHeight: 19 }, cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  link: { fontSize: fontSizes[13], fontWeight: '800', color: colors.brand }, state: { alignItems: 'center', gap: spacing.md, padding: spacing.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, marginTop: spacing.md },
  emptyTitle: { fontSize: fontSizes[17], fontWeight: '800', color: colors.ink }, primary: { backgroundColor: colors.brand, borderRadius: radius.md, padding: spacing.md }, primaryText: { color: colors.white, fontWeight: '800' },
  secondary: { minHeight: 48, borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm, backgroundColor: colors.surface }, secondaryText: { color: colors.brand, fontWeight: '800' },
  error: { color: colors.danger, textAlign: 'right' }, footerLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
});
