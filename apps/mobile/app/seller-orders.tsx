import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { AppIcon } from '@/components/Icons';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AppImage } from '@/components/AppImage';
import { fontSizes, colors, radius, spacing } from '@/theme/tokens';
import { fetchSellerOrders, type MarketplaceOrder } from '@/features/commerce/orders.api';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { useAuth } from '@/features/auth/AuthContext';
import { marketListPerf } from '@/lib/listPerformance';
import { formatDate, formatMoney } from '@/lib/formatters';

const labels: Record<string, string> = { PENDING: 'بانتظار التأكيد', CONFIRMED: 'تم التأكيد', PROCESSING: 'قيد التجهيز', SHIPPED: 'تم الشحن', DELIVERED: 'تم التسليم', CANCELLED: 'ملغي' };
const money = (value: unknown) => formatMoney(value);

export default function SellerOrdersScreen() {
  const { accessToken, isRestoring, user } = useAuth();
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
  const initialState = isRestoring || list.loading || needsLogin || (!!list.error && list.items.length === 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={initialState ? [] : list.items}
        keyExtractor={(order) => order.id}
        {...marketListPerf}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} />}
        ListHeaderComponent={(
          <>
            <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} style={styles.back}><AppIcon name="back" size={24} color={colors.brand} /></Pressable><Text style={styles.title}>طلبات متجري</Text></View>
            <Text style={styles.subtitle}>الطلبات الواردة للمتجر الذي تملكه.</Text>
            {isRestoring || list.loading ? <View style={styles.state}><ActivityIndicator color={colors.brand} /><Text style={styles.muted}>جاري تحميل الطلبات…</Text></View> : null}
            {needsLogin ? <View style={styles.state}><Text style={styles.emptyTitle}>سجّل الدخول لعرض طلبات متجرك</Text><Text style={styles.muted}>ستظهر الطلبات الواردة بعد تسجيل الدخول بالحساب المالك للمتجر.</Text><Pressable onPress={() => router.push('/login')} style={styles.primary}><Text style={styles.primaryText}>تسجيل الدخول</Text></Pressable></View> : null}
            {!isRestoring && !list.loading && list.error && list.items.length === 0 ? <View style={styles.state}><Text style={styles.error}>{list.error}</Text><Pressable onPress={() => void list.retry()} style={styles.primary}><Text style={styles.primaryText}>إعادة المحاولة</Text></Pressable></View> : null}
            {list.error && list.items.length > 0 ? <Text accessibilityRole="alert" style={styles.error}>{list.error}</Text> : null}
          </>
        )}
        ListEmptyComponent={!initialState ? <View style={styles.state}><Text style={styles.emptyTitle}>لا توجد طلبات واردة</Text><Text style={styles.muted}>ستظهر هنا الطلبات الجديدة من المشترين.</Text></View> : undefined}
        renderItem={({ item: order }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`فتح طلب ${order.id.slice(-8)}`} onPress={() => router.push(`/orders/${encodeURIComponent(order.id)}`)} style={styles.card}>
            <View style={styles.cardTop}><Text style={styles.total}>{money(order.total)}</Text><Text style={styles.status}>{labels[order.status] || order.status}</Text></View>
            <View style={styles.itemLine}>
              {order.items[0]?.productImage ? <AppImage uri={order.items[0].productImage} style={styles.image} resizeMode="cover" /> : <View style={styles.imagePlaceholder}><Text>◇</Text></View>}
              <View style={styles.itemInfo}><Text style={styles.productName}>{order.items[0]?.productName || 'طلب منتجات'}</Text><Text style={styles.muted}>المشتري: {order.buyer?.name || order.recipientName}</Text><Text style={styles.muted}>الكمية: {order.items.reduce((sum, item) => sum + item.quantity, 0)} · {formatDate(order.createdAt, 'date')}</Text></View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Text style={styles.link}>فتح الطلب وإدارة حالته</Text><AppIcon name="forward" size={16} color={colors.brand} /></View>
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
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, elevation: 1 }, cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  total: { fontSize: fontSizes[17], fontWeight: '900', color: colors.brand }, status: { fontSize: fontSizes[12], fontWeight: '800', color: colors.ink, backgroundColor: colors.brandSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, overflow: 'hidden' },
  itemLine: { flexDirection: 'row', gap: spacing.md }, image: { width: 76, height: 76, borderRadius: radius.md, backgroundColor: colors.border }, imagePlaceholder: { width: 76, height: 76, borderRadius: radius.md, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  itemInfo: { flex: 1, alignItems: 'flex-end', gap: 5, justifyContent: 'center' }, productName: { fontSize: fontSizes[15], fontWeight: '800', color: colors.ink, textAlign: 'right' }, muted: { fontSize: fontSizes[12], color: colors.muted, textAlign: 'right', lineHeight: 19 },
  link: { fontSize: fontSizes[13], fontWeight: '800', color: colors.brand, textAlign: 'right' }, state: { alignItems: 'center', gap: spacing.md, padding: spacing.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, marginTop: spacing.md },
  emptyTitle: { fontSize: fontSizes[17], fontWeight: '800', color: colors.ink }, primary: { minHeight: 48, backgroundColor: colors.brand, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: colors.white, fontWeight: '800' },
  secondary: { minHeight: 48, borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm, backgroundColor: colors.surface }, secondaryText: { color: colors.brand, fontWeight: '800' }, error: { color: colors.danger, textAlign: 'right' }, footerLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
});
