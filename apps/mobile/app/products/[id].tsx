import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { fetchProduct, type ProductSummary } from '@/features/commerce/commerce.api';
import { startConversationWithUser } from '@/features/messaging/messaging.api';
import { useAuth } from '@/features/auth/AuthContext';
import { shareMarketPlatResource } from '@/features/sharing/deep-links';
import {
  Badge,
  DetailScaffold,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
} from '@/components/MobileUI';
import { colors, radius, spacing, typography } from '@/theme/tokens';

function money(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n)
    ? `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(n)} ₪`
    : 'السعر عند التواصل';
}

function availabilityLabel(value?: string): string {
  if (value === 'OUT_OF_STOCK') return 'غير متوفر';
  if (value === 'LIMITED') return 'كمية محدودة';
  return 'متوفر';
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, accessToken, csrfToken } = useAuth();
  const [contacting, setContacting] = useState(false);
  const [item, setItem] = useState<ProductSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) { setLoading(false); setError('معرّف المنتج غير صالح.'); return; }
    setLoading(true);
    setError(null);
    try {
      setItem(await fetchProduct(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل المنتج.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const canOrder =
    !!item?.store?.id &&
    item.availability !== 'OUT_OF_STOCK' &&
    item.status !== 'PAUSED' &&
    item.status !== 'DELETED';

  const sellerUserId = item?.store?.sellerProfile?.userId;
  const canMessage =
    !!user && !!sellerUserId && sellerUserId !== user.id;

  const footer = item && canOrder ? (
    <PrimaryButton
      label="اطلب الآن · الدفع عند الاستلام"
      onPress={() => {
        if (user) router.push({ pathname: '/order-checkout', params: { productId: item.id } });
        else router.push('/login');
      }}
    />
  ) : null;

  return (
    <DetailScaffold
      title="تفاصيل المنتج"
      right={
        item ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="مشاركة المنتج"
            onPress={() => {
              void shareMarketPlatResource('products', item.id, item.name);
            }}
            hitSlop={8}
          >
            <Text style={styles.headerAction}>مشاركة</Text>
          </Pressable>
        ) : undefined
      }
      loading={loading}
      loadingMessage="جاري تحميل المنتج…"
      error={error}
      onRetry={() => {
        void load();
      }}
      footer={footer}
    >
      {item ? (
        <View style={styles.pad}>
          {item.images?.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.images}
            >
              {item.images.map((uri, index) => (
                <Image
                  key={`${uri}-${index}`}
                  source={{ uri }}
                  style={styles.image}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.glyph}>◇</Text>
            </View>
          )}

          <SectionCard>
            <Text style={styles.heading}>{item.name}</Text>
            <Text style={styles.price}>
              {money(item.effectivePrice?.price ?? item.discountPrice ?? item.price)}
            </Text>
            {item.discountPrice != null && Number(item.discountPrice) < Number(item.price) ? (
              <Text style={styles.oldPrice}>{money(item.price)}</Text>
            ) : null}
            <Text style={styles.category}>
              {item.category?.nameAr || item.category?.name || 'منتج'}
            </Text>
            <Badge
              label={availabilityLabel(item.availability)}
              tone={item.availability === 'OUT_OF_STOCK' ? 'danger' : 'success'}
            />
            <Text style={styles.description}>
              {item.description || 'لا يوجد وصف إضافي لهذا المنتج.'}
            </Text>
            {item.store?.name ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  if (item.store?.id) {
                    router.push(`/stores/${encodeURIComponent(item.store.id)}`);
                  }
                }}
              >
                <Text style={styles.storeText}>عرض متجر {item.store.name} ‹</Text>
              </Pressable>
            ) : null}
          </SectionCard>

          {canMessage ? (
            <SecondaryButton
              label={contacting ? 'جارٍ فتح المحادثة…' : 'مراسلة المتجر حول المنتج'}
              busy={contacting}
              onPress={() => {
                if (!accessToken || !sellerUserId) {
                  router.push('/login');
                  return;
                }
                setContacting(true);
                void startConversationWithUser(
                  sellerUserId,
                  accessToken,
                  { type: 'product', id: item.id },
                  csrfToken,
                )
                  .then((conversation) =>
                    router.push({ pathname: '/messages/[id]', params: { id: conversation.id } }),
                  )
                  .catch((err) =>
                    Alert.alert(
                      'تعذر بدء المحادثة',
                      err instanceof Error ? err.message : 'حاول مرة أخرى.',
                    ),
                  )
                  .finally(() => setContacting(false));
              }}
            />
          ) : null}

          <PrimaryButton
            label="الإبلاغ عن المنتج"
            variant="ghost"
            onPress={() =>
              router.push({
                pathname: '/report/[targetType]/[targetId]',
                params: { targetType: 'products', targetId: item.id },
              })
            }
          />
        </View>
      ) : null}
    </DetailScaffold>
  );
}

const styles = StyleSheet.create({
  headerAction: { color: colors.brand, ...typography.captionStrong },
  pad: { paddingHorizontal: spacing.md, gap: spacing.md },
  images: { flexDirection: 'row-reverse', gap: spacing.sm },
  image: {
    width: 280,
    height: 250,
    borderRadius: radius.lg,
    backgroundColor: colors.border,
  },
  imagePlaceholder: {
    height: 220,
    borderRadius: radius.lg,
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { fontSize: 48, color: colors.brand },
  heading: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.ink,
    textAlign: 'right',
    lineHeight: 30,
  },
  price: { fontSize: 22, fontWeight: '900', color: colors.brand, textAlign: 'right' },
  oldPrice: {
    ...typography.caption,
    color: colors.muted,
    textDecorationLine: 'line-through',
    textAlign: 'right',
  },
  category: { ...typography.caption, color: colors.muted, textAlign: 'right' },
  description: {
    ...typography.body,
    color: colors.ink,
    lineHeight: 24,
    textAlign: 'right',
  },
  storeText: {
    color: colors.brand,
    ...typography.bodyStrong,
    textAlign: 'right',
  },
});
