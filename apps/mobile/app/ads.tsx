import { useAppTheme } from '@/theme/ThemeProvider';
import { formatMoney } from '@/lib/formatters';
import { AppImage } from '@/components/AppImage';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { BrandRefreshControl } from '@/components/ui/BrandRefreshControl';
import { PageList } from '@/components/ui/PageList';
import { pushOnce } from '@/lib/navigation';
import { fetchPublicAds, type AdListItem } from '@/features/ads/ads.api';
import { fetchPublicCategories, flattenPublicCategories, type PublicCategory } from '@/features/categories/categories.api';
import { FilterChip } from '@/components/ui/FilterChip';
import { fontSizes, radius, spacing, fontWeights, typography, type ColorPalette } from '@/theme/tokens';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { Field } from '@/components/ui/Field';
import { PrimaryButton, SecondaryButton, Notice, EmptyState, ErrorState, SkeletonList } from '@/components/ui';
import { normalizeNumericInput } from '@/lib/normalize-numeric-input';
import type { AdCondition } from '@marketplat/contracts';

type Condition = AdCondition;
type AdSort = 'newest' | 'price_asc' | 'price_desc' | 'views';
const CONDITIONS: { value: Condition | ''; label: string }[] = [
  { value: '', label: 'الكل' },
  { value: 'NEW', label: 'جديد' },
  { value: 'USED', label: 'مستعمل' },
  { value: 'REFURBISHED', label: 'مجدد' },
];
const AD_SORTS: { value: AdSort; label: string }[] = [
  { value: 'newest', label: 'الأحدث' },
  { value: 'price_asc', label: 'السعر الأقل' },
  { value: 'price_desc', label: 'السعر الأعلى' },
  { value: 'views', label: 'الأكثر مشاهدة' },
];

function adPrice(value: AdListItem['price']) {
  if (value === null || value === '') return 'السعر عند التواصل';
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? formatMoney(number) : 'السعر عند التواصل';
}

const AdRow = memo(function AdRow({ ad, onOpen }: { ad: AdListItem; onOpen: (id: string) => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`فتح الإعلان: ${ad.title}`}
      onPress={() => onOpen(ad.id)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, minHeight: 112 }}
    >
      {ad.images?.[0] ? (
        <AppImage uri={ad.images[0]} variant="list" style={{ width: 104, height: 104, borderRadius: radius.md, backgroundColor: colors.border }} resizeMode="cover" accessibilityLabel={`صورة ${ad.title}`} />
      ) : (
        <View style={{ width: 104, height: 104, borderRadius: radius.md, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.brandOnSoft, fontSize: fontSizes[12], fontWeight: fontWeights.bold }}>بدون صورة</Text>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0, gap: spacing.xs, justifyContent: 'center' }}>
        <Text numberOfLines={2} tone="ink" strong size={15}>{ad.title}</Text>
        <Text tone="brand" strong size={14}>{adPrice(ad.price)}</Text>
        <Text tone="muted" size={12}>{ad.city || ad.user?.city || 'الموقع غير محدد'}</Text>
        <Text tone="muted" size={11}>{ad.condition === 'NEW' ? 'جديد' : ad.condition === 'USED' ? 'مستعمل' : ad.condition === 'REFURBISHED' ? 'مجدد' : 'حالة غير محددة'}</Text>
      </View>
    </Pressable>
  );
});

const adKey = (ad: AdListItem) => ad.id;
const openAd = (id: string) => pushOnce({ pathname: '/ads/[id]', params: { id } });
const renderAd = ({ item }: { item: AdListItem }) => <AdRow ad={item} onOpen={openAd} />;

export default function AllAdsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [condition, setCondition] = useState<Condition | ''>('');
  const [categoryId, setCategoryId] = useState('');
  const [categoryOptions, setCategoryOptions] = useState<PublicCategory[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cityInput, setCityInput] = useState('');
  const [minPriceInput, setMinPriceInput] = useState('');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [filterError, setFilterError] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<{ city: string; minPrice?: number; maxPrice?: number; sort: AdSort }>({ city: '', sort: 'newest' });

  useEffect(() => {
    let active = true;
    void fetchPublicCategories()
      .then((items) => { if (active) setCategoryOptions(flattenPublicCategories(items)); })
      .catch(() => { if (active) setCategoryOptions([]); });
    return () => { active = false; };
  }, []);

  const listKey = JSON.stringify({ query, condition, categoryId, ...appliedFilters });
  const list = usePaginatedList<AdListItem>({
    key: listKey,
    pageSize: 12,
    fetchPage: async (page, signal) => {
      const result = await fetchPublicAds({
        page,
        limit: 12,
        search: query || undefined,
        condition: condition || undefined,
        categoryId: categoryId || undefined,
        city: appliedFilters.city || undefined,
        minPrice: appliedFilters.minPrice,
        maxPrice: appliedFilters.maxPrice,
        sortBy: appliedFilters.sort === 'price_asc' || appliedFilters.sort === 'price_desc' ? 'price' : appliedFilters.sort === 'views' ? 'views' : 'createdAt',
        sortOrder: appliedFilters.sort === 'price_asc' ? 'asc' : 'desc',
        signal,
      });
      return { items: result.items, meta: { page: result.page, totalPages: result.totalPages, total: result.total ?? result.items.length } };
    },
    getItemKey: (item) => item.id,
    mapError: () => 'تعذر تحميل الإعلانات. تحقق من الاتصال ثم حاول مرة أخرى.',
  });

  const applySearch = useCallback(() => {
    const nextQuery = search.trim();
    if (nextQuery === query) void list.refresh();
    else setQuery(nextQuery);
  }, [search, query, list.refresh]);

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

  const clearFilters = useCallback(() => {
    setCategoryId('');
    setCondition('');
    setCityInput('');
    setMinPriceInput('');
    setMaxPriceInput('');
    setFilterError('');
    setAppliedFilters({ city: '', sort: 'newest' });
  }, []);

  const activeFilterCount = [condition, categoryId, appliedFilters.city, appliedFilters.minPrice, appliedFilters.maxPrice, appliedFilters.sort !== 'newest' ? appliedFilters.sort : ''].filter(Boolean).length;
  const header = (
    <View style={styles.listHeader}>
      <View style={styles.searchRow}>
        <TextInput
          allowFontScaling
          maxFontSizeMultiplier={1.3}
          accessibilityLabel="ابحث في كل الإعلانات"
          placeholder="ابحث عن إعلان…"
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={applySearch}
          returnKeyType="search"
          style={styles.searchInput}
        />
        <PrimaryButton label="بحث" onPress={applySearch} />
      </View>
      <View style={styles.rowBetween}>
        <Text style={styles.label}>حالة الإعلان</Text>
        <Text style={styles.count}>{list.totalCount} نتيجة</Text>
      </View>
      <View style={styles.chips}>
        {CONDITIONS.map((option) => <FilterChip key={option.value || 'all'} label={option.label} selected={condition === option.value} onPress={() => setCondition(option.value)} />)}
      </View>
      <SecondaryButton label={filtersOpen ? 'إخفاء التصفية' : `تصفية وترتيب${activeFilterCount ? ` (${activeFilterCount})` : ''}`} onPress={() => setFiltersOpen((value) => !value)} />
      {filtersOpen ? (
        <View style={styles.filterPanel}>
          <Text style={styles.label}>التصنيف</Text>
          <View style={styles.chips}>
            <FilterChip label="كل التصنيفات" selected={!categoryId} onPress={() => setCategoryId('')} />
            {categoryOptions.map((category) => <FilterChip key={category.id} label={category.nameAr || category.name} selected={categoryId === category.id} onPress={() => setCategoryId(category.id)} />)}
          </View>
          <Text style={styles.label}>الترتيب</Text>
          <View style={styles.chips}>
            {AD_SORTS.map((option) => <FilterChip key={option.value} label={option.label} selected={appliedFilters.sort === option.value} onPress={() => setAppliedFilters((current) => ({ ...current, sort: option.value }))} />)}
          </View>
          <Field label="المدينة" value={cityInput} onChangeText={setCityInput} placeholder="كل المدن" />
          <View style={styles.priceFields}>
            <View style={styles.priceField}><Field label="السعر من" value={minPriceInput} onChangeText={setMinPriceInput} keyboardType="decimal-pad" placeholder="بدون حد أدنى" /></View>
            <View style={styles.priceField}><Field label="السعر إلى" value={maxPriceInput} onChangeText={setMaxPriceInput} keyboardType="decimal-pad" placeholder="بدون حد أعلى" /></View>
          </View>
          {filterError ? <Text style={styles.errorText}>{filterError}</Text> : null}
          <View style={styles.filterActions}>
            <PrimaryButton label="تطبيق الفلاتر" onPress={applyFilters} />
            <SecondaryButton label="مسح الفلاتر" onPress={clearFilters} />
          </View>
        </View>
      ) : null}
      {list.loading && list.items.length === 0 ? <SkeletonList count={4} /> : null}
      {list.error && list.items.length === 0 ? <ErrorState title="تعذر تحميل الإعلانات" description={list.error} onAction={() => void list.retry()} /> : null}
      {list.error && list.items.length > 0 ? <ErrorState title="تعذر تحديث الإعلانات" description={list.error} onAction={() => void list.retry()} /> : null}
      {!list.loading && !list.error && list.items.length === 0 ? <EmptyState title="لا توجد إعلانات مطابقة" description="غيّر عبارة البحث أو التصنيف أو الفلاتر." /> : null}
    </View>
  );

  const footer = (
    <View style={styles.listFooter}>
      {list.items.length > 0 ? (
        <View style={styles.paginationRow}>
          <PrimaryButton label="السابق" variant="secondary" disabled={list.page <= 1 || list.loading} onPress={() => void list.goToPage(list.page - 1)} />
          <View style={styles.pageLabel}><Text style={styles.muted}>الصفحة {list.page} من {list.totalPages}</Text></View>
          <PrimaryButton label="التالي" variant="secondary" disabled={!list.hasNextPage || list.loading} onPress={() => void list.goToPage(list.page + 1)} />
        </View>
      ) : null}
      <Notice tone="muted">تُعرض أحدث الإعلانات أولًا. يمكن تغيير التصنيف والمدينة والسعر والترتيب من التصفية.</Notice>
    </View>
  );

  return <PageList title="كل الإعلانات" data={list.items} keyExtractor={adKey} renderItem={renderAd} header={header} footer={footer} refreshControl={<BrandRefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} />} />;
}

const createStyles = (colors: ColorPalette) => StyleSheet.create({
  listHeader: { gap: spacing.md },
  listFooter: { gap: spacing.md },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchInput: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.control, paddingHorizontal: spacing.md, color: colors.ink, textAlign: 'right', backgroundColor: colors.surface },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { ...typography.label, color: colors.ink, textAlign: 'right' },
  count: { ...typography.caption, color: colors.muted },
  muted: { ...typography.caption, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filterPanel: { gap: spacing.md, padding: spacing.md, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface },
  priceFields: { flexDirection: 'row', gap: spacing.md },
  priceField: { flex: 1, minWidth: 0 },
  errorText: { ...typography.caption, color: colors.danger, textAlign: 'right' },
  filterActions: { gap: spacing.sm },
  paginationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pageLabel: { flex: 1, alignItems: 'center' },
});
