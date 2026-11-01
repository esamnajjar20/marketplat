import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { AppIcon } from '@/components/Icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppImage } from '@/components/AppImage';
import { formatSafeDate } from '@/lib/date-format';
import { fontSizes, colors, radius, spacing } from '@/theme/tokens';
import { fetchMyOrders, type MarketplaceOrder } from '@/features/commerce/orders.api';
import { useAuth } from '@/features/auth/AuthContext';
import { marketListPerf } from '@/lib/listPerformance';

const money = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(amount)} ₪` : 'غير متاح';
};
const labels: Record<string, string> = {
  PENDING: 'بانتظار تأكيد المتجر', CONFIRMED: 'تم تأكيد الطلب', PROCESSING: 'قيد التجهيز',
  SHIPPED: 'تم الشحن', DELIVERED: 'تم التسليم', CANCELLED: 'ملغي',
};

export default function MyOrdersScreen() {
  const { accessToken, user, isRestoring } = useAuth();
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;
  const [items, setItems] = useState<MarketplaceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const sequence = useRef(0);
  const loadingMoreRef = useRef(false);

  const load = useCallback(async (refresh = false) => {
    const token = tokenRef.current;
    const requestId = ++sequence.current;
    if (!token) {
      setItems([]);
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      return;
    }
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    if (refresh) {
      setPage(1);
      setTotalPages(1);
    }
    try {
      const result = await fetchMyOrders(token, 1, undefined, user?.id);
      if (requestId !== sequence.current) return;
      setItems(result.items);
      setPage(result.page);
      setTotalPages(result.totalPages);
    } catch (cause) {
      if (requestId === sequence.current) setError(cause instanceof Error ? cause.message : 'تعذر تحميل الطلبات.');
    } finally {
      if (requestId === sequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [user?.id]);

  const loadMore = useCallback(async () => {
    const token = tokenRef.current;
    if (!token || loading || refreshing || loadingMoreRef.current || page >= totalPages) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const requestId = sequence.current;
    const nextPage = page + 1;
    try {
      const result = await fetchMyOrders(token, nextPage, undefined, user?.id);
      if (requestId !== sequence.current) return;
      setItems((previous) => {
        const seen = new Set(previous.map((item) => item.id));
        return [...previous, ...result.items.filter((item) => !seen.has(item.id))];
      });
      setPage(result.page);
      setTotalPages(result.totalPages);
    } catch (cause) {
      if (requestId === sequence.current) setError(cause instanceof Error ? cause.message : 'تعذر تحميل الطلبات الأقدم.');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [loading, refreshing, page, totalPages, user?.id]);

  useEffect(() => {
    if (!isRestoring) void load();
    return () => { sequence.current += 1; };
  }, [isRestoring, load]);

  const needsLogin = !isRestoring && !user;
  const showInitialState = isRestoring || loading || needsLogin || (!!error && items.length === 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={showInitialState ? [] : items}
        keyExtractor={(order) => order.id}
        {...marketListPerf}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
        ListHeaderComponent={(
          <>
            <View style={styles.header}>
              <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} style={styles.back}><AppIcon name="back" size={24} color={colors.brand} /></Pressable>
              <Text style={styles.title}>طلباتي</Text>
            </View>
            <Text style={styles.subtitle}>تابع حالة مشترياتك وتفاصيل التسليم.</Text>
            {isRestoring || loading ? <View style={styles.state}><ActivityIndicator color={colors.brand} /><Text style={styles.muted}>جاري تحميل الطلبات…</Text></View> : null}
            {needsLogin ? <View style={styles.state}><Text style={styles.emptyTitle}>سجّل الدخول لعرض طلباتك</Text><Text style={styles.muted}>ستظهر مشترياتك بعد تسجيل الدخول بالحساب الذي أرسل الطلب.</Text><Pressable style={styles.primary} onPress={() => router.push('/login')}><Text style={styles.primaryText}>تسجيل الدخول</Text></Pressable></View> : null}
            {!isRestoring && !loading && error && items.length === 0 ? <View style={styles.state}><Text style={styles.error}>{error}</Text><Pressable style={styles.primary} onPress={() => void load(true)}><Text style={styles.primaryText}>إعادة المحاولة</Text></Pressable></View> : null}
            {error && items.length > 0 ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          </>
        )}
        ListEmptyComponent={!showInitialState ? <View style={styles.state}><Text style={styles.emptyTitle}>لا توجد طلبات حتى الآن</Text><Text style={styles.muted}>عندما تطلب منتجًا من أحد المتاجر، سيظهر هنا.</Text><Pressable style={styles.primary} onPress={() => router.push('/products')}><Text style={styles.primaryText}>تصفح المنتجات</Text></Pressable></View> : null}
        renderItem={({ item: order }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`تفاصيل الطلب ${order.id.slice(-8)}`} onPress={() => router.push(`/orders/${encodeURIComponent(order.id)}`)} style={styles.card}>
            <View style={styles.cardTop}><Text style={styles.total}>{money(order.total)}</Text><Text style={styles.status}>{labels[order.status] || order.status}</Text></View>
            <View style={styles.itemLine}>
              {order.items[0]?.productImage ? <AppImage uri={order.items[0].productImage} style={styles.image} resizeMode="cover" /> : <View style={styles.imagePlaceholder}><Text>◇</Text></View>}
              <View style={styles.itemInfo}>
                <Text style={styles.productName}>{order.items[0]?.productName || 'طلب منتجات'}</Text>
                <Text style={styles.muted}>{order.items.length > 1 ? `و ${order.items.length - 1} منتجات أخرى · ` : ''}الكمية: {order.items.reduce((sum, item) => sum + item.quantity, 0)}</Text>
                <Text style={styles.muted}>{order.store?.name || 'متجر'} · {formatSafeDate(order.createdAt)}</Text>
              </View>
            </View>
            <View style={styles.cardBottom}><Text style={styles.link}>تفاصيل الطلب ‹</Text><Text style={styles.muted}>الدفع عند الاستلام</Text></View>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.45}
        ListFooterComponent={loadingMore ? <View style={styles.footerLoading}><ActivityIndicator color={colors.brand} /><Text style={styles.muted}>تحميل الطلبات الأقدم…</Text></View> : page < totalPages ? <Pressable accessibilityRole="button" onPress={() => void loadMore()} style={styles.secondary}><Text style={styles.secondaryText}>عرض الطلبات الأقدم</Text></Pressable> : null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas }, content: { padding: spacing.lg, paddingBottom: 52 },
  header: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  back: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
title: { fontSize: fontSizes[24], fontWeight: '900', color: colors.ink, letterSpacing: -0.4 }, subtitle: { fontSize: fontSizes[13], color: colors.muted, textAlign: 'right', marginBottom: spacing.lg },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, elevation: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, total: { fontSize: fontSizes[17], fontWeight: '900', color: colors.brand },
  status: { fontSize: fontSizes[12], fontWeight: '800', color: colors.ink, backgroundColor: colors.brandSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, overflow: 'hidden' },
  itemLine: { flexDirection: 'row-reverse', gap: spacing.md }, image: { width: 76, height: 76, borderRadius: radius.md, backgroundColor: colors.border },
  imagePlaceholder: { width: 76, height: 76, borderRadius: radius.md, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  itemInfo: { flex: 1, alignItems: 'flex-end', gap: 5, justifyContent: 'center' }, productName: { fontSize: fontSizes[15], fontWeight: '800', color: colors.ink, textAlign: 'right' },
  muted: { fontSize: fontSizes[12], color: colors.muted, textAlign: 'right', lineHeight: 19 }, cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  link: { fontSize: fontSizes[13], fontWeight: '800', color: colors.brand }, state: { alignItems: 'center', gap: spacing.md, padding: spacing.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, marginTop: spacing.md },
  emptyTitle: { fontSize: fontSizes[17], fontWeight: '800', color: colors.ink }, primary: { backgroundColor: colors.brand, borderRadius: radius.md, padding: spacing.md }, primaryText: { color: colors.white, fontWeight: '800' },
  secondary: { minHeight: 48, borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm, backgroundColor: colors.surface }, secondaryText: { color: colors.brand, fontWeight: '800' },
  error: { color: colors.danger, textAlign: 'right' }, footerLoading: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
});
