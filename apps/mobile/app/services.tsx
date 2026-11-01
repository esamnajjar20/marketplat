import { AppText as Text } from '@/components/ui/AppText';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { marketListPerf } from '@/lib/listPerformance';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { fetchServiceListingsPage, getCachedServiceListings, type ServiceListing } from '@/features/services/services.api';
import {
  AppHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  PrimaryButton,
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
  const [moreError, setMoreError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const seq = useRef(0);
  const load = useCallback(
    async (refresh = false) => {
      const current = ++seq.current;
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      setMoreError(null);
      const options = { page: 1, limit: 30, search: submitted };
      let hasCache = false;
      try {
        const cached = await getCachedServiceListings(options);
        if (cached && current === seq.current) {
          hasCache = true;
          setItems(cached);
          setPage(1);
          setTotalPages(cached.length >= 30 ? 2 : 1);
          setLoading(false);
        }
      } catch {
        /* cache optional */
      }
      try {
        const fresh = await fetchServiceListingsPage(options);
        if (current === seq.current) { setItems(fresh.items); setPage(fresh.page); setTotalPages(fresh.totalPages); }
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

  const loadMore = async () => {
    if (loadingMore || loading || page >= totalPages) return;
    const current = seq.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const result = await fetchServiceListingsPage({ page: page + 1, limit: 30, search: submitted });
      if (current === seq.current) {
        setItems((existing) => {
          const seen = new Set(existing.map((item) => item.id));
          return [...existing, ...result.items.filter((item) => !seen.has(item.id))];
        });
        setPage(result.page);
        setTotalPages(result.totalPages);
      }
    } catch (e) {
      if (current === seq.current) setMoreError(e instanceof Error ? e.message : 'تعذر تحميل المزيد من الخدمات.');
    } finally {
      if (current === seq.current) setLoadingMore(false);
    }
  };

  useEffect(() => {
    void load();
    return () => { seq.current += 1; };
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader title="الخدمات" />
      <FlatList
        data={items}
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
              onClear={() => setSubmitted('')}
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
          !loading && !error && items.length === 0 ? (
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
        ListFooterComponent={items.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            {moreError ? <ErrorState title="تعذر تحميل المزيد" description={moreError} onAction={() => void loadMore()} /> : null}
            {!moreError && page < totalPages ? <PrimaryButton label={loadingMore ? 'جارٍ التحميل…' : 'تحميل المزيد'} onPress={() => void loadMore()} busy={loadingMore} variant="secondary" /> : null}
          </View>
        ) : undefined}
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
