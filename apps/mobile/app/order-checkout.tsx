import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { colors, radius, spacing } from '@/theme/tokens';
import { fetchProduct, type ProductSummary } from '@/features/commerce/commerce.api';
import { createMarketplaceOrder } from '@/features/commerce/orders.api';
import { enqueueMarketplaceOrder } from '@/storage/order-outbox';
import { ApiError } from '@/api/client';
import { useAuth } from '@/features/auth/AuthContext';

const money = (value: unknown) => `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(Number(value) || 0)} ₪`;
function makeKey() { return `mob-order-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`; }
export default function OrderCheckoutScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const { user, accessToken, csrfToken, isRestoring } = useAuth();
  const [product, setProduct] = useState<ProductSummary | null>(null);
  const [loading, setLoading] = useState(true); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState('');
  const [quantity, setQuantity] = useState(1); const [recipientName, setRecipientName] = useState(user?.name ?? '');
  const [recipientPhone, setRecipientPhone] = useState(''); const [shippingCity, setShippingCity] = useState(''); const [shippingAddress, setShippingAddress] = useState(''); const [buyerNote, setBuyerNote] = useState('');
  const [idempotencyKey] = useState(makeKey);
  const load = useCallback(async () => { if (!productId) return; setLoading(true); setError(''); try { setProduct(await fetchProduct(productId)); } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل المنتج.'); } finally { setLoading(false); } }, [productId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (user?.name && !recipientName) setRecipientName(user.name); }, [user?.name, recipientName]);
  // Some API responses expose the computed effective price as `amount` rather than `price`.
  // Prefer either computed value before falling back to legacy discount/base fields.
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
    if (recipientName.trim().length < 2 || recipientPhone.trim().length < 6 || shippingCity.trim().length < 2 || shippingAddress.trim().length < 4) { setError('أكمل الاسم ورقم الهاتف والمدينة والعنوان بشكل صحيح.'); return; }
    setSubmitting(true); setError('');
    try {
      const payload = { items: [{ productId: product.id, quantity }], recipientName: recipientName.trim(), recipientPhone: recipientPhone.trim(), shippingCity: shippingCity.trim(), shippingAddress: shippingAddress.trim(), buyerNote: buyerNote.trim() || undefined, idempotencyKey };
      const order = await createMarketplaceOrder(payload, accessToken, csrfToken);
      Alert.alert('تم إرسال الطلب', 'استلم المتجر طلبك. يمكنك متابعة حالته من صفحة طلباتي.', [{ text: 'عرض الطلب', onPress: () => router.replace(`/orders/${encodeURIComponent(order.id)}`) }]);
    } catch (e) {
      // Queue only transport failures/unknown delivery outcomes. Validation, stock,
      // authorization and other explicit server errors must be shown, not replayed.
      if (user?.id && accessToken && e instanceof ApiError && e.status === undefined) {
        try {
          await enqueueMarketplaceOrder(user.id, { items: [{ productId: product.id, quantity }], recipientName: recipientName.trim(), recipientPhone: recipientPhone.trim(), shippingCity: shippingCity.trim(), shippingAddress: shippingAddress.trim(), buyerNote: buyerNote.trim() || undefined, idempotencyKey });
          Alert.alert('حُفظ الطلب على الجهاز', 'لم يؤكد الخادم استلام الطلب. حُفظ محليًا وسيُعاد إرساله عند عودة الاتصال، وقد يتغير السعر أو المخزون قبل المزامنة.', [{ text: 'عرض العمليات', onPress: () => router.replace('/offline-queue') }]);
          return;
        } catch (queueError) { setError(queueError instanceof Error ? queueError.message : 'تعذر حفظ الطلب دون اتصال.'); }
      } else setError(e instanceof Error ? e.message : 'تعذر إرسال الطلب. حاول مجددًا.');
    }
    finally { setSubmitting(false); }
  };
  if (isRestoring) return <SafeAreaView style={s.safe}><View style={s.state}><ActivityIndicator color={colors.brand}/><Text style={s.muted}>جارٍ التحقق من الجلسة…</Text></View></SafeAreaView>;
  return <SafeAreaView style={s.safe} edges={['top']}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"><View style={s.header}><Pressable onPress={() => router.back()} style={s.back}><Text style={s.backText}>→</Text></Pressable><Text style={s.title}>إتمام الطلب</Text></View>
    {loading ? <View style={s.state}><ActivityIndicator size="large" color={colors.brand}/><Text style={s.muted}>جاري تحميل المنتج…</Text></View> : error && !product ? <View style={s.state}><Text style={s.muted}>{error}</Text><Pressable style={s.primary} onPress={() => void load()}><Text style={s.primaryText}>إعادة المحاولة</Text></Pressable></View> : product ? <>
      <View style={s.productCard}>{product.images?.[0] ? <Image source={{ uri: product.images[0] }} style={s.image}/> : <View style={s.imagePlaceholder}><Text>◇</Text></View>}<View style={s.productInfo}><Text style={s.productName}>{product.name}</Text><Text style={s.muted}>{product.store?.name ?? 'المتجر'}</Text><Text style={s.price}>{validPrice ? money(unitPrice) : 'السعر غير متاح'}</Text>{outOfStock ? <Text style={s.error}>نفدت الكمية</Text> : null}<View style={s.qty}><Pressable accessibilityLabel="زيادة الكمية" disabled={outOfStock || quantity >= maxQuantity} onPress={() => setQuantity(q => Math.min(q + 1, maxQuantity))} style={[s.qtyButton, (outOfStock || quantity >= maxQuantity) && s.disabled]}><Text style={s.qtyText}>+</Text></Pressable><Text style={s.qtyNumber}>{quantity}</Text><Pressable accessibilityLabel="تقليل الكمية" onPress={() => setQuantity(q => Math.max(1, q - 1))} style={s.qtyButton}><Text style={s.qtyText}>−</Text></Pressable></View></View></View>
      <View style={s.card}><Text style={s.sectionTitle}>بيانات الاستلام</Text>{[[recipientName,setRecipientName,'اسم المستلم'],[recipientPhone,setRecipientPhone,'رقم الهاتف'],[shippingCity,setShippingCity,'المدينة'],[shippingAddress,setShippingAddress,'العنوان بالتفصيل'],[buyerNote,setBuyerNote,'ملاحظات للبائع (اختياري)']].map(([value,setter,placeholder]: any) => <TextInput key={placeholder} value={value} onChangeText={setter} placeholder={placeholder} placeholderTextColor={colors.muted} style={[s.input, placeholder.includes('ملاحظات') && s.multiline]} textAlign="right" multiline={placeholder.includes('ملاحظات')} maxLength={placeholder.includes('ملاحظات') ? 1000 : undefined}/>)}
      <View style={s.divider}/><View style={s.summaryRow}><Text style={s.muted}>طريقة الدفع</Text><Text style={s.value}>الدفع عند الاستلام</Text></View><View style={s.summaryRow}><Text style={s.muted}>قيمة المنتجات</Text><Text style={s.value}>{money(total)}</Text></View><View style={s.summaryRow}><Text style={s.muted}>التوصيل</Text><Text style={s.value}>مجاني حاليًا</Text></View><View style={s.summaryRow}><Text style={s.totalLabel}>الإجمالي الحالي</Text><Text style={s.total}>{money(total)}</Text></View>
      {error ? <Text style={s.error}>{error}</Text> : null}<Pressable disabled={submitting || outOfStock || !validPrice} onPress={() => void submit()} style={[s.primary, (submitting || outOfStock || !validPrice) && s.disabled]}>{submitting ? <ActivityIndicator color="#fff"/> : <Text style={s.primaryText}>تأكيد الطلب</Text>}</Pressable><Text style={s.note}>لن يتم خصم أي مبلغ إلكتروني. سيؤكد المتجر توفر المنتج وتفاصيل التسليم.</Text></View>
    </> : null}</ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({ safe:{flex:1,backgroundColor:colors.canvas},content:{padding:spacing.lg,gap:spacing.lg,paddingBottom:40},header:{flexDirection:'row-reverse',alignItems:'center',gap:spacing.md},back:{width:44,height:44,borderRadius:14,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},backText:{fontSize:24,color:colors.brand},title:{fontSize:22,fontWeight:'800',color:colors.ink},productCard:{flexDirection:'row-reverse',gap:spacing.md,padding:spacing.md,borderRadius:radius.lg,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},image:{width:104,height:112,borderRadius:radius.md,backgroundColor:colors.border},imagePlaceholder:{width:104,height:112,borderRadius:radius.md,backgroundColor:colors.brandSoft,alignItems:'center',justifyContent:'center'},productInfo:{flex:1,alignItems:'flex-end',gap:spacing.sm},productName:{fontSize:16,fontWeight:'800',color:colors.ink,textAlign:'right'},price:{fontSize:17,fontWeight:'900',color:colors.brand},muted:{fontSize:13,color:colors.muted,textAlign:'right',lineHeight:20},qty:{flexDirection:'row',alignItems:'center',gap:spacing.md},qtyButton:{width:32,height:32,borderRadius:10,backgroundColor:colors.brandSoft,alignItems:'center',justifyContent:'center'},qtyText:{fontSize:20,fontWeight:'800',color:colors.brand},qtyNumber:{fontWeight:'800',color:colors.ink},card:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:spacing.lg,gap:spacing.md},sectionTitle:{fontSize:17,fontWeight:'800',color:colors.ink,textAlign:'right'},input:{minHeight:48,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,paddingHorizontal:spacing.md,color:colors.ink,backgroundColor:colors.canvas},multiline:{minHeight:80,textAlignVertical:'top',paddingTop:spacing.md},divider:{height:1,backgroundColor:colors.border},summaryRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:spacing.md},value:{fontSize:13,fontWeight:'700',color:colors.ink,textAlign:'right',flexShrink:1},totalLabel:{fontSize:15,fontWeight:'800',color:colors.ink},total:{fontSize:20,fontWeight:'900',color:colors.brand},primary:{minHeight:50,backgroundColor:colors.brand,borderRadius:radius.md,alignItems:'center',justifyContent:'center',padding:spacing.md},primaryText:{fontSize:15,fontWeight:'800',color:'#fff'},disabled:{opacity:0.6},error:{fontSize:13,color:colors.danger,textAlign:'right'},note:{fontSize:12,color:colors.muted,textAlign:'right',lineHeight:19},state:{alignItems:'center',gap:spacing.md,padding:spacing.xl,backgroundColor:colors.surface,borderRadius:radius.lg}});
