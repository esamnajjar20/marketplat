import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchProducts, type ProductSummary } from '@/features/commerce/commerce.api';
import {
  AppHeader,
  EmptyState,
  ErrorState,
  LoadingState,
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
  const { user } = useAuth();
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
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.brand} />
        }
      >
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
          {user ? (
            <PrimaryButton label="+ إضافة منتج" onPress={() => router.push('/product-editor')} />
          ) : null}
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>منتجات متاحة</Text>
          <Text style={styles.count}>{items.length} نتيجة</Text>
        </View>

        {loading ? (
          <LoadingState message="جاري تحميل المنتجات…" />
        ) : error ? (
          <ErrorState title="تعذر تحميل المنتجات" description={error} onAction={() => void load()} />
        ) : items.length === 0 ? (
          <EmptyState title="لا توجد منتجات مطابقة" description="جرّب كلمات بحث مختلفة أو اسحب للتحديث." />
        ) : (
          <View style={styles.list}>
            {items.map((item) => {
              const image = item.images?.find((uri) => typeof uri === 'string' && /^https?:\/\//i.test(uri));
              return (
                <CatalogCard
                  key={item.id}
                  title={item.name}
                  subtitle={item.store?.name || item.category?.nameAr || item.category?.name || 'منتج'}
                  price={price(item)}
                  imageUri={image}
                  glyph="▣"
                  onPress={() => router.push(`/products/${encodeURIComponent(item.id)}`)}
                />
              );
            })}
          </View>
        )}

        {!loading && !error && items.length > 0 && page < totalPages ? (
          <PrimaryButton
            label={loadingMore ? 'جاري التحميل…' : 'تحميل المزيد'}
            onPress={() => void loadMore()}
            busy={loadingMore}
            variant="secondary"
          />
        ) : null}
      </ScrollView>
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
