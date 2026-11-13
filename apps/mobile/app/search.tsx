import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { formatMoney } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { AppIcon } from '@/components/Icons';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { fetchPublicCategories, flattenPublicCategories, type PublicCategory } from '@/features/categories/categories.api';
import { searchMarketplace, type SearchResult } from '@/features/discovery/discovery.api';
import { normalizeNumericInput } from '@/lib/normalize-numeric-input';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { elevation, fontSizes, radius, sizes, spacing, typography, ux, fontWeights, insets } from '@/theme/tokens';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View, RefreshControl } from 'react-native';
import { AppFlashList } from '@/components/ui/AppFlashList';
import { ScreenFrame } from '@/components/ui/ScreenFrame';
import { useLocalSearchParams, type Href } from 'expo-router';
import { goBack, pushOnce } from '@/lib/navigation';
import { COPY } from '@/lib/copy';

const types = [
  { label: 'الكل', value: 'all' },
  { label: 'إعلانات', value: 'ads' },
  { label: 'منتجات', value: 'products' },
  { label: 'متاجر', value: 'stores' },
  { label: 'خدمات', value: 'services' },
] as const;

const conditions = [
  { label: 'كل الحالات', value: '' },
  { label: 'جديد', value: 'NEW' },
  { label: 'مستعمل', value: 'USED' },
  { label: 'مجدد', value: 'REFURBISHED' },
] as const;

const sorts = [
  { label: 'الأكثر صلة', value: 'relevance' },
  { label: 'الأحدث', value: 'newest' },
  { label: 'الأعلى تقييمًا', value: 'rating' },
  { label: 'الأكثر مشاهدة', value: 'views' },
  { label: 'السعر الأقل', value: 'price_asc' },
  { label: 'السعر الأعلى', value: 'price_desc' },
] as const;

function firstParam(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function routeFor(item: SearchResult): Href {
  switch (item.type) {
    case 'ad':
      return { pathname: '/ads/[id]', params: { id: item.id } };
    case 'product':
      return { pathname: '/products/[id]', params: { id: item.id } };
    case 'store':
      return { pathname: '/stores/[id]', params: { id: item.id } };
    case 'service':
      return { pathname: '/services/[id]', params: { id: item.id } };
  }
}

function typeLabel(t: SearchResult['type']): string {
  switch (t) {
    case 'ad':
      return 'إعلان';
    case 'product':
      return 'منتج';
    case 'store':
      return 'متجر';
    case 'service':
      return 'خدمة';
  }
}

type SearchFilters = {
  query: string;
  type: (typeof types)[number]['value'];
  sort: (typeof sorts)[number]['value'];
  city: string;
  categoryId: string;
  minPrice: string;
  maxPrice: string;
  condition: (typeof conditions)[number]['value'];
};

function Chip({
  label,
  selected,
  onPress,
  filled,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  filled?: boolean;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && (filled ? styles.chipFilled : styles.chipSelected),
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.chipText,
          selected && (filled ? styles.chipTextFilled : styles.chipTextSelected),
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** نتيجة بحث واحدة — memo: تُعاد فقط عند تغيّر العنصر نفسه (لا عند الكتابة في حقل البحث). */
const SearchResultCard = memo(function SearchResultCard({
  item,
  onOpen,
}: {
  item: SearchResult;
  onOpen: (item: SearchResult) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);
  const handlePress = useCallback(() => onOpen(item), [item, onOpen]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`فتح ${item.title}`}
      accessibilityHint="عرض تفاصيل النتيجة"
      onPress={handlePress}
      style={({ pressed }) => [styles.resultCard, pressed && styles.pressed]}
    >
      <View style={styles.resultBody}>
        <View style={styles.resultTop}>
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{typeLabel(item.type)}</Text>
          </View>
          {item.seller?.verified ? (
            <Text style={styles.verified}>بائع موثّق</Text>
          ) : null}
        </View>
        <Text style={styles.resultTitle} numberOfLines={2}>
          {item.title}
        </Text>
        {item.description || item.city ? (
          <Text numberOfLines={2} style={styles.resultDesc}>
            {item.description || item.city || ''}
          </Text>
        ) : null}
        <View style={styles.resultMeta}>
          <Text style={styles.resultPrice}>
            {item.price
              ? formatMoney(item.price)
              : item.rating > 0
                ? `★ ${item.rating.toFixed(1)}`
                : '—'}
          </Text>
          <Text style={styles.resultCity}>{item.city || 'الموقع غير محدد'}</Text>
        </View>
      </View>
      <AppIcon name="forward" size={20} color={colors.muted} />
    </Pressable>
  );
});

/** FlashList لا يدعم gap: الفاصل يعادل gap(md) + separator(sm) السابقين. */
function ResultSeparator() {
  return <View style={{ height: spacing.md + spacing.sm }} />;
}

export default function SearchScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);

  const params = useLocalSearchParams<{
    q?: string | string[];
    categoryId?: string | string[];
    type?: string | string[];
    city?: string | string[];
    minPrice?: string | string[];
    maxPrice?: string | string[];
    condition?: string | string[];
  }>();
  const initialQ = firstParam(params.q);
  const initialTypeParam = firstParam(params.type);
  const initialCategoryId = firstParam(params.categoryId);
  const initialCity = firstParam(params.city);
  const initialMinPrice = firstParam(params.minPrice);
  const initialMaxPrice = firstParam(params.maxPrice);
  const initialCondition = firstParam(params.condition);

  const [query, setQuery] = useState(initialQ || '');
  const [hasSearched, setHasSearched] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [type, setType] = useState<(typeof types)[number]['value']>(
    types.some((entry) => entry.value === initialTypeParam)
      ? (initialTypeParam as (typeof types)[number]['value'])
      : 'all',
  );
  const [sort, setSort] = useState<(typeof sorts)[number]['value']>('relevance');
  const [city, setCity] = useState(initialCity || '');
  const [minPrice, setMinPrice] = useState(initialMinPrice || '');
  const [maxPrice, setMaxPrice] = useState(initialMaxPrice || '');
  const [condition, setCondition] = useState<(typeof conditions)[number]['value']>(
    conditions.some((entry) => entry.value === initialCondition)
      ? (initialCondition as (typeof conditions)[number]['value'])
      : '',
  );
  const [categoryId, setCategoryId] = useState(initialCategoryId || '');
  const [categories, setCategories] = useState<PublicCategory[]>([]);
  const [submittedFilters, setSubmittedFilters] = useState<SearchFilters | null>(null);
  const [validationError, setValidationError] = useState('');
  const initialSearchTriggered = useRef(false);

  const searchList = usePaginatedList<SearchResult>({
    key: submittedFilters ? JSON.stringify(submittedFilters) : 'marketplace-search:idle',
    pageSize: 20,
    enabled: Boolean(submittedFilters),
    fetchPage: async (page, signal) => {
      if (!submittedFilters) return { items: [], meta: { page: 1, totalPages: 1, total: 0 } };
      const min = submittedFilters.minPrice.trim()
        ? Number(normalizeNumericInput(submittedFilters.minPrice))
        : undefined;
      const max = submittedFilters.maxPrice.trim()
        ? Number(normalizeNumericInput(submittedFilters.maxPrice))
        : undefined;
      const result = await searchMarketplace({
        q: submittedFilters.query,
        type: submittedFilters.type,
        sort: submittedFilters.sort,
        city: submittedFilters.city,
        categoryId: submittedFilters.categoryId || undefined,
        minPrice: min,
        maxPrice: max,
        condition:
          submittedFilters.type === 'ads'
            ? submittedFilters.condition || undefined
            : undefined,
        page,
        limit: 20,
        signal,
      });
      return {
        items: result.items,
        meta: { page: result.page, totalPages: result.totalPages, total: result.total },
      };
    },
    getItemKey: (item) => `${item.type}:${item.id}`,
  });

  const items = searchList.items;
  const page = searchList.page;
  const totalPages = searchList.totalPages;
  const total = searchList.totalCount;
  const loading = searchList.loading || searchList.refreshing;
  const more = searchList.loadingMore;
  const error = validationError || searchList.error || searchList.loadMoreError || '';

  useEffect(() => {
    void fetchPublicCategories()
      .then((result) => setCategories(flattenPublicCategories(result)))
      .catch(() => setCategories([]));
  }, []);

  const refreshSearchList = searchList.refresh;

  const runSearch = useCallback(() => {
    const filters: SearchFilters = {
      query,
      type,
      sort,
      city,
      categoryId,
      minPrice,
      maxPrice,
      condition,
    };
    const hasCriterion = Boolean(
      filters.query.trim() ||
        filters.categoryId ||
        filters.city.trim() ||
        filters.minPrice.trim() ||
        filters.maxPrice.trim() ||
        (filters.type === 'ads' && filters.condition),
    );
    if (!hasCriterion) {
      setValidationError('أدخل كلمة للبحث أو اختر تصنيفًا أو فلترًا أولًا.');
      setSubmittedFilters(null);
      return;
    }
    const min = filters.minPrice.trim()
      ? Number(normalizeNumericInput(filters.minPrice))
      : undefined;
    const max = filters.maxPrice.trim()
      ? Number(normalizeNumericInput(filters.maxPrice))
      : undefined;
    if (
      (min !== undefined && (!Number.isFinite(min) || min < 0)) ||
      (max !== undefined && (!Number.isFinite(max) || max < 0)) ||
      (min !== undefined && max !== undefined && min > max)
    ) {
      setValidationError('تحقق من نطاق السعر؛ يجب أن يكون السعر الأدنى أقل من الأعلى.');
      return;
    }
    setValidationError('');
    setHasSearched(true);
    if (JSON.stringify(filters) === JSON.stringify(submittedFilters)) {
      void refreshSearchList();
    } else {
      setSubmittedFilters(filters);
    }
  }, [
    query,
    type,
    sort,
    city,
    categoryId,
    minPrice,
    maxPrice,
    condition,
    submittedFilters,
    refreshSearchList,
  ]);

  useEffect(() => {
    if (
      !initialSearchTriggered.current &&
      (initialQ?.trim() ||
        initialCategoryId ||
        initialCity?.trim() ||
        initialMinPrice?.trim() ||
        initialMaxPrice?.trim() ||
        initialCondition)
    ) {
      initialSearchTriggered.current = true;
      runSearch();
    }
  }, [
    runSearch,
    initialQ,
    initialCategoryId,
    initialCity,
    initialMinPrice,
    initialMaxPrice,
    initialCondition,
  ]);

  const clearFilters = useCallback(() => {
    setType('all');
    setSort('relevance');
    setCity('');
    setMinPrice('');
    setMaxPrice('');
    setCondition('');
    setCategoryId('');
    setSubmittedFilters(null);
    setHasSearched(false);
    setValidationError('');
  }, []);

  const activeFilterCount = [
    type !== 'all',
    Boolean(city.trim()),
    Boolean(minPrice.trim() || maxPrice.trim()),
    Boolean(condition),
    Boolean(categoryId),
    sort !== 'relevance',
  ].filter(Boolean).length;

  const listHeader = (
    <View style={styles.headerBlock}>
      {/* رأس الصفحة */}
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="رجوع"
          onPress={() => goBack()}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
        >
          <AppIcon name="back" size={22} color={colors.brandOnSoft} />
        </Pressable>
        <View style={styles.titleCol}>
          <Text accessibilityRole="header" style={styles.title}>
            البحث
          </Text>
          <Text style={styles.subtitle}>إعلانات · منتجات · متاجر · خدمات</Text>
        </View>
      </View>

      {/* شريط البحث */}
      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          allowFontScaling
          maxFontSizeMultiplier={1.3}
          accessibilityLabel="البحث في السوق"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void runSearch()}
          placeholder="ماذا تبحث عنه؟"
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          style={styles.searchInput}
          textAlign="right"
        />
        {query.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="مسح البحث"
            onPress={() => setQuery('')}
            hitSlop={8}
          >
            <Text style={styles.clearIcon}>×</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="تنفيذ البحث"
          onPress={() => void runSearch()}
          style={({ pressed }) => [styles.searchBtn, pressed && styles.pressed]}
        >
          <Text style={styles.searchBtnText}>بحث</Text>
        </Pressable>
      </View>

      {/* نوع النتائج — دائمًا ظاهر */}
      <View style={styles.chipRow}>
        {types.map((entry) => (
          <Chip
            key={entry.value}
            label={entry.label}
            selected={type === entry.value}
            filled
            onPress={() => setType(entry.value)}
          />
        ))}
      </View>

      {/* زر الفلاتر المتقدمة */}
      <View style={styles.actionsRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showAdvanced }}
          onPress={() => setShowAdvanced((v) => !v)}
          style={({ pressed }) => [styles.advancedToggle, pressed && styles.pressed]}
        >
          <Text style={styles.advancedToggleText}>
            {showAdvanced ? 'إخفاء الفلاتر' : 'فلاتر متقدمة'}
            {activeFilterCount > 0 && !showAdvanced ? ` (${activeFilterCount})` : ''}
          </Text>
        </Pressable>
        {hasSearched || activeFilterCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={clearFilters}
            style={({ pressed }) => [styles.clearLink, pressed && styles.pressed]}
          >
            <Text style={styles.clearLinkText}>مسح الكل</Text>
          </Pressable>
        ) : null}
      </View>

      {showAdvanced ? (
        <View style={styles.advancedPanel}>
          {type === 'ads' ? (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>حالة الإعلان</Text>
              <View style={styles.chipRow}>
                {conditions.map((entry) => (
                  <Chip
                    key={entry.value || 'all'}
                    label={entry.label}
                    selected={condition === entry.value}
                    onPress={() => setCondition(entry.value)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>ترتيب النتائج</Text>
            <View style={styles.chipRow}>
              {sorts.map((entry) => (
                <Chip
                  key={entry.value}
                  label={entry.label}
                  selected={sort === entry.value}
                  onPress={() => setSort(entry.value)}
                />
              ))}
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>المدينة</Text>
            <TextInput
              allowFontScaling
              maxFontSizeMultiplier={1.3}
              accessibilityLabel="المدينة للبحث"
              value={city}
              onChangeText={setCity}
              placeholder="المدينة (اختياري)"
              placeholderTextColor={colors.muted}
              style={styles.input}
              textAlign="right"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>نطاق السعر</Text>
            <View style={styles.priceRow}>
              <TextInput
                allowFontScaling
                maxFontSizeMultiplier={1.3}
                accessibilityLabel="أقل سعر"
                value={minPrice}
                onChangeText={(v) => setMinPrice(normalizeNumericInput(v))}
                keyboardType="decimal-pad"
                placeholder="من"
                placeholderTextColor={colors.muted}
                style={[styles.input, styles.priceInput]}
                textAlign="right"
              />
              <TextInput
                allowFontScaling
                maxFontSizeMultiplier={1.3}
                accessibilityLabel="أعلى سعر"
                value={maxPrice}
                onChangeText={(v) => setMaxPrice(normalizeNumericInput(v))}
                keyboardType="decimal-pad"
                placeholder="إلى"
                placeholderTextColor={colors.muted}
                style={[styles.input, styles.priceInput]}
                textAlign="right"
              />
            </View>
          </View>

          {categories.length > 0 ? (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>التصنيف</Text>
              <View style={styles.chipRow}>
                <Chip
                  label="الكل"
                  selected={!categoryId}
                  onPress={() => setCategoryId('')}
                />
                {categories.slice(0, 12).map((cat) => (
                  <Chip
                    key={cat.id}
                    label={cat.nameAr || cat.name}
                    selected={categoryId === cat.id}
                    onPress={() => setCategoryId(cat.id)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => void runSearch()}
            style={({ pressed }) => [styles.applyBtn, pressed && styles.pressed]}
          >
            <Text style={styles.applyBtnText}>تطبيق والبحث</Text>
          </Pressable>
        </View>
      ) : null}

      {hasSearched && (type === 'ads' || type === 'products' || type === 'services') ? (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            pushOnce({
              pathname: '/saved-searches',
              params: {
                type,
                q: query,
                city,
                minPrice,
                maxPrice,
                condition: type === 'ads' ? condition : '',
                categoryId,
                label: query.trim() ? `بحث عن ${query.trim()}` : 'بحث محفوظ',
              },
            })
          }
          style={({ pressed }) => [styles.saveSearchBtn, pressed && styles.pressed]}
        >
          <Text style={styles.saveSearchText}>حفظ هذا البحث</Text>
        </Pressable>
      ) : null}

      {loading ? <LoadingState message="جارٍ البحث عن النتائج…" /> : null}
      {error ? (
        <ErrorState
          title="تعذر إكمال البحث"
          description={error}
          actionLabel="تعديل البيانات"
          onAction={() => {
            setValidationError('');
            void searchList.retry();
          }}
        />
      ) : null}
      {items.length > 0 ? (
        <Text style={styles.resultsMeta}>
          {total} نتيجة · الصفحة {page} من {totalPages}
        </Text>
      ) : null}
    </View>
  );

  const listEmpty =
    !loading && !error && hasSearched ? (
      <EmptyState
        title="لا توجد نتائج مطابقة"
        description="جرّب تغيير عبارة البحث أو إزالة بعض الفلاتر للحصول على نتائج أكثر."
        actionLabel="مسح الفلاتر والنتائج"
        onAction={clearFilters}
      />
    ) : !loading && !error && !hasSearched ? (
      <EmptyState
        title="ابدأ البحث في السوق"
        description="أدخل كلمة أو اختر نوع النتيجة، ثم اضغط «بحث»."
      />
    ) : null;

  const listFooter =
    !loading && searchList.hasNextPage && items.length > 0 ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="تحميل المزيد من نتائج البحث"
        accessibilityState={{ disabled: more }}
        disabled={more}
        onPress={() => void searchList.loadMore()}
        style={({ pressed }) => [styles.loadMoreBtn, pressed && styles.pressed]}
      >
        <Text style={styles.loadMoreText}>
          {more
            ? 'جارٍ تحميل المزيد…'
            : searchList.loadMoreError
              ? COPY.retryAction
              : 'تحميل المزيد'}
        </Text>
      </Pressable>
    ) : null;

  const openResult = useCallback((item: SearchResult) => pushOnce(routeFor(item)), []);
  const keyExtractor = useCallback((item: SearchResult) => `${item.type}-${item.id}`, []);
  const renderItem = useCallback(
    ({ item }: { item: SearchResult }) => <SearchResultCard item={item} onOpen={openResult} />,
    [openResult],
  );

  return (
    <ScreenFrame>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <AppFlashList
          refreshControl={<RefreshControl refreshing={searchList.refreshing} onRefresh={() => void searchList.refresh()} tintColor={colors.brand} />}
          data={items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmpty ?? undefined}
          ListFooterComponent={listFooter ?? undefined}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={ResultSeparator}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        />
      </KeyboardAvoidingView>
    </ScreenFrame>
  );
}

const createThemeStyles = (colors: ColorPalette) => StyleSheet.create({
  flex: { flex: 1 },
  // FlashList: padding فقط (لا gap ولا flexGrow).
  listContent: {
    padding: spacing.lg,
    paddingBottom: insets.listBottom,
  },
  pressed: { opacity: ux.pressedOpacity },

  headerBlock: {
    gap: spacing.md,
    marginBottom: spacing.md + spacing.sm,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  backBtn: {
    width: sizes.iconButton,
    height: sizes.iconButton,
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: { flex: 1, gap: spacing.xxs },
  title: {
    textAlign: 'right',
    ...typography.title,
    color: colors.ink,
  },
  subtitle: {
    textAlign: 'right',
    ...typography.caption,
    color: colors.muted,
  },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 52,
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.controlBorder,
    ...elevation.xs,
  },
  searchIcon: {
    color: colors.muted,
    fontSize: fontSizes[18],
    fontWeight: fontWeights.semibold,
  },
  searchInput: {
    flex: 1,
    color: colors.ink,
    fontSize: fontSizes[15],
    paddingVertical: spacing.sm,
  },
  clearIcon: {
    color: colors.muted,
    fontSize: fontSizes[22],
    lineHeight: 26,
    paddingHorizontal: spacing.xs,
  },
  searchBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBtnText: {
    color: colors.onBrand,
    fontSize: fontSizes[13],
    fontWeight: fontWeights.bold,
  },

  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brand,
  },
  chipFilled: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  chipText: {
    ...typography.captionStrong,
    color: colors.muted,
  },
  chipTextSelected: {
    color: colors.brandOnSoft,
  },
  chipTextFilled: {
    color: colors.onBrand,
  },

  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  advancedToggle: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.brandSoft,
  },
  advancedToggleText: {
    color: colors.brandOnSoft,
    fontSize: fontSizes[13],
    fontWeight: fontWeights.semibold,
  },
  clearLink: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  clearLinkText: {
    color: colors.muted,
    fontSize: fontSizes[13],
    fontWeight: fontWeights.semibold,
  },

  advancedPanel: {
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...elevation.sm,
  },
  fieldGroup: { gap: spacing.sm },
  fieldLabel: {
    ...typography.label,
    color: colors.ink,
    textAlign: 'right',
  },
  input: {
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: colors.controlBorder,
    borderRadius: radius.input ?? radius.md,
    backgroundColor: colors.canvas,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    fontSize: fontSizes[14],
  },
  priceRow: { flexDirection: 'row', gap: spacing.sm },
  priceInput: { flex: 1 },

  applyBtn: {
    minHeight: 48,
    borderRadius: radius.button ?? radius.md,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: {
    color: colors.onBrand,
    ...typography.button,
  },

  saveSearchBtn: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.brand,
    backgroundColor: colors.surface,
  },
  saveSearchText: {
    color: colors.brand,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes[13],
  },

  resultsMeta: {
    color: colors.muted,
    textAlign: 'right',
    ...typography.caption,
  },

  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    ...elevation.sm,
  },
  resultBody: {
    flex: 1,
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  resultTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
  },
  typeBadge: {
    backgroundColor: colors.brandSoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  typeBadgeText: {
    ...typography.overline,
    color: colors.brandOnSoft,
  },
  verified: {
    ...typography.overline,
    color: colors.success ?? colors.brand,
  },
  resultTitle: {
    color: colors.ink,
    ...typography.bodyStrong,
    textAlign: 'right',
    width: '100%',
  },
  resultDesc: {
    color: colors.muted,
    textAlign: 'right',
    ...typography.caption,
    width: '100%',
  },
  resultMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: spacing.xxs,
    gap: spacing.sm,
  },
  resultPrice: {
    color: colors.brand,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes[15],
  },
  resultCity: {
    color: colors.muted,
    ...typography.caption,
  },

  separator: { height: spacing.sm },

  loadMoreBtn: {
    marginTop: spacing.md,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.brandSoftActive ?? colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreText: {
    color: colors.brandOnSoft,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes[14],
  },
});
