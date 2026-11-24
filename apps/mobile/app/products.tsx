import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { StyleSheet, View } from 'react-native';
import { BrandRefreshControl } from '@/components/ui/BrandRefreshControl';
import { AppFlashList } from '@/components/ui/AppFlashList';
import { ListGapMd } from '@/components/ui/ListSeparator';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ScreenFrame } from '@/components/ui/ScreenFrame';
import { router, useLocalSearchParams } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import {
  fetchProducts,
  fetchMyStore,
  fetchProductCategories,
  type ProductCategory,
  type ProductSummary,
} from '@/features/commerce/commerce.api';
import { AppHeader, EmptyState, ErrorState, SkeletonList, PrimaryButton, SecondaryButton, SearchBar, Field } from '@/components/ui';
import { FilterChip } from '@/components/ui/FilterChip';
import { ProductCard } from '@/components/ui/ProductCard';
import { normalizeNumericInput } from '@/lib/normalize-numeric-input';
import { spacing, typography } from '@/theme/tokens';

type ProductSort = 'newest' | 'price_asc' | 'price_desc' | 'views';
const PRODUCT_SORTS: { value: ProductSort; label: string }[] = [
  { value: 'newest', label: 'الأحدث' },
  { value: 'price_asc', label: 'السعر الأقل' },
  { value: 'price_desc', label: 'السعر الأعلى' },
  { value: 'views', label: 'الأكثر مشاهدة' },
];

/** صف منتج — memo: لا يُعاد رسمه عند الكتابة في حقل البحث أو تغيّر حالة الشاشة. */
const ProductRow = memo(function ProductRow({ item, onOpen }: { item: ProductSummary; onOpen: (id: string) => void }) {
  const product = useMemo(() => ({
    id: item.id,
    name: item.name,
    price: item.price,
    discountPrice: item.discountPrice,
    effectivePrice: item.effectivePrice,
    images: item.images,
    category: item.category,
  }), [item]);
  const handlePress = useCallback(() => onOpen(item.id), [item.id, onOpen]);
  return <ProductCard product={product} layout="row" onPress={handlePress} />;
});

export default function ProductsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);

  const { user, accessToken } = useAuth();
  const params = useLocalSearchParams<{ storeId?: string | string[]; categoryId?: string | string[] }>();
  const storeParam = Array.isArray(params.storeId) ? params.storeId[0] : params.storeId;
  const storeId = typeof storeParam === 'string' && storeParam.trim() ? storeParam : undefined;
  const categoryParam = Array.isArray(params.categoryId) ? params.categoryId[0] : params.categoryId;
  const routeCategoryId = typeof categoryParam === 'string' && categoryParam.trim() ? categoryParam : '';

  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [hasStore, setHasStore] = useState<boolean | null>(null);
  const [categoryId, setCategoryId] = useState(routeCategoryId);
  const [categoryOptions, setCategoryOptions] = useState<ProductCategory[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cityInput, setCityInput] = useState('');
  const [minPriceInput, setMinPriceInput] = useState('');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [filterError, setFilterError] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<{
    city: string;
    minPrice?: number;
    maxPrice?: number;
    hasPromotion: boolean;
    sort: ProductSort;
  }>({ city: '', hasPromotion: false, sort: 'newest' });

  useEffect(() => {
    setCategoryId(routeCategoryId);
  }, [routeCategoryId]);

  useEffect(() => {
    let active = true;
    void fetchProductCategories()
      .then((items) => { if (active) setCategoryOptions(items); })
      .catch(() => { if (active) setCategoryOptions([]); });
    return () => { active = false; };
  }, []);

  const listKey = JSON.stringify({ storeId, categoryId, submitted, ...appliedFilters });
  const list = usePaginatedList<ProductSummary>({
    key: listKey,
    pageSize: 30,
    fetchPage: async (nextPage, signal) => {
      const result = await fetchProducts({
        page: nextPage,
        limit: 30,
        search: submitted,
        storeId,
        categoryId: categoryId || undefined,
        city: appliedFilters.city || undefined,
        minPrice: appliedFilters.minPrice,
        maxPrice: appliedFilters.maxPrice,
        hasPromotion: appliedFilters.hasPromotion,
        sortBy: appliedFilters.sort === 'price_asc' || appliedFilters.sort === 'price_desc'
          ? 'price'
          : appliedFilters.sort === 'views' ? 'views' : 'createdAt',
        sortOrder: appliedFilters.sort === 'price_asc' ? 'asc' : 'desc',
        signal,
      });
      return { items: result.items, meta: { page: result.page, totalPages: result.totalPages, total: result.total } };
    },
    getItemKey: (item) => item.id,
  });

  useEffect(() => {
    if (!user || !accessToken) { setHasStore(null); return; }
    let cancelled = false;
    void fetchMyStore(accessToken)
      .then((store) => { if (!cancelled) setHasStore(!!store); })
      .catch(() => { if (!cancelled) setHasStore(true); /* fail-open: preserve existing behavior on network error */ });
    return () => { cancelled = true; };
  }, [user, accessToken]);

  const applyFilters = useCallback(() => {
    const min = minPriceInput.trim() ? Number(normalizeNumericInput(minPriceInput)) : undefined;
    const max = maxPriceInput.trim() ? Number(normalizeNumericInput(maxPriceInput)) : undefined;
    if ((min !== undefined && (!Number.isFinite(min) || min < 0)) ||
      (max !== undefined && (!Number.isFinite(max) || max < 0)) ||
      (min !== undefined && max !== undefined && min > max)) {
      setFilterError('تحقق من نطاق السعر؛ يجب أن يكون السعر الأدنى أقل من الأعلى.');
      return;
    }
    setFilterError('');
    setAppliedFilters((current) => ({ ...current, city: cityInput.trim(), minPrice: min, maxPrice: max }));
    setFiltersOpen(false);
  }, [cityInput, minPriceInput, maxPriceInput]);

  const setSort = useCallback((sort: ProductSort) => {
    setAppliedFilters((current) => ({ ...current, sort }));
  }, []);

  const clearFilters = useCallback(() => {
    setCategoryId('');
    setCityInput('');
    setMinPriceInput('');
    setMaxPriceInput('');
    setFilterError('');
    setAppliedFilters({ city: '', hasPromotion: false, sort: 'newest' });
  }, []);

  const openProduct = useCallback((id: string) => pushOnce(`/products/${encodeURIComponent(id)}`), []);
  const keyExtractor = useCallback((item: ProductSummary) => item.id, []);
  const renderItem = useCallback(
    ({ item }: { item: ProductSummary }) => <ProductRow item={item} onOpen={openProduct} />,
    [openProduct],
  );

  const title = storeId ? 'منتجات المتجر' : categoryId ? 'منتجات القسم' : 'المنتجات';
  const subtitle = storeId
    ? 'تصفح المنتجات المنشورة في هذا المتجر'
    : categoryId
      ? 'تصفح المنتجات ضمن القسم المحدد'
      : 'تصفح المنتجات المعروضة في المتاجر';
  const activeFilterCount = [categoryId, appliedFilters.city, appliedFilters.minPrice, appliedFilters.maxPrice,
    appliedFilters.hasPromotion ? 'promotion' : '', appliedFilters.sort !== 'newest' ? appliedFilters.sort : ''].filter(Boolean).length;

  return (
    <ScreenFrame>
      <AppHeader title={title} />
      <AppFlashList
        data={list.items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<BrandRefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} />}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.subtitle}>{subtitle}</Text>
            <SearchBar
              value={query}
              onChangeText={setQuery}
              onSubmit={() => setSubmitted(query.trim())}
              onClear={() => { setQuery(''); setSubmitted(''); }}
              placeholder="ابحث عن منتج…"
              accessibilityLabel="ابحث عن منتج"
            />
            <View style={styles.actions}>
              <SecondaryButton label="المتاجر" onPress={() => router.push('/stores')} />
              {storeId ? <SecondaryButton label="العودة للمتجر" onPress={() => router.push({ pathname: '/stores/[id]', params: { id: storeId } })} /> : null}
              {user && hasStore === true ? <PrimaryButton label="+ إضافة منتج" onPress={() => router.push('/product-editor')} /> : null}
            </View>
            {!storeId ? (
              <SecondaryButton
                label={filtersOpen ? 'إخفاء التصفية' : `تصفية وترتيب${activeFilterCount ? ` (${activeFilterCount})` : ''}`}
                onPress={() => setFiltersOpen((value) => !value)}
              />
            ) : null}
            {filtersOpen && !storeId ? (
              <View style={styles.filterPanel}>
                <Text style={styles.filterLabel}>التصنيف</Text>
                <View style={styles.chips}>
                  <FilterChip label="كل المنتجات" selected={!categoryId} onPress={() => setCategoryId('')} />
                  {categoryOptions.map((category) => (
                    <FilterChip key={category.id} label={category.nameAr || category.name} selected={categoryId === category.id} onPress={() => setCategoryId(category.id)} />
                  ))}
                </View>
                <FilterChip
                  label="العروض فقط"
                  selected={appliedFilters.hasPromotion}
                  onPress={() => setAppliedFilters((current) => ({ ...current, hasPromotion: !current.hasPromotion }))}
                />
                <Text style={styles.filterLabel}>الترتيب</Text>
                <View style={styles.chips}>
                  {PRODUCT_SORTS.map((item) => <FilterChip key={item.value} label={item.label} selected={appliedFilters.sort === item.value} onPress={() => setSort(item.value)} />)}
                </View>
                <Field label="المدينة" value={cityInput} onChangeText={setCityInput} placeholder="كل المدن" />
                <View style={styles.priceFields}>
                  <View style={styles.priceField}><Field label="السعر من" value={minPriceInput} onChangeText={setMinPriceInput} keyboardType="decimal-pad" placeholder="بدون حد أدنى" /></View>
                  <View style={styles.priceField}><Field label="السعر إلى" value={maxPriceInput} onChangeText={setMaxPriceInput} keyboardType="decimal-pad" placeholder="بدون حد أعلى" /></View>
                </View>
                {filterError ? <Text style={styles.filterError}>{filterError}</Text> : null}
                <View style={styles.filterActions}>
                  <PrimaryButton label="تطبيق الفلاتر" onPress={applyFilters} />
                  <SecondaryButton label="مسح الفلاتر" onPress={clearFilters} />
                </View>
              </View>
            ) : null}
            {list.loading && list.items.length === 0 ? (
              <SkeletonList count={4} />
            ) : list.error && list.items.length === 0 ? (
              <ErrorState title="تعذر التحميل" description={list.error} onAction={() => void list.retry()} />
            ) : list.error ? (
              <ErrorState title="تعذر تحديث النتائج" description={list.error} onAction={() => void list.retry()} />
            ) : (
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>النتائج</Text>
                <Text style={styles.count}>{list.totalCount} نتيجة</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !list.loading && !list.error && list.items.length === 0 ? (
            <EmptyState title="لا توجد منتجات مطابقة" description="جرّب كلمات بحث أو فلاتر مختلفة أو اسحب للتحديث." />
          ) : undefined
        }
        ItemSeparatorComponent={ListGapMd}
        ListFooterComponent={
          list.items.length > 0 ? (
            <View style={styles.listFooter}>
              {list.loadMoreError ? <ErrorState title="تعذر تحميل المزيد" description={list.loadMoreError} onAction={() => void list.retry()} /> : null}
              {list.hasNextPage ? <PrimaryButton label={list.loadingMore ? 'جارٍ التحميل…' : list.loadMoreError ? 'إعادة المحاولة' : 'تحميل المزيد'} onPress={() => void (list.loadMoreError ? list.retry() : list.loadMore())} busy={list.loadingMore} variant="secondary" /> : null}
            </View>
          ) : undefined
        }
      />
    </ScreenFrame>
  );
}

const createThemeStyles = (colors: ColorPalette) => StyleSheet.create({
  // FlashList: padding فقط (لا gap).
  content: { padding: spacing.lg, paddingBottom: spacing.x4l },
  listHeader: { gap: spacing.md, marginBottom: spacing.md },
  listFooter: { gap: spacing.sm, marginTop: spacing.md },
  filterPanel: { gap: spacing.md, padding: spacing.md, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface },
  filterLabel: { ...typography.label, color: colors.ink, textAlign: 'right' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  priceFields: { flexDirection: 'row', gap: spacing.md },
  priceField: { flex: 1, minWidth: 0 },
  filterError: { color: colors.danger ?? colors.ink, ...typography.caption, textAlign: 'right' },
  filterActions: { gap: spacing.sm },
  subtitle: { ...typography.caption, color: colors.muted, textAlign: 'right' },
  actions: { gap: spacing.sm },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { ...typography.subtitle, color: colors.ink },
  count: { ...typography.caption, color: colors.muted },
});
