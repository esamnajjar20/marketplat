import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { marketListPerf } from '@/lib/listPerformance';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchProducts, fetchMyStore, type ProductSummary } from '@/features/commerce/commerce.api';
import {
  AppHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  SkeletonList,
  PrimaryButton,
  SearchBar,
  SecondaryButton,
} from '@/components/MobileUI';
import { CatalogCard } from '@/components/MarketCards';
import { colors, spacing, typography } from '@/theme/tokens';

function price(item: ProductSummary) {
  const v = Number(item.effectivePrice?.price ?? item.effectivePrice?.amount ?? item.discountPrice ?? item.price);
  return Number.isFinite(v)
    ? `${new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(v)} ₪`
    : 'السعر عند التواصل';
}

export default function ProductsScreen() {
  const { user, accessToken } = useAuth();
  const params = useLocalSearchParams<{ storeId?: string | string[]; categoryId?: string | string[] }>();
  const storeParam = Array.isArray(params.storeId) ? params.storeId[0] : params.storeId;
  const storeId = typeof storeParam === 'string' && storeParam.trim() ? storeParam : undefined;
  const categoryParam = Array.isArray(params.categoryId) ? params.categoryId[0] : params.categoryId;
  const categoryId = typeof categoryParam === 'string' && categoryParam.trim() ? categoryParam : undefined;

  const [items, setItems] = useState<ProductSummary[]>([]);
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const requestSequence = useRef(0);
  const [hasStore, setHasStore] = useState<boolean | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      const sequence = ++requestSequence.current;
      setLoadingMore(false);
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await fetchProducts({ page: 1, limit: 30, search: submitted, storeId, categoryId });
        if (sequence === requestSequence.current) {
          setItems(result.items);
          setPage(result.page);
          setTotalPages(result.totalPages);
        }
      } catch (e) {
        if (sequence === requestSequence.current) {
          setError(e instanceof Error ? e.message : 'تعذر تحميل المنتجات.');
        }
      } finally {
        if (sequence === requestSequence.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [submitted, storeId, categoryId],
  );

  useEffect(() => {
    void load();
    return () => {
      requestSequence.current += 1;
    };
  }, [load]);

  useEffect(() => {
    if (!user || !accessToken) { setHasStore(null); return; }
    let cancelled = false;
    void fetchMyStore(accessToken)
      .then((store) => { if (!cancelled) setHasStore(!!store); })
      .catch(() => { if (!cancelled) setHasStore(true); /* fail-open: assume store exists on network error */ });
    return () => { cancelled = true; };
  }, [user, accessToken]);

  const loadMore = async () => {
    if (loadingMore || loading || page >= totalPages) return;
    const sequence = requestSequence.current;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await fetchProducts({ page: page + 1, limit: 30, search: submitted, storeId, categoryId });
      if (sequence === requestSequence.current) {
        setItems((current) => {
          const seen = new Set(current.map((item) => item.id));
          return [...current, ...result.items.filter((item) => !seen.has(item.id))];
        });
        setPage(result.page);
        setTotalPages(result.totalPages);
      }
    } catch (e) {
      if (sequence === requestSequence.current) {
        setError(e instanceof Error ? e.message : 'تعذر تحميل المزيد من المنتجات.');
      }
    } finally {
      if (sequence === requestSequence.current) setLoadingMore(false);
    }
  };

  const title = storeId ? 'منتجات المتجر' : categoryId ? 'منتجات القسم' : 'المنتجات';
  const subtitle = storeId
    ? 'تصفح المنتجات المنشورة في هذا المتجر'
    : categoryId
      ? 'تصفح المنتجات ضمن القسم المحدد'
      : 'تصفح المنتجات المعروضة في المتاجر';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader title={title} />
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
            <Text style={styles.subtitle}>{subtitle}</Text>
            <SearchBar
              value={query}
              onChangeText={setQuery}
              onSubmit={() => setSubmitted(query.trim())}
              placeholder="ابحث عن منتج…"
              accessibilityLabel="ابحث عن منتج"
            />
            <View style={styles.actions}>
              <SecondaryButton label="المتاجر" onPress={() => router.push('/stores')} />
              {storeId ? (
                <SecondaryButton
                  label="العودة للمتجر"
                  onPress={() => router.push({ pathname: '/stores/[id]', params: { id: storeId } })}
                />
              ) : null}
              {user && hasStore === true ? (
                <PrimaryButton label="+ إضافة منتج" onPress={() => router.push('/product-editor')} />
              ) : null}
            </View>
            {loading ? (
              <SkeletonList count={4} />
            ) : error ? (
              <ErrorState title="تعذر التحميل" description={error} onAction={() => void load()} />
            ) : (
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>النتائج</Text>
                <Text style={styles.count}>{items.length} نتيجة</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !loading && !error ? (
            <EmptyState title="لا توجد منتجات مطابقة" description="جرّب كلمات بحث مختلفة أو اسحب للتحديث." />
          ) : undefined
        }
        renderItem={({ item }) => (
              <CatalogCard
                title={item.name}
                subtitle={item.store?.name || item.category?.nameAr || item.category?.name || 'منتج'}
                price={price(item)}
                imageUri={item.images?.find((uri) => typeof uri === 'string' && /^https?:\/\//i.test(uri))}
                glyph="▣"
                onPress={() => router.push(`/products/${encodeURIComponent(item.id)}`)}
              />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListFooterComponent={
          !loading && !error && items.length > 0 && page < totalPages ? (
            <PrimaryButton
              label={loadingMore ? 'جاري التحميل…' : 'تحميل المزيد'}
              onPress={() => void loadMore()}
              busy={loadingMore}
              variant="secondary"
            />
          ) : undefined
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  subtitle: { ...typography.caption, color: colors.muted, textAlign: 'right' },
  actions: { gap: spacing.sm },
  sectionRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { ...typography.subtitle, color: colors.ink },
  count: { ...typography.caption, color: colors.muted },
  list: { gap: spacing.md },
});
