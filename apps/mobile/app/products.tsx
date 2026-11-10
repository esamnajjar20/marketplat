import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { marketListPerf } from '@/lib/listPerformance';
import { useEffect, useState, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { fetchProducts, fetchMyStore, type ProductSummary } from '@/features/commerce/commerce.api';
import { AppHeader, EmptyState, ErrorState, SkeletonList, PrimaryButton, SearchBar, SecondaryButton } from '@/components/MobileUI';
import { ProductCard } from '@/components/ui/ProductCard';
import { spacing, typography } from '@/theme/tokens';


export default function ProductsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);

  const { user, accessToken } = useAuth();
  const params = useLocalSearchParams<{ storeId?: string | string[]; categoryId?: string | string[] }>();
  const storeParam = Array.isArray(params.storeId) ? params.storeId[0] : params.storeId;
  const storeId = typeof storeParam === 'string' && storeParam.trim() ? storeParam : undefined;
  const categoryParam = Array.isArray(params.categoryId) ? params.categoryId[0] : params.categoryId;
  const categoryId = typeof categoryParam === 'string' && categoryParam.trim() ? categoryParam : undefined;

  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [hasStore, setHasStore] = useState<boolean | null>(null);

  const listKey = `${storeId ?? 'all'}:${categoryId ?? 'all'}:${submitted}`;
  const {
    items,
    loading,
    loadingMore,
    refreshing,
    error,
    loadMoreError,
    hasNextPage,
    refresh,
    loadMore,
  } = usePaginatedList<ProductSummary>({
    key: listKey,
    pageSize: 30,
    fetchPage: async (nextPage, signal) => {
      const result = await fetchProducts({
        page: nextPage,
        limit: 30,
        search: submitted,
        storeId,
        categoryId,
        signal,
      });
      return { items: result.items, meta: { page: result.page, totalPages: result.totalPages } };
    },
    getItemKey: (item) => item.id,
  });

  useEffect(() => {
    if (!user || !accessToken) { setHasStore(null); return; }
    let cancelled = false;
    void fetchMyStore(accessToken)
      .then((store) => { if (!cancelled) setHasStore(!!store); })
      .catch(() => { if (!cancelled) setHasStore(true); /* fail-open: assume store exists on network error */ });
    return () => { cancelled = true; };
  }, [user, accessToken]);

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
        data={items}
        keyExtractor={(item) => item.id}
        {...marketListPerf}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.brand} />
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
            ) : error && items.length === 0 ? (
              <ErrorState title="تعذر التحميل" description={error} onAction={() => void refresh()} />
            ) : error ? (
              <ErrorState title="تعذر تحديث النتائج" description={error} onAction={() => void refresh()} />
            ) : (
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>النتائج</Text>
                <Text style={styles.count}>{items.length} نتيجة</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !loading && !error && items.length === 0 ? (
            <EmptyState title="لا توجد منتجات مطابقة" description="جرّب كلمات بحث مختلفة أو اسحب للتحديث." />
          ) : undefined
        }
        renderItem={({ item }) => (
              <ProductCard
                product={{ id: item.id, name: item.name, price: item.effectivePrice?.price ?? item.discountPrice ?? item.price, images: item.images, category: item.category }}
                layout="row"
                onPress={() => router.push(`/products/${encodeURIComponent(item.id)}`)}
              />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListFooterComponent={
          !loading && items.length > 0 && hasNextPage ? (
            <View style={{ gap: spacing.sm }}>
              {loadMoreError ? <ErrorState title="تعذر تحميل المزيد" description={loadMoreError} onAction={() => void loadMore()} /> : null}
              <PrimaryButton
                label={loadingMore ? 'جاري التحميل…' : loadMoreError ? 'إعادة تحميل المزيد' : 'تحميل المزيد'}
                onPress={() => void loadMore()}
                busy={loadingMore}
                variant="secondary"
              />
            </View>
          ) : undefined
        }
      />
    </SafeAreaView>
  );
}

const createThemeStyles = (colors: ColorPalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  subtitle: { ...typography.caption, color: colors.muted, textAlign: 'right' },
  actions: { gap: spacing.sm },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { ...typography.subtitle, color: colors.ink },
  count: { ...typography.caption, color: colors.muted },
});
