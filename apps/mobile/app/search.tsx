import { formatMoney } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { AppIcon } from '@/components/Icons';
import { EmptyState, ErrorState, LoadingState } from '@/components/MobileUI';
import { fetchPublicCategories, flattenPublicCategories, type PublicCategory } from '@/features/categories/categories.api';
import { searchMarketplace, type SearchResult } from '@/features/discovery/discovery.api';
import { normalizeNumericInput } from '@/lib/normalize-numeric-input';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { colors, fontSizes, radius, spacing, typography } from '@/theme/tokens';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';

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

export default function SearchScreen() {
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
      const min = submittedFilters.minPrice.trim() ? Number(normalizeNumericInput(submittedFilters.minPrice)) : undefined;
      const max = submittedFilters.maxPrice.trim() ? Number(normalizeNumericInput(submittedFilters.maxPrice)) : undefined;
      const result = await searchMarketplace({
        q: submittedFilters.query,
        type: submittedFilters.type,
        sort: submittedFilters.sort,
        city: submittedFilters.city,
        categoryId: submittedFilters.categoryId || undefined,
        minPrice: min,
        maxPrice: max,
        condition: submittedFilters.type === 'ads' ? (submittedFilters.condition || undefined) : undefined,
        page,
        limit: 20,
        signal,
      });
      return { items: result.items, meta: { page: result.page, totalPages: result.totalPages, total: result.total } };
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

  const runSearch = useCallback(() => {
    const filters: SearchFilters = { query, type, sort, city, categoryId, minPrice, maxPrice, condition };
    const hasCriterion = Boolean(
      filters.query.trim() || filters.categoryId || filters.city.trim() || filters.minPrice.trim()
      || filters.maxPrice.trim() || (filters.type === 'ads' && filters.condition),
    );
    if (!hasCriterion) {
      setValidationError('أدخل كلمة للبحث أو اختر تصنيفًا أو فلترًا أولًا.');
      setSubmittedFilters(null);
      return;
    }
    const min = filters.minPrice.trim() ? Number(normalizeNumericInput(filters.minPrice)) : undefined;
    const max = filters.maxPrice.trim() ? Number(normalizeNumericInput(filters.maxPrice)) : undefined;
    if (
      (min !== undefined && (!Number.isFinite(min) || min < 0))
      || (max !== undefined && (!Number.isFinite(max) || max < 0))
      || (min !== undefined && max !== undefined && min > max)
    ) {
      setValidationError('تحقق من نطاق السعر؛ يجب أن يكون السعر الأدنى أقل من الأعلى.');
      return;
    }
    setValidationError('');
    setHasSearched(true);
    if (JSON.stringify(filters) === JSON.stringify(submittedFilters)) {
      void searchList.refresh();
    } else {
      setSubmittedFilters(filters);
    }
  }, [query, type, sort, city, categoryId, minPrice, maxPrice, condition, submittedFilters, searchList.refresh]);

  useEffect(() => {
    if (
      !initialSearchTriggered.current
      && (initialQ?.trim() || initialCategoryId || initialCity?.trim() || initialMinPrice?.trim() || initialMaxPrice?.trim() || initialCondition)
    ) {
      initialSearchTriggered.current = true;
      runSearch();
    }
  }, [runSearch, initialQ, initialCategoryId, initialCity, initialMinPrice, initialMaxPrice, initialCondition]);

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

  const listHeader = (
    <View style={{ gap: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="رجوع"
          onPress={() => router.back()}
          style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.controlBorder, borderRadius: 12 }}
        >
          <AppIcon name="back" size={22} color={colors.brand} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={{ textAlign: 'right', ...typography.display, color: colors.ink }}>
            البحث المتقدم
          </Text>
          <Text style={{ textAlign: 'right', ...typography.body, color: colors.muted }}>
            ابحث في الإعلانات والمنتجات والمتاجر والخدمات.
          </Text>
        </View>
      </View>

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
        style={{ minHeight: 54, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radius.md, paddingHorizontal: 12, color: colors.ink, textAlign: 'right', backgroundColor: colors.surface }}
      />

      <Text accessibilityRole="header" style={{ color: colors.ink, textAlign: 'right', fontWeight: '800' }}>نوع النتائج</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {types.map((entry) => (
          <Pressable
            key={entry.value}
            accessibilityRole="button"
            accessibilityLabel={`نوع النتائج: ${entry.label}`}
            accessibilityState={{ selected: type === entry.value }}
            onPress={() => setType(entry.value)}
            style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, backgroundColor: type === entry.value ? colors.brand : colors.surface, borderWidth: 1, borderColor: type === entry.value ? colors.brand : colors.controlBorder }}
          >
            <Text style={{ color: type === entry.value ? colors.white : colors.ink, fontWeight: '700' }}>{entry.label}</Text>
          </Pressable>
        ))}
      </View>

      {type === 'ads' ? (
        <>
          <Text accessibilityRole="header" style={{ color: colors.ink, textAlign: 'right', fontWeight: '800' }}>حالة الإعلان</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {conditions.map((entry) => (
              <Pressable
                key={entry.value || 'all'}
                accessibilityRole="button"
                accessibilityLabel={`حالة الإعلان: ${entry.label}`}
                accessibilityState={{ selected: condition === entry.value }}
                onPress={() => setCondition(entry.value)}
                style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, backgroundColor: condition === entry.value ? colors.brandSoft : colors.surface, borderWidth: 1, borderColor: condition === entry.value ? colors.brand : colors.controlBorder }}
              >
                <Text style={{ color: colors.ink }}>{entry.label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <Text accessibilityRole="header" style={{ color: colors.ink, textAlign: 'right', fontWeight: '800' }}>ترتيب النتائج</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {sorts.map((entry) => (
          <Pressable
            key={entry.value}
            accessibilityRole="button"
            accessibilityLabel={`ترتيب النتائج: ${entry.label}`}
            accessibilityState={{ selected: sort === entry.value }}
            onPress={() => setSort(entry.value)}
            style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 18, backgroundColor: sort === entry.value ? colors.brandSoft : colors.surface, borderWidth: 1, borderColor: sort === entry.value ? colors.brand : colors.controlBorder }}
          >
            <Text style={{ color: colors.ink }}>{entry.label}</Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        allowFontScaling
        maxFontSizeMultiplier={1.3}
        accessibilityLabel="المدينة للبحث"
        value={city}
        onChangeText={setCity}
        placeholder="المدينة (اختياري)"
        placeholderTextColor={colors.muted}
        style={{ minHeight: 52, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radius.md, paddingHorizontal: 12, color: colors.ink, textAlign: 'right', backgroundColor: colors.surface }}
      />

      <Text accessibilityRole="header" style={{ textAlign: 'right', color: colors.ink, fontWeight: '800' }}>تصنيف (اختياري)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="كل التصنيفات"
          accessibilityState={{ selected: !categoryId }}
          onPress={() => setCategoryId('')}
          style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', padding: 10, borderRadius: 12, backgroundColor: !categoryId ? colors.brandSoft : colors.surface, borderWidth: 1, borderColor: !categoryId ? colors.brand : colors.controlBorder }}
        >
          <Text style={{ color: colors.ink }}>كل التصنيفات</Text>
        </Pressable>
        {categories.slice(0, 20).map((category) => (
          <Pressable
            key={category.id}
            accessibilityRole="button"
            accessibilityLabel={`تصنيف ${category.nameAr || category.name}`}
            accessibilityState={{ selected: categoryId === category.id }}
            onPress={() => setCategoryId(category.id)}
            style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', padding: 10, borderRadius: 12, backgroundColor: categoryId === category.id ? colors.brandSoft : colors.surface, borderWidth: 1, borderColor: categoryId === category.id ? colors.brand : colors.controlBorder }}
          >
            <Text style={{ color: colors.ink }}>{category.nameAr || category.name}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          allowFontScaling
          maxFontSizeMultiplier={1.3}
          accessibilityLabel="أقل سعر للبحث"
          value={minPrice}
          onChangeText={(value) => setMinPrice(normalizeNumericInput(value))}
          keyboardType="decimal-pad"
          placeholder="السعر من"
          placeholderTextColor={colors.muted}
          style={{ flex: 1, minHeight: 52, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radius.md, paddingHorizontal: 10, color: colors.ink, textAlign: 'right', backgroundColor: colors.surface }}
        />
        <TextInput
          allowFontScaling
          maxFontSizeMultiplier={1.3}
          accessibilityLabel="أعلى سعر للبحث"
          value={maxPrice}
          onChangeText={(value) => setMaxPrice(normalizeNumericInput(value))}
          keyboardType="decimal-pad"
          placeholder="السعر إلى"
          placeholderTextColor={colors.muted}
          style={{ flex: 1, minHeight: 52, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radius.md, paddingHorizontal: 10, color: colors.ink, textAlign: 'right', backgroundColor: colors.surface }}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="تنفيذ البحث"
        accessibilityState={{ disabled: loading }}
        disabled={loading}
        onPress={() => void runSearch()}
        style={({ pressed }) => [
          { minHeight: 52, justifyContent: 'center', alignItems: 'center', borderRadius: radius.md, backgroundColor: colors.brand, opacity: pressed && !loading ? 0.78 : 1 },
          loading && { opacity: 0.65 },
        ]}
      >
        <Text style={{ color: colors.white, fontWeight: '900' }}>{loading ? 'جارٍ البحث…' : 'بحث'}</Text>
      </Pressable>

      {hasSearched && (type === 'ads' || type === 'products' || type === 'services') ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({
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
          })}
          style={{ minHeight: 46, justifyContent: 'center', alignItems: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.brand }}
        >
          <Text style={{ color: colors.brand, fontWeight: '800' }}>حفظ هذا البحث</Text>
        </Pressable>
      ) : null}

      {loading ? <LoadingState message="جارٍ البحث عن النتائج…" /> : null}
      {error ? <ErrorState title="تعذر إكمال البحث" description={error} actionLabel="تعديل البيانات" onAction={() => { setValidationError(''); void searchList.retry(); }} /> : null}
      {items.length > 0 ? (
        <Text style={{ color: colors.muted, textAlign: 'right', ...typography.caption }}>
          {total} نتيجة · الصفحة {page} من {totalPages}
        </Text>
      ) : null}
    </View>
  );

  const listEmpty = !loading && !error && hasSearched
    ? (
      <EmptyState
        title="لا توجد نتائج مطابقة"
        description="جرّب تغيير عبارة البحث أو إزالة بعض الفلاتر للحصول على نتائج أكثر."
        actionLabel="مسح الفلاتر والنتائج"
        onAction={clearFilters}
      />
    )
    : !loading && !error && !hasSearched
      ? (
        <EmptyState
          title="ابدأ البحث في السوق"
          description="أدخل كلمة أو اختر تصنيفًا، ثم اضغط «بحث» لعرض الإعلانات والمنتجات والمتاجر والخدمات."
        />
      )
      : null;

  const listFooter = !loading && searchList.hasNextPage && items.length > 0 ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="تحميل المزيد من نتائج البحث"
      accessibilityState={{ disabled: more }}
      disabled={more}
      onPress={() => void searchList.loadMore()}
      style={{ padding: 14, borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md, alignItems: 'center' }}
    >
      <Text style={{ color: colors.brand, fontWeight: '800' }}>{more ? 'جارٍ تحميل المزيد…' : searchList.loadMoreError ? 'تعذر التحميل — أعد المحاولة' : 'تحميل المزيد'}</Text>
    </Pressable>
  ) : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        data={items}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`فتح ${item.title}`}
            accessibilityHint="عرض تفاصيل النتيجة"
            onPress={() => router.push(routeFor(item))}
            style={({ pressed }) => [
              { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 15, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radius.lg, backgroundColor: colors.surface, marginBottom: spacing.md },
              pressed && { opacity: 0.78 },
            ]}
          >
            <View style={{ flex: 1, alignItems: 'flex-end', gap: 4 }}>
              <Text style={{ color: colors.ink, ...typography.bodyStrong, textAlign: 'right' }}>{item.title}</Text>
              <Text numberOfLines={2} style={{ color: colors.muted, textAlign: 'right', ...typography.caption }}>
                {item.description || item.city || ''}
              </Text>
              <Text style={{ color: colors.brand, fontWeight: '800' }}>
                {item.price ? formatMoney(item.price) : item.rating > 0 ? `★ ${item.rating.toFixed(1)}` : item.type}
              </Text>
              <Text style={{ color: colors.muted, ...typography.caption }}>
                {item.city || 'الموقع غير محدد'}{item.seller?.verified ? ' · بائع موثّق' : ''}
              </Text>
            </View>
            <AppIcon name="forward" size={22} color={colors.brand} />
          </Pressable>
        )}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 44, flexGrow: 1 }}
        ItemSeparatorComponent={() => null}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
      />
    </KeyboardAvoidingView>
  );
}
