import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { fetchServiceListings, getCachedServiceListings, type ServiceListing } from '@/features/services/services.api';
import {
  AppHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  SkeletonList,
  SearchBar,
} from '@/components/MobileUI';
import { CatalogCard } from '@/components/MarketCards';
import { colors, spacing, typography } from '@/theme/tokens';

function priceLabel(item: ServiceListing) {
  if (item.pricingType === 'NEGOTIABLE' || item.price == null) return 'السعر عند الاتفاق';
  const value = Number(item.price);
  return Number.isFinite(value)
    ? `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(value)} ₪${item.pricingType === 'STARTING_FROM' ? ' وما فوق' : ''}`
    : 'السعر عند الاتفاق';
}

export default function ServicesScreen() {
  const [items, setItems] = useState<ServiceListing[]>([]);
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const options = { page: 1, limit: 30, search: submitted };
      let hasCache = false;
      try {
        const cached = await getCachedServiceListings(options);
        if (cached) {
          hasCache = true;
          setItems(cached);
          setLoading(false);
        }
      } catch {
        /* cache optional */
      }
      try {
        setItems(await fetchServiceListings(options));
      } catch (e) {
        if (!hasCache) setError(e instanceof Error ? e.message : 'تعذر تحميل الخدمات.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [submitted],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader title="الخدمات" />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.brand} />
        }
      >
        <Text style={styles.subtitle}>اعثر على مقدم الخدمة المناسب</Text>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          onSubmit={() => setSubmitted(query.trim())}
          placeholder="ابحث عن خدمة…"
          accessibilityLabel="ابحث عن خدمة"
        />

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>خدمات متاحة</Text>
          <Text style={styles.count}>{items.length} نتيجة</Text>
        </View>

        {loading ? (
          <SkeletonList count={4} />
        ) : error ? (
          <ErrorState title="تعذر تحميل الخدمات" description={error} onAction={() => void load()} />
        ) : items.length === 0 ? (
          <EmptyState
            title="لا توجد خدمات مطابقة"
            description="جرّب كلمات بحث مختلفة أو اسحب الشاشة للأسفل للتحديث."
          />
        ) : (
          <View style={styles.list}>
            {items.map((item) => {
              const image = item.images?.find((uri) => /^https?:\/\//i.test(uri));
              const provider =
                item.provider?.businessName ||
                item.provider?.sellerProfile?.displayName ||
                'مقدم خدمة';
              return (
                <CatalogCard
                  key={item.id}
                  title={item.title}
                  subtitle={`${provider}${item.provider?.sellerProfile?.verified ? ' · موثّق' : ''}`}
                  price={priceLabel(item)}
                  meta={item.category?.nameAr || item.category?.name || undefined}
                  imageUri={image}
                  glyph="✦"
                  onPress={() => router.push(`/services/${encodeURIComponent(item.id)}`)}
                />
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  subtitle: { ...typography.caption, color: colors.muted, textAlign: 'right' },
  sectionRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { ...typography.subtitle, color: colors.ink },
  count: { ...typography.caption, color: colors.muted },
  list: { gap: spacing.md },
});
