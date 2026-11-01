import { AppText as Text } from '@/components/ui/AppText';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  fetchMarketplaceOrder,
  updateMarketplaceOrderStatus,
  type MarketplaceOrder,
  type MarketplaceOrderStatus,
} from '@/features/commerce/orders.api';
import { useAuth } from '@/features/auth/AuthContext';
import {
  Badge,
  DetailScaffold,
  PrimaryButton,
  SectionCard,
} from '@/components/MobileUI';
import { fontSizes, colors, radius, spacing, typography } from '@/theme/tokens';
import { AppImage } from '@/components/AppImage';

const labels: Record<string, string> = {
  PENDING: 'بانتظار تأكيد المتجر',
  CONFIRMED: 'تم تأكيد الطلب',
  PROCESSING: 'قيد التجهيز',
  SHIPPED: 'تم الشحن',
  DELIVERED: 'تم التسليم',
  CANCELLED: 'ملغي',
};

const money = (v: unknown) =>
  `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(Number(v) || 0)} ₪`;

const nextStatus: Partial<Record<MarketplaceOrderStatus, MarketplaceOrderStatus>> = {
  PENDING: 'CONFIRMED',
  CONFIRMED: 'PROCESSING',
  PROCESSING: 'SHIPPED',
  SHIPPED: 'DELIVERED',
};

export default function OrderDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { user, accessToken, csrfToken, isRestoring } = useAuth();
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;
  const [order, setOrder] = useState<MarketplaceOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const token = tokenRef.current;
    if (!id) { setLoading(false); setOrder(null); setError('معرّف الطلب غير صالح.'); return; }
    if (!token) { setLoading(false); setOrder(null); setError('سجّل الدخول لعرض تفاصيل الطلب.'); return; }
    setLoading(true);
    setError('');
    try {
      setOrder(await fetchMarketplaceOrder(id, token, user?.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل الطلب.');
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => {
    if (!isRestoring) void load();
  }, [load, isRestoring]);

  const changeStatus = async (status: MarketplaceOrderStatus, sellerNote?: string) => {
    const token = tokenRef.current;
    if (!order || !token) return;
    setBusy(true);
    setError('');
    try {
      setOrder(await updateMarketplaceOrderStatus(order.id, status, token, csrfToken, sellerNote));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحديث حالة الطلب.');
    } finally {
      setBusy(false);
    }
  };

  const confirmChange = (status: MarketplaceOrderStatus, title: string, message: string, sellerNote?: string) =>
    Alert.alert(title, message, [
      { text: 'رجوع', style: 'cancel' },
      { text: 'تأكيد', style: status === 'CANCELLED' ? 'destructive' : 'default', onPress: () => void changeStatus(status, sellerNote) },
    ]);

  const isSeller = !!user && order?.sellerId === user.id;
  const isBuyer = !!user && order?.buyerId === user.id;
  const advance = order ? nextStatus[order.status] : undefined;

  return (
    <DetailScaffold
      title="تفاصيل الطلب"
      loading={loading || isRestoring}
      loadingMessage="جاري تحميل التفاصيل…"
      error={error && !order ? error : null}
      onRetry={() => {
        void load();
      }}
      footer={
        order ? (
          <View style={{ gap: spacing.sm }}>
            {isSeller && advance ? (
              <PrimaryButton label={`تحديث الحالة → ${labels[advance] || advance}`} busy={busy} onPress={() => confirmChange(advance, 'تحديث حالة الطلب', `تحويل الطلب إلى «${labels[advance]}»؟`)} />
            ) : null}
            {isSeller && (order.status === 'PENDING' || order.status === 'CONFIRMED') ? (
              <PrimaryButton label="رفض / إلغاء الطلب" variant="danger" busy={busy} onPress={() => confirmChange('CANCELLED', 'إلغاء الطلب من المتجر', 'سيُلغى الطلب وتُعاد الكمية المحجوزة إلى المخزون. هل تريد المتابعة؟', 'اعتذار من المتجر: تعذر توفير المنتج.')} />
            ) : null}
            {isBuyer && order.status === 'PENDING' ? (
              <PrimaryButton label="إلغاء الطلب" variant="danger" busy={busy} onPress={() => confirmChange('CANCELLED', 'إلغاء الطلب', 'هل تريد إلغاء هذا الطلب؟')} />
            ) : null}
          </View>
        ) : !isRestoring && !user ? (
          <PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} />
        ) : null
      }
    >
      {order ? (
        <View style={styles.pad}>
          <SectionCard>
            <View style={styles.statusRow}>
              <Text style={styles.orderId}>#{order.id.slice(-8).toUpperCase()}</Text>
              <Badge label={labels[order.status] || order.status} tone="brand" />
            </View>
            <Text style={styles.muted}>
              تاريخ الطلب: {new Date(order.createdAt).toLocaleString('ar')}
            </Text>
            <Text style={styles.storeName}>{order.store?.name || 'المتجر'}</Text>

            {order.items.map((item) => (
              <View key={item.id} style={styles.itemLine}>
                {item.productImage ? (
                  <AppImage uri={item.productImage} style={styles.image} resizeMode="cover" />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Text>◇</Text>
                  </View>
                )}
                <View style={styles.itemInfo}>
                  <Text style={styles.productName}>{item.productName}</Text>
                  <Text style={styles.muted}>
                    {item.quantity} × {money(item.unitPrice)}
                  </Text>
                  <Text style={styles.lineTotal}>{money(item.lineTotal)}</Text>
                </View>
              </View>
            ))}

            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.muted}>قيمة المنتجات</Text>
              <Text style={styles.value}>{money(order.subtotal)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.muted}>التوصيل</Text>
              <Text style={styles.value}>{money(order.shippingFee)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.totalLabel}>الإجمالي</Text>
              <Text style={styles.total}>{money(order.total)}</Text>
            </View>
          </SectionCard>

          <SectionCard>
            <Text style={styles.sectionTitle}>بيانات الاستلام</Text>
            <Text style={styles.value}>{order.recipientName}</Text>
            <Text style={styles.value}>{order.recipientPhone}</Text>
            <Text style={styles.value}>
              {order.shippingCity} — {order.shippingAddress}
            </Text>
            {order.buyerNote ? (
              <Text style={styles.muted}>ملاحظة المشتري: {order.buyerNote}</Text>
            ) : null}
            <Text style={styles.muted}>
              الدفع عند الاستلام · {order.paymentStatus === 'PAID' ? 'مدفوع' : 'غير مدفوع'}
            </Text>
          </SectionCard>

          {error ? <Text style={styles.errorInline}>{error}</Text> : null}

          {order.store?.id ? (
            <PrimaryButton
              label="عرض المتجر"
              variant="secondary"
              onPress={() => router.push(`/stores/${encodeURIComponent(order.store!.id)}`)}
            />
          ) : null}
        </View>
      ) : null}
    </DetailScaffold>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.md, gap: spacing.md },
  statusRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  orderId: { ...typography.captionStrong, color: colors.muted },
  storeName: { ...typography.subtitle, color: colors.ink, textAlign: 'right' },
  itemLine: { flexDirection: 'row-reverse', gap: spacing.md, alignItems: 'center' },
  image: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.border },
  imagePlaceholder: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: { flex: 1, alignItems: 'flex-end', gap: 4 },
  productName: { ...typography.bodyStrong, color: colors.ink, textAlign: 'right' },
  lineTotal: { ...typography.bodyStrong, color: colors.brand },
  muted: { ...typography.caption, color: colors.muted, textAlign: 'right', lineHeight: 19 },
  divider: { height: 1, backgroundColor: colors.border },
  summaryRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  value: { ...typography.captionStrong, color: colors.ink, textAlign: 'right', flexShrink: 1 },
  totalLabel: { ...typography.bodyStrong, color: colors.ink },
  total: { fontSize: fontSizes[19], fontWeight: '900', color: colors.brand },
  sectionTitle: { ...typography.subtitle, color: colors.ink, textAlign: 'right' },
  errorInline: { ...typography.caption, color: colors.danger, textAlign: 'right' },
});
