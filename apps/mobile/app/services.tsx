import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { marketListPerf } from '@/lib/listPerformance';
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

  const seq = useRef(0);
  const load = useCallback(
    async (refresh = false) => {
      const current = ++seq.current;
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const options = { page: 1, limit: 30, search: submitted };
      let hasCache = false;
      try {
        const cached = await getCachedServiceListings(options);
        if (cached && current === seq.current) {
          hasCache = true;
          setItems(cached);
          setLoading(false);
        }
      } catch {
        /* cache optional */
      }
      try {
        const fresh = await fetchServiceListings(options);
        if (current === seq.current) setItems(fresh);
      } catch (e) {
        if (current === seq.current && !hasCache) setError(e instanceof Error ? e.message : 'تعذر تحميل الخدمات.');
      } finally {
        if (current === seq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [submitted],
  );

  useEffect(() => {
    void load();
    return () => { seq.current += 1; };
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader title="الخدمات" />
      <FlatList
        data={loading || error ? [] : items}
        keyExtractor={(item) => item.id}
        {...marketListPerf}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.brand} />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.md }}>
            <Text style={styles.subtitle}>اعثر على مقدم الخدمة المناسب</Text>
            <SearchBar
              value={query}
              onChangeText={setQuery}
              onSubmit={() => setSubmitted(query.trim())}
              placeholder="ابحث عن خدمة…"
              accessibilityLabel="ابحث عن خدمة"
            />
            {loading ? (
              <SkeletonList count={4} />
            ) : error ? (
              <ErrorState title="تعذر تحميل الخدمات" description={error} onAction={() => void load()} />
            ) : (
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>خدمات متاحة</Text>
                <Text style={styles.count}>{items.length} نتيجة</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !loading && !error ? (
            <EmptyState title="لا توجد خدمات مطابقة" description="جرّب كلمات بحث مختلفة أو اسحب للتحديث." />
          ) : undefined
        }
        renderItem={({ item }) => {
          const image = item.images?.find((uri) => typeof uri === 'string' && /^https?:\/\//i.test(uri));
          return (
            <CatalogCard
              title={item.title}
              subtitle={`${item.provider?.businessName || item.provider?.sellerProfile?.displayName || 'مقدم خدمة'}`}
              price={priceLabel(item)}
              meta={item.category?.nameAr || item.category?.name || undefined}
              imageUri={image}
              glyph="✦"
              onPress={() => router.push(`/services/${encodeURIComponent(item.id)}`)}
            />
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
      />
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
