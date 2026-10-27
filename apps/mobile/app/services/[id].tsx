import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  fetchServiceListing,
  getCachedServiceListing,
  type ServiceListing,
} from '@/features/services/services.api';
import { useAuth } from '@/features/auth/AuthContext';
import {
  Badge,
  DetailScaffold,
  PrimaryButton,
  SectionCard,
} from '@/components/MobileUI';
import { colors, spacing, typography } from '@/theme/tokens';

function formatPrice(item: ServiceListing): string {
  if (item.pricingType === 'NEGOTIABLE' || item.price == null) return 'السعر عند الاتفاق';
  const amount = Number(item.price);
  if (!Number.isFinite(amount)) return 'السعر عند الاتفاق';
  const base = `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(amount)} ₪`;
  return item.pricingType === 'STARTING_FROM' ? `${base} وما فوق` : base;
}

function locationLabel(value?: string | null): string | null {
  if (value === 'REMOTE') return 'عن بُعد';
  if (value === 'AT_CUSTOMER') return 'في موقع العميل';
  if (value === 'AT_PROVIDER') return 'في موقع مقدم الخدمة';
  return null;
}

export default function ServiceDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { user } = useAuth();
  const [item, setItem] = useState<ServiceListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setError('رابط الخدمة غير مكتمل.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    let hasCache = false;
    try {
      const cached = await getCachedServiceListing(id);
      if (cached) {
        hasCache = true;
        setItem(cached);
        setLoading(false);
      }
    } catch {
      /* cache is optional */
    }
    try {
      setItem(await fetchServiceListing(id));
    } catch (e) {
      if (!hasCache) setError(e instanceof Error ? e.message : 'تعذر تحميل الخدمة.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const provider =
    item?.provider?.businessName ||
    item?.provider?.sellerProfile?.displayName ||
    'مقدم خدمة';

  const meta = [
    item?.category?.nameAr || item?.category?.name,
    item?.durationEstimate,
    locationLabel(item?.serviceLocation),
  ]
    .filter(Boolean)
    .join(' · ');

  const images =
    item?.images?.filter((uri) => /^https?:\/\//i.test(uri)).slice(0, 5) ?? [];

  const footer = item ? (
    <PrimaryButton
      label="اطلب هذه الخدمة"
      onPress={() => {
        if (!user) {
          Alert.alert('تسجيل الدخول مطلوب', 'سجّل الدخول أولاً لإرسال طلب خدمة.', [
            { text: 'إلغاء', style: 'cancel' },
            { text: 'تسجيل الدخول', onPress: () => router.push('/login') },
          ]);
          return;
        }
        router.push({
          pathname: '/service-requests',
          params: { listingId: item.id, listingTitle: item.title },
        });
      }}
    />
  ) : null;

  return (
    <DetailScaffold
      title="تفاصيل الخدمة"
      loading={loading}
      loadingMessage="جاري تحميل التفاصيل…"
      error={error || (!loading && !item ? 'الخدمة غير متاحة.' : null)}
      onRetry={() => {
        void load();
      }}
      footer={footer}
    >
      {item ? (
        <View style={styles.pad}>
          {images.map((uri, index) => (
            <Image
              key={`${uri}-${index}`}
              source={{ uri }}
              style={styles.heroImage}
              resizeMode="cover"
            />
          ))}

          <SectionCard>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.price}>{formatPrice(item)}</Text>
            <Text style={styles.provider}>
              {provider}
              {item.provider?.sellerProfile?.verified ? ' · مقدم موثّق' : ''}
            </Text>
            {meta ? <Text style={styles.meta}>{meta}</Text> : null}
            {item.provider?.sellerProfile?.verified ? (
              <Badge label="مقدم موثّق" tone="success" />
            ) : null}
          </SectionCard>

          <SectionCard>
            <Text style={styles.sectionTitle}>وصف الخدمة</Text>
            <Text style={styles.description}>
              {item.description?.trim() || 'لم يضف مقدم الخدمة وصفًا تفصيليًا.'}
            </Text>
          </SectionCard>

          <SectionCard>
            <Text style={styles.sectionTitle}>قبل إرسال الطلب</Text>
            <Text style={styles.description}>
              اكتب احتياجك بوضوح داخل الطلب. إرسال الطلب لا يعني تأكيد الحجز أو الاتفاق على السعر؛
              انتظر رد مقدم الخدمة.
            </Text>
          </SectionCard>

          <PrimaryButton
            label="الإبلاغ عن الخدمة"
            variant="ghost"
            onPress={() =>
              router.push({
                pathname: '/report/[targetType]/[targetId]',
                params: { targetType: 'services', targetId: item.id },
              })
            }
          />
        </View>
      ) : null}
    </DetailScaffold>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.md, gap: spacing.md },
  heroImage: {
    height: 220,
    borderRadius: 16,
    backgroundColor: colors.border,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.ink,
    textAlign: 'right',
    lineHeight: 30,
  },
  price: { fontSize: 22, fontWeight: '900', color: colors.brand, textAlign: 'right' },
  provider: { ...typography.bodyStrong, color: colors.ink, textAlign: 'right' },
  meta: { ...typography.caption, color: colors.muted, textAlign: 'right' },
  sectionTitle: { ...typography.subtitle, color: colors.ink, textAlign: 'right' },
  description: {
    ...typography.body,
    color: colors.ink,
    lineHeight: 24,
    textAlign: 'right',
  },
});
