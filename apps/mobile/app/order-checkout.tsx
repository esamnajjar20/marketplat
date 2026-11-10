import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Spinner } from '@/components/ui';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { router, useLocalSearchParams } from 'expo-router';
import { AppImage } from '@/components/AppImage';
import { Field, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import type { TextInputHandle } from '@/components/ui/Field';
import { AppText } from '@/components/ui/AppText';
import { fontSizes, radius, spacing, typography } from '@/theme/tokens';
import { useAuth } from '@/features/auth/AuthContext';
import { ApiError } from '@/api/client';
import { fetchProduct, type ProductSummary } from '@/features/commerce/commerce.api';
import { createMarketplaceOrder } from '@/features/commerce/orders.api';
import { enqueueMarketplaceOrder } from '@/storage/outbox-manager';
import { formatMoney } from '@/lib/formatters';

const money = (value: unknown) => formatMoney(value);
function makeKey() { return `mob-order-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`; }

export default function OrderCheckoutScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);

  const params = useLocalSearchParams<{ productId?: string | string[] }>();
  const productId = Array.isArray(params.productId) ? params.productId[0] : params.productId;
  const { user, accessToken, csrfToken, isRestoring } = useAuth();
  const [product, setProduct] = useState<ProductSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [recipientName, setRecipientName] = useState(user?.name ?? '');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [shippingCity, setShippingCity] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [buyerNote, setBuyerNote] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(makeKey);
  const nameRef = useRef<TextInputHandle>(null);
  const phoneRef = useRef<TextInputHandle>(null);
  const cityRef = useRef<TextInputHandle>(null);
  const addressRef = useRef<TextInputHandle>(null);
  const noteRef = useRef<TextInputHandle>(null);

  const load = useCallback(async () => {
    if (!productId) { setLoading(false); setError('معرّف المنتج غير صالح.'); return; }
    setLoading(true);
    setError('');
    try { setProduct(await fetchProduct(productId)); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل المنتج.'); }
    finally { setLoading(false); }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (user?.name && !recipientName) setRecipientName(user.name); }, [user?.name, recipientName]);

  const rawUnitPrice = product?.effectivePrice?.price ?? product?.effectivePrice?.amount ?? product?.discountPrice ?? product?.price;
  const unitPrice = Number(rawUnitPrice);
  const validPrice = rawUnitPrice !== undefined && rawUnitPrice !== null && rawUnitPrice !== '' && Number.isFinite(unitPrice) && unitPrice >= 0;
  const maxQuantity = Math.max(1, Math.min(product?.stockQuantity ?? 100, 100));
  const outOfStock = product?.availability === 'OUT_OF_STOCK' || (product?.stockQuantity != null && product.stockQuantity <= 0);
  const total = useMemo(() => unitPrice * quantity, [unitPrice, quantity]);

  const submit = async () => {
    if (!user || !accessToken) { router.push('/login'); return; }
    if (!product || !product.store?.id) { setError('لا يمكن تحديد المتجر المسؤول عن هذا المنتج.'); return; }
    if (outOfStock || (product.stockQuantity != null && quantity > product.stockQuantity)) { setError('الكمية المطلوبة غير متوفرة.'); return; }
    if (!validPrice) { setError('سعر المنتج غير صالح حاليًا. حدّث الصفحة أو تواصل مع المتجر.'); return; }
    if (recipientName.trim().length < 2 || recipientPhone.trim().length < 6 || shippingCity.trim().length < 2 || shippingAddress.trim().length < 4) {
      setError('أكمل الاسم ورقم الهاتف والمدينة والعنوان بشكل صحيح.');
      return;
    }

    setSubmitting(true);
    setError('');
    const payload = {
      items: [{ productId: product.id, quantity }],
      recipientName: recipientName.trim(),
      recipientPhone: recipientPhone.trim(),
      shippingCity: shippingCity.trim(),
      shippingAddress: shippingAddress.trim(),
      buyerNote: buyerNote.trim() || undefined,
      idempotencyKey,
    };
    try {
      const order = await createMarketplaceOrder(payload, accessToken, csrfToken);
      router.replace({ pathname: '/order-confirmation', params: { orderId: order.id, status: 'created' } });
    } catch (e) {
      // Queue only transport failures/unknown delivery outcomes; never replay a definitive API rejection.
      if (user.id && e instanceof ApiError && e.status === undefined) {
        try {
          await enqueueMarketplaceOrder(user.id, payload);
          router.replace({ pathname: '/order-confirmation', params: { status: 'queued' } });
          return;
        } catch (queueError) {
          setError(queueError instanceof Error ? queueError.message : 'تعذر حفظ الطلب دون اتصال.');
        }
      } else {
        setError(e instanceof Error ? e.message : 'تعذر إرسال الطلب. حاول مجددًا.');
        // Preserve the same idempotency key after ambiguous delivery or server errors.
        if (e instanceof ApiError && e.status !== undefined && e.status >= 400 && e.status < 500) setIdempotencyKey(makeKey());
      }
    } finally { setSubmitting(false); }
  };

  if (isRestoring) return <View style={styles.loading}><Spinner color={colors.brand}/><AppText style={styles.muted}>جارٍ التحقق من الجلسة…</AppText></View>;

  return (
    <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}>
      <PageShell title="إتمام الطلب">
        {loading ? <View style={styles.loading}><Spinner size="large" color={colors.brand}/><AppText style={styles.muted}>جارٍ تحميل المنتج…</AppText></View> : error && !product ? <>
          <Notice>{error}</Notice>
          <PrimaryButton label="إعادة المحاولة" variant="secondary" onPress={() => void load()} />
        </> : product ? <>
          <SectionCard>
            <View style={styles.productCard}>
              {product.images?.[0] ? <AppImage uri={product.images[0]} style={styles.image} resizeMode="cover"/> : <View style={styles.imagePlaceholder}><AppText style={styles.placeholderGlyph}>◇</AppText></View>}
              <View style={styles.productInfo}>
                <AppText style={styles.productName}>{product.name}</AppText>
                <AppText style={styles.muted}>{product.store?.name ?? 'المتجر'}</AppText>
                <AppText style={styles.price}>{validPrice ? money(unitPrice) : 'السعر غير متاح'}</AppText>
                {outOfStock ? <Notice>نفدت الكمية</Notice> : null}
                <View style={styles.qty}>
                  <Pressable accessibilityRole="button" accessibilityLabel="زيادة الكمية" accessibilityState={{ disabled: outOfStock || quantity >= maxQuantity }} disabled={outOfStock || quantity >= maxQuantity} onPress={() => setQuantity((q) => Math.min(q + 1, maxQuantity))} style={[styles.qtyButton, (outOfStock || quantity >= maxQuantity) && styles.disabled]}><AppText style={styles.qtyText}>+</AppText></Pressable>
                  <AppText style={styles.qtyNumber}>{quantity}</AppText>
                  <Pressable accessibilityRole="button" accessibilityLabel="تقليل الكمية" accessibilityState={{ disabled: quantity <= 1 }} disabled={quantity <= 1} onPress={() => setQuantity((q) => Math.max(1, q - 1))} style={[styles.qtyButton, quantity <= 1 && styles.disabled]}><AppText style={styles.qtyText}>−</AppText></Pressable>
                </View>
              </View>
            </View>
          </SectionCard>

          <SectionCard>
            <AppText style={styles.sectionTitle}>بيانات الاستلام</AppText>
            <Field label="اسم المستلم" value={recipientName} inputRef={nameRef} onChangeText={setRecipientName} placeholder="الاسم كما سيستلم الطلب" returnKeyType="next" onSubmitEditing={() => phoneRef.current?.focus()} />
            <Field label="رقم الهاتف" value={recipientPhone} onChangeText={setRecipientPhone} placeholder="05xxxxxxxx" keyboardType="phone-pad" inputRef={phoneRef} returnKeyType="next" onSubmitEditing={() => cityRef.current?.focus()} />
            <Field label="المدينة" value={shippingCity} onChangeText={setShippingCity} placeholder="المدينة" inputRef={cityRef} returnKeyType="next" onSubmitEditing={() => addressRef.current?.focus()} />
            <Field label="العنوان بالتفصيل" value={shippingAddress} onChangeText={setShippingAddress} placeholder="الحي والشارع وأقرب معلم" inputRef={addressRef} returnKeyType="next" onSubmitEditing={() => noteRef.current?.focus()} />
            <Field label="ملاحظات للبائع (اختياري)" value={buyerNote} onChangeText={setBuyerNote} placeholder="تفاصيل إضافية للتسليم" multiline maxLength={1000} inputRef={noteRef} returnKeyType="done" />
          </SectionCard>

          <SectionCard>
            <AppText style={styles.sectionTitle}>ملخص الطلب</AppText>
            <View style={styles.summaryRow}><AppText style={styles.muted}>طريقة الدفع</AppText><AppText style={styles.value}>الدفع عند الاستلام</AppText></View>
            <View style={styles.summaryRow}><AppText style={styles.muted}>قيمة المنتجات</AppText><AppText style={styles.value}>{money(total)}</AppText></View>
            <View style={styles.summaryRow}><AppText style={styles.muted}>التوصيل</AppText><AppText style={styles.value}>يُحدَّد عند تأكيد الطلب</AppText></View>
            <View style={styles.divider}/>
            <View style={styles.summaryRow}><AppText style={styles.totalLabel}>الإجمالي قبل رسوم التوصيل</AppText><AppText style={styles.total}>{money(total)}</AppText></View>
            {error ? <Notice>{error}</Notice> : null}
            <PrimaryButton label="تأكيد الطلب" onPress={() => void submit()} busy={submitting} disabled={submitting || outOfStock || !validPrice} />
            <AppText style={styles.note}>لن يتم خصم مبلغ إلكتروني. سيؤكد المتجر توفر المنتج وتفاصيل التسليم.</AppText>
          </SectionCard>
        </> : null}
      </PageShell>
    </KeyboardAvoidingView>
  );
}

const createThemeStyles = (colors: ColorPalette) => ({
  keyboard: { flex: 1 },
  loading: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, gap: spacing.md, padding: spacing.xl },
  muted: { color: colors.muted, ...typography.caption, textAlign: 'right' as const },
  productCard: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md },
  image: { width: 104, height: 112, borderRadius: radius.md, backgroundColor: colors.border },
  imagePlaceholder: { width: 104, height: 112, borderRadius: radius.md, backgroundColor: colors.brandSoft, alignItems: 'center' as const, justifyContent: 'center' as const },
  placeholderGlyph: { fontSize: fontSizes[34], color: colors.brandOnSoft },
  productInfo: { flex: 1, alignItems: 'flex-end' as const, gap: spacing.sm },
  productName: { color: colors.ink, ...typography.bodyStrong, textAlign: 'right' as const },
  price: { color: colors.brand, ...typography.subtitle },
  qty: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md },
  qtyButton:{width:44,height:44,minWidth:44,minHeight:44, borderRadius: radius.md, backgroundColor: colors.brandSoft, alignItems: 'center' as const, justifyContent: 'center' as const },
  qtyText: { fontSize: fontSizes[20], fontWeight: '700' as const, color: colors.brandOnSoft },
  qtyNumber: { ...typography.bodyStrong, color: colors.ink },
  sectionTitle: { color: colors.ink, ...typography.subtitle, textAlign: 'right' as const },
  summaryRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: spacing.md },
  value: { color: colors.ink, ...typography.captionStrong, textAlign: 'right' as const, flexShrink: 1 },
  divider: { height: 1, backgroundColor: colors.border },
  totalLabel: { color: colors.ink, ...typography.bodyStrong },
  total: { color: colors.brand, ...typography.subtitle },
  note: { color: colors.muted, ...typography.caption, textAlign: 'right' as const, lineHeight: 20 },
  disabled: { opacity: 0.45 },
});
