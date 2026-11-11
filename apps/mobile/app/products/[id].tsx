import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { formatDate, formatMoney, formatNumber } from '@/lib/formatters';
import { AppIcon } from '@/components/Icons';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useState , useMemo} from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { fetchProduct, fetchProducts, type ProductSummary } from '@/features/commerce/commerce.api';
import { startConversationWithUser } from '@/features/messaging/messaging.api';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMixedRecommendations, type RecommendationItem } from '@/features/discovery/discovery.api';
import { Badge, DetailScaffold, PrimaryButton, SecondaryButton, SectionCard } from '@/components/ui';
import { FavoriteButton } from '@/components/ui/FavoriteButton';
import { MediaGallery } from '@/components/ui/MediaGallery';
import { ProductAttributeList } from '@/components/ui/ProductAttributeList';
import { RatingStars } from '@/components/ui/RatingStars';
import { ShareButton } from '@/components/ui/ShareButton';
import { ProductCard } from '@/components/ui/ProductCard';
import { fontSizes, radius, spacing, typography, fontWeights } from '@/theme/tokens';
import { showToast } from '@/lib/toast';
import { COPY } from '@/lib/copy';

function money(value: unknown): string {
  const n = Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isFinite(n)
    ? formatMoney(n)
    : 'السعر عند التواصل';
}
function availabilityLabel(value?: string): string {
  if (value === 'OUT_OF_STOCK') return 'غير متوفر';
  if (value === 'LIMITED') return 'كمية محدودة';
  return 'متوفر';
}
function dateLabel(value?: string): string | null {
  if (!value) return null;
  const formatted = formatDate(value, 'date');
  return formatted === 'غير متاح' ? null : formatted;
}
function displayPayments(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      const row = item as Record<string, unknown>;
      const label = row.labelAr ?? row.label ?? row.nameAr ?? row.name ?? row.method;
      return typeof label === 'string' ? label : '';
    }
    return '';
  }).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,،؛|]/).map((part) => part.trim()).filter(Boolean);
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).filter(([, enabled]) => enabled === true).map(([key]) => key);
  }
  return [];
}

export default function ProductDetailScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);

  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { user, accessToken, csrfToken } = useAuth();
  const [contacting, setContacting] = useState(false);
  const [item, setItem] = useState<ProductSummary | null>(null);
  const [sameStoreProducts, setSameStoreProducts] = useState<ProductSummary[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) { setLoading(false); setError('معرّف المنتج غير صالح.'); return; }
    setLoading(true);
    setError(null);
    try { setItem(await fetchProduct(id)); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل المنتج.'); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let active = true;
    if (!item?.id) return () => { active = false; };
    // These calls happen once per product detail, never once per recommendation card.
    void Promise.allSettled([
      item.store?.id ? fetchProducts({ storeId: item.store.id, page: 1, limit: 7 }) : Promise.resolve({ items: [] as ProductSummary[] }),
      fetchMixedRecommendations(8, accessToken),
    ]).then(([storeResult, recResult]) => {
      if (!active) return;
      if (storeResult.status === 'fulfilled') setSameStoreProducts(storeResult.value.items.filter((product) => product.id !== item.id).slice(0, 6));
      if (recResult.status === 'fulfilled') setRecommendations((recResult.value.products ?? []).filter((product) => product.id !== item.id).slice(0, 6));
    });
    return () => { active = false; };
  }, [accessToken, item?.id, item?.store?.id]);

  const canOrder = !!item?.store?.id && item?.store?.sellerProfile?.userId !== user?.id && item.availability !== 'OUT_OF_STOCK' && item.status !== 'PAUSED' && item.status !== 'DELETED';
  const sellerUserId = item?.store?.sellerProfile?.userId;
  // Keep the contact route discoverable to guests; they can sign in and return here.
  const canMessage = !!sellerUserId && sellerUserId !== user?.id;
  const paymentMethods = displayPayments(item?.store?.sellerProfile?.paymentMethods);
  const footer = item && canOrder ? <PrimaryButton label="اطلب الآن · الدفع عند الاستلام" onPress={() => {
    if (user) router.push({ pathname: '/order-checkout', params: { productId: item.id } });
    else router.push('/login');
  }} /> : null;

  const renderProductCards = (products: ProductSummary[], labelPrefix: string) => products.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recommendationList}>
    {products.map((product) => <ProductCard key={product.id} product={product} layout="grid" onPress={() => router.push(`/products/${encodeURIComponent(product.id)}`)} />)}
  </ScrollView> : <Text style={styles.muted}>{labelPrefix === 'store' ? 'لا توجد منتجات أخرى منشورة من هذا المتجر.' : 'ستظهر اقتراحات مناسبة عند توفرها.'}</Text>;

  const recommendationProducts: ProductSummary[] = recommendations.map((product) => ({
    id: product.id, name: product.name || product.title || 'منتج', price: (product.price ?? '') as string | number,
    description: product.description ?? undefined, images: product.images ?? (product.image ? [product.image] : []),
  }));

  return <DetailScaffold title="تفاصيل المنتج" right={item ? <ShareButton resource="products" id={item.id} title={item.name} /> : undefined} loading={loading} loadingMessage="جاري تحميل المنتج…" error={error} onRetry={() => { void load(); }} footer={footer}>
    {item ? <View style={styles.pad}>
      <MediaGallery images={item.images} title={item.name} />
      <SectionCard>
        <View style={styles.titleRow}><View style={styles.titleCopy}><Text style={styles.heading}>{item.name}</Text><Text style={styles.category}>{item.category?.nameAr || item.category?.name || 'منتج'}</Text></View><FavoriteButton entityType="products" entityId={item.id} label="المنتج" /></View>
        <Text style={styles.price}>{money(item.effectivePrice?.price ?? item.discountPrice ?? item.price)}</Text>
        {item.discountPrice != null && Number(item.discountPrice) < Number(item.price) ? <Text style={styles.oldPrice}>{money(item.price)}</Text> : null}
        <Badge label={availabilityLabel(item.availability)} tone={item.availability === 'OUT_OF_STOCK' ? 'danger' : 'success'} />
        <Text style={styles.description}>{item.description || 'لا يوجد وصف إضافي لهذا المنتج.'}</Text>
        <View style={styles.metaRow}>
          {typeof item.views === 'number' ? <Text style={styles.meta}>المشاهدات: {formatNumber(item.views)}</Text> : null}
          {dateLabel(item.createdAt) ? <Text style={styles.meta}>تاريخ النشر: {dateLabel(item.createdAt)}</Text> : null}
        </View>
        {typeof item.store?.sellerProfile?.averageRating === 'number' ? <View style={styles.ratingLine}><RatingStars score={Number(item.store.sellerProfile.averageRating)} count={item.store.sellerProfile.totalRatings} />{item.store.sellerProfile.totalRatings ? <Text style={styles.meta}>({item.store.sellerProfile.totalRatings})</Text> : null}</View> : null}
        {item.store?.name ? <Pressable accessibilityRole="button" onPress={() => { if (item.store?.id) pushOnce(`/stores/${encodeURIComponent(item.store.id)}`); }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}><Text style={styles.storeText}>عرض متجر {item.store.name}</Text><AppIcon name="forward" size={16} color={colors.brand} /></View></Pressable> : null}
      </SectionCard>

      <ProductAttributeList fields={item.store?.storeType?.fields} attributes={item.attributes} />

      {paymentMethods.length ? <SectionCard><Text style={styles.sectionTitle}>وسائل الدفع المتاحة</Text><View style={styles.pills}>{paymentMethods.map((method, index) => <View key={`${method}-${index}`} style={styles.paymentPill}><Text style={styles.paymentText}>{method}</Text></View>)}</View><Text style={styles.muted}>تأكد من الاتفاق مع البائع على وسيلة الدفع قبل إتمام الطلب.</Text></SectionCard> : null}

      <SectionCard><Text style={styles.sectionTitle}>نصائح السلامة</Text><Text style={styles.description}>افحص المنتج وتأكد من مطابقة المواصفات قبل الدفع. تجنّب إرسال بياناتك البنكية أو رموز التحقق، ولا تحول المال خارج وسائل الدفع التي تثق بها. احتفظ بالمحادثة وإثبات الدفع عند الحاجة.</Text></SectionCard>

      {canMessage ? <SecondaryButton label={!user ? 'سجّل الدخول لمراسلة المتجر' : contacting ? 'جارٍ فتح المحادثة…' : 'مراسلة المتجر حول المنتج'} busy={contacting} onPress={() => {
        if (!user || !accessToken || !sellerUserId) {
          router.push({ pathname: '/login', params: { redirect: `/products/${encodeURIComponent(item.id)}` } });
          return;
        }
        setContacting(true);
        void startConversationWithUser(sellerUserId, accessToken, { type: 'product', id: item.id }, csrfToken)
          .then((conversation) => router.push({ pathname: '/messages/[id]', params: { id: conversation.id } }))
          .catch((err) => showToast('تعذر بدء المحادثة', err instanceof Error ? err.message : COPY.tryAgain, 'error'))
          .finally(() => setContacting(false));
      }} /> : null}
      <PrimaryButton label="الإبلاغ عن المنتج" variant="ghost" onPress={() => router.push({ pathname: '/report/[targetType]/[targetId]', params: { targetType: 'products', targetId: item.id } })} />

      <SectionCard><Text style={styles.sectionTitle}>من المتجر نفسه</Text>{renderProductCards(sameStoreProducts, 'store')}</SectionCard>
      <SectionCard><Text style={styles.sectionTitle}>قد يعجبك</Text>{renderProductCards(recommendationProducts, 'recommended')}</SectionCard>
    </View> : null}
  </DetailScaffold>;
}

const createThemeStyles = (colors: ColorPalette) => StyleSheet.create({
  pad: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  titleCopy: { flex: 1, gap: spacing.xs },
  heading: { fontSize: fontSizes[20], fontWeight: fontWeights.bold, color: colors.ink, textAlign: 'right', lineHeight: 28 },
  price: { fontSize: fontSizes[24], fontWeight: fontWeights.bold, color: colors.brand, textAlign: 'right' },
  oldPrice: { ...typography.caption, color: colors.muted, textDecorationLine: 'line-through', textAlign: 'right' },
  category: { ...typography.caption, color: colors.muted, textAlign: 'right' },
  description: { ...typography.body, color: colors.ink, lineHeight: 24, textAlign: 'right' },
  storeText: { color: colors.brand, ...typography.bodyStrong, textAlign: 'right' },
  sectionTitle: { ...typography.subtitle, color: colors.ink, textAlign: 'right' },
  muted: { ...typography.caption, color: colors.muted, textAlign: 'right' },
  meta: { ...typography.caption, color: colors.muted, textAlign: 'right' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  ratingLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  paymentPill: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.border },
  paymentText: { ...typography.captionStrong, color: colors.brandOnSoft },
  recommendationList: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.xs },
});
