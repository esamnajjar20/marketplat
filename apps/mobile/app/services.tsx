import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { formatMoney } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BrandRefreshControl } from '@/components/ui/BrandRefreshControl';
import { AppFlashList } from '@/components/ui/AppFlashList';
import { ListGapMd } from '@/components/ui/ListSeparator';
import { pickRemoteImageUri } from '@/lib/list-image';
import { CatalogCard } from '@/components/MarketCards';
import { ScreenFrame } from '@/components/ui/ScreenFrame';
import { useLocalSearchParams } from 'expo-router';

import { pushOnce } from '@/lib/navigation';
import {
  fetchServiceListingsPage,
  getCachedServiceListingsPage,
  fetchServiceCategoryOptions,
  fetchPublicServiceTypes,
  type PublicServiceTypeOption,
  type PublicServiceTypeFieldOption,
  type ServiceCategoryOption,
  type ServiceListing,
} from '@/features/services/services.api';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import {
  AppHeader,
  EmptyState,
  ErrorState,
  Field,
  PrimaryButton,
  SecondaryButton,
  SearchBar,
  SkeletonList,
} from '@/components/ui';
import { FilterChip } from '@/components/ui/FilterChip';
import { normalizeNumericInput } from '@/lib/normalize-numeric-input';
import { spacing, typography } from '@/theme/tokens';

type ServiceSort = 'newest' | 'price_asc' | 'price_desc' | 'views';
type ServiceLocation = 'AT_CUSTOMER' | 'AT_PROVIDER' | 'REMOTE';
const SERVICE_LOCATIONS: { value: ServiceLocation | ''; label: string }[] = [
  { value: '', label: 'كل المواقع' },
  { value: 'AT_CUSTOMER', label: 'لدى العميل' },
  { value: 'AT_PROVIDER', label: 'لدى مقدم الخدمة' },
  { value: 'REMOTE', label: 'عن بُعد' },
];
const SERVICE_SORTS: { value: ServiceSort; label: string }[] = [
  { value: 'newest', label: 'الأحدث' },
  { value: 'price_asc', label: 'السعر الأقل' },
  { value: 'price_desc', label: 'السعر الأعلى' },
  { value: 'views', label: 'الأكثر مشاهدة' },
];

function priceLabel(item: ServiceListing) {
  if (item.pricingType === 'NEGOTIABLE' || item.price == null) return 'السعر عند الاتفاق';
  const value = Number(item.price);
  return Number.isFinite(value)
    ? `${formatMoney(value)}${item.pricingType === 'STARTING_FROM' ? ' وما فوق' : ''}`
    : 'السعر عند الاتفاق';
}

/** صف خدمة — memo: يعتمد على id + دالة فتح ثابتة. */
const ServiceRow = memo(function ServiceRow({ item, onOpen }: { item: ServiceListing; onOpen: (id: string) => void }) {
  return (
    <CatalogCard
      id={item.id}
      title={item.title}
      subtitle={`${item.provider?.businessName || item.provider?.sellerProfile?.displayName || 'مقدم خدمة'}`}
      price={priceLabel(item)}
      meta={item.category?.nameAr || item.category?.name || undefined}
      imageUri={pickRemoteImageUri(item.images)}
      glyph="✦"
      onPressItem={onOpen}
    />
  );
});


export default function ServicesScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);
  const params = useLocalSearchParams<{ categoryId?: string | string[]; serviceTypeId?: string | string[] }>();
  const routeCategoryParam = Array.isArray(params.categoryId) ? params.categoryId[0] : params.categoryId;
  const routeCategoryId = typeof routeCategoryParam === 'string' && routeCategoryParam.trim() ? routeCategoryParam : '';

  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const routeServiceTypeParam = Array.isArray(params.serviceTypeId) ? params.serviceTypeId[0] : params.serviceTypeId;
  const routeServiceTypeId = typeof routeServiceTypeParam === 'string' && routeServiceTypeParam.trim() ? routeServiceTypeParam : '';
  const [categoryId, setCategoryId] = useState(routeCategoryId);
  const [serviceTypeId, setServiceTypeId] = useState(routeServiceTypeId);
  const [serviceTypeOptions, setServiceTypeOptions] = useState<PublicServiceTypeOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<ServiceCategoryOption[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cityInput, setCityInput] = useState('');
  const [minPriceInput, setMinPriceInput] = useState('');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [filterError, setFilterError] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<{
    city: string;
    serviceLocation: ServiceLocation | '';
    minPrice?: number;
    maxPrice?: number;
    attributeFilters: Record<string, unknown>;
    sort: ServiceSort;
  }>({ city: '', serviceLocation: '', attributeFilters: {}, sort: 'newest' });
  const [draftAttributeFilters, setDraftAttributeFilters] = useState<Record<string, string>>({});

  useEffect(() => {
    setCategoryId(routeCategoryId);
  }, [routeCategoryId]);

  useEffect(() => {
    setServiceTypeId(routeServiceTypeId);
  }, [routeServiceTypeId]);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([fetchServiceCategoryOptions(), fetchPublicServiceTypes()]).then(([categoriesResult, typesResult]) => {
      if (!active) return;
      setCategoryOptions(categoriesResult.status === 'fulfilled' ? categoriesResult.value : []);
      setServiceTypeOptions(typesResult.status === 'fulfilled' ? typesResult.value : []);
    });
    return () => { active = false; };
  }, []);

  const selectedServiceType = serviceTypeOptions.find((item) => item.id === serviceTypeId);
  const dynamicFields = (selectedServiceType?.fields ?? []).filter((field) =>
    field.isActive !== false && field.scope === 'LISTING' && ['SELECT', 'BOOLEAN', 'NUMBER', 'TEXT'].includes(field.type),
  );
  const availableServiceLocations = SERVICE_LOCATIONS.filter((item) => {
    if (!item.value) return true;
    const capabilities = selectedServiceType?.capabilities;
    if (!capabilities) return true;
    if (capabilities.allowedLocations?.length && !capabilities.allowedLocations.includes(item.value)) return false;
    if (item.value === 'REMOTE') return capabilities.remote !== false;
    if (item.value === 'AT_CUSTOMER') return capabilities.atCustomer !== false;
    return capabilities.atProvider !== false;
  });

  const updateAttributeFilter = useCallback((key: string, value: unknown) => {
    const removesValue = value === '' || value === null || value === undefined;
    if (!removesValue && !Object.prototype.hasOwnProperty.call(appliedFilters.attributeFilters, key) && Object.keys(appliedFilters.attributeFilters).length >= 12) {
      setFilterError('يمكن تطبيق 12 خاصية إضافية كحد أقصى في البحث الواحد.');
      return;
    }
    setFilterError('');
    setAppliedFilters((current) => {
      const next = { ...current.attributeFilters };
      if (removesValue) delete next[key];
      else next[key] = value;
      return { ...current, attributeFilters: next };
    });
  }, [appliedFilters.attributeFilters]);

  const listKey = JSON.stringify({ submitted, serviceTypeId, categoryId, ...appliedFilters });
  const list = usePaginatedList<ServiceListing>({
    key: listKey,
    pageSize: 30,
    fetchPage: async (page, signal) => {
      const result = await fetchServiceListingsPage({
        page,
        limit: 30,
        search: submitted,
        serviceTypeId: serviceTypeId || undefined,
        categoryId: categoryId || undefined,
        city: appliedFilters.city || undefined,
        serviceLocation: appliedFilters.serviceLocation || undefined,
        attributeFilters: Object.keys(appliedFilters.attributeFilters).length ? appliedFilters.attributeFilters : undefined,
        minPrice: appliedFilters.minPrice,
        maxPrice: appliedFilters.maxPrice,
        sortBy: appliedFilters.sort === 'price_asc' || appliedFilters.sort === 'price_desc'
          ? 'price'
          : appliedFilters.sort === 'views' ? 'views' : 'createdAt',
        sortOrder: appliedFilters.sort === 'price_asc' ? 'asc' : 'desc',
        signal,
      });
      return { items: result.items, meta: { page: result.page, totalPages: result.totalPages, total: result.total } };
    },
    readCachedPage: async (page) => {
      const result = await getCachedServiceListingsPage({
        page,
        limit: 30,
        search: submitted,
        serviceTypeId: serviceTypeId || undefined,
        categoryId: categoryId || undefined,
        city: appliedFilters.city || undefined,
        serviceLocation: appliedFilters.serviceLocation || undefined,
        attributeFilters: Object.keys(appliedFilters.attributeFilters).length ? appliedFilters.attributeFilters : undefined,
        minPrice: appliedFilters.minPrice,
        maxPrice: appliedFilters.maxPrice,
        sortBy: appliedFilters.sort === 'price_asc' || appliedFilters.sort === 'price_desc'
          ? 'price'
          : appliedFilters.sort === 'views' ? 'views' : 'createdAt',
        sortOrder: appliedFilters.sort === 'price_asc' ? 'asc' : 'desc',
      });
      return result ? { items: result.items, meta: { page: result.page, totalPages: result.totalPages, total: result.total } } : null;
    },
    getItemKey: (item) => item.id,
  });

  const applyFilters = useCallback(() => {
    const min = minPriceInput.trim() ? Number(normalizeNumericInput(minPriceInput)) : undefined;
    const max = maxPriceInput.trim() ? Number(normalizeNumericInput(maxPriceInput)) : undefined;
    if ((min !== undefined && (!Number.isFinite(min) || min < 0)) ||
      (max !== undefined && (!Number.isFinite(max) || max < 0)) ||
      (min !== undefined && max !== undefined && min > max)) {
      setFilterError('تحقق من نطاق السعر؛ يجب أن يكون السعر الأدنى أقل من الأعلى.');
      return;
    }
    const attributes = { ...appliedFilters.attributeFilters };
    for (const field of dynamicFields) {
      if (field.type !== 'NUMBER' && field.type !== 'TEXT') continue;
      const raw = (draftAttributeFilters[field.key] ?? '').trim();
      if (!raw) {
        delete attributes[field.key];
        continue;
      }
      if (field.type === 'NUMBER') {
        const value = Number(normalizeNumericInput(raw));
        if (!Number.isFinite(value)) {
          setFilterError(`تحقق من قيمة الحقل «${field.labelAr || field.label || field.key}».`);
          return;
        }
        attributes[field.key] = value;
      } else {
        attributes[field.key] = raw;
      }
    }
    if (Object.keys(attributes).length > 12) {
      setFilterError('يمكن تطبيق 12 خاصية إضافية كحد أقصى في البحث الواحد.');
      return;
    }
    setFilterError('');
    setAppliedFilters((current) => ({ ...current, city: cityInput.trim(), minPrice: min, maxPrice: max, attributeFilters: attributes }));
    setFiltersOpen(false);
  }, [cityInput, minPriceInput, maxPriceInput, appliedFilters.attributeFilters, draftAttributeFilters, dynamicFields]);

  const setSort = useCallback((sort: ServiceSort) => {
    setAppliedFilters((current) => ({ ...current, sort }));
  }, []);

  const clearFilters = useCallback(() => {
    setCategoryId('');
    setServiceTypeId('');
    setDraftAttributeFilters({});
    setCityInput('');
    setMinPriceInput('');
    setMaxPriceInput('');
    setFilterError('');
    setAppliedFilters({ city: '', serviceLocation: '', attributeFilters: {}, sort: 'newest' });
  }, []);

  const openService = useCallback((id: string) => pushOnce(`/services/${encodeURIComponent(id)}`), []);
  const keyExtractor = useCallback((item: ServiceListing) => item.id, []);
  const renderItem = useCallback(
    ({ item }: { item: ServiceListing }) => <ServiceRow item={item} onOpen={openService} />,
    [openService],
  );

  const activeFilterCount = [serviceTypeId, categoryId, appliedFilters.city, appliedFilters.serviceLocation, appliedFilters.minPrice, appliedFilters.maxPrice,
    appliedFilters.sort !== 'newest' ? appliedFilters.sort : ''].filter(Boolean).length + Object.keys(appliedFilters.attributeFilters).length;

  return (
    <ScreenFrame>
      <AppHeader title="الخدمات" />
      <AppFlashList
        data={list.items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <BrandRefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} />
        }
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.subtitle}>{categoryId ? 'تصفح الخدمات ضمن التصنيف المحدد' : 'اعثر على مقدم الخدمة المناسب'}</Text>
            <SecondaryButton label="مقدمو الخدمة" onPress={() => pushOnce('/service-providers')} />
            <SearchBar
              value={query}
              onChangeText={setQuery}
              onSubmit={() => setSubmitted(query.trim())}
              onClear={() => { setQuery(''); setSubmitted(''); }}
              placeholder="ابحث عن خدمة…"
              accessibilityLabel="ابحث عن خدمة"
            />
            <SecondaryButton
              label={filtersOpen ? 'إخفاء التصفية' : `تصفية وترتيب${activeFilterCount ? ` (${activeFilterCount})` : ''}`}
              onPress={() => setFiltersOpen((value) => !value)}
            />
            {filtersOpen ? (
              <View style={styles.filterPanel}>
                <Text style={styles.filterLabel}>مجال الخدمة</Text>
                <View style={styles.chips}>
                  <FilterChip label="كل المجالات" selected={!serviceTypeId} onPress={() => { setServiceTypeId(''); setCategoryId(''); setDraftAttributeFilters({}); setAppliedFilters((current) => ({ ...current, serviceLocation: '', attributeFilters: {} })); }} />
                  {serviceTypeOptions.map((serviceType) => (
                    <FilterChip key={serviceType.id} label={serviceType.nameAr || serviceType.name} selected={serviceTypeId === serviceType.id} onPress={() => { setServiceTypeId(serviceType.id); setCategoryId(''); setDraftAttributeFilters({}); setAppliedFilters((current) => ({ ...current, serviceLocation: '', attributeFilters: {} })); }} />
                  ))}
                </View>
                <Text style={styles.filterLabel}>التصنيف</Text>
                <View style={styles.chips}>
                  <FilterChip label="كل الفئات" selected={!categoryId} onPress={() => setCategoryId('')} />
                  {categoryOptions.filter((category) => !serviceTypeId || category.serviceTypeId === serviceTypeId).map((category) => (
                    <FilterChip
                      key={category.id}
                      label={category.nameAr || category.name}
                      selected={categoryId === category.id}
                      onPress={() => setCategoryId(category.id)}
                    />
                  ))}
                </View>
                <Text style={styles.filterLabel}>موقع تقديم الخدمة</Text>
                <View style={styles.chips}>
                  {availableServiceLocations.map((item) => (
                    <FilterChip key={item.value || 'all-locations'} label={item.label} selected={appliedFilters.serviceLocation === item.value} onPress={() => setAppliedFilters((current) => ({ ...current, serviceLocation: item.value }))} />
                  ))}
                </View>
                <Field label="المدينة" value={cityInput} onChangeText={setCityInput} placeholder="كل المدن" />
                <View style={styles.priceFields}>
                  <View style={styles.priceField}><Field label="السعر من" value={minPriceInput} onChangeText={setMinPriceInput} keyboardType="decimal-pad" placeholder="بدون حد أدنى" /></View>
                  <View style={styles.priceField}><Field label="السعر إلى" value={maxPriceInput} onChangeText={setMaxPriceInput} keyboardType="decimal-pad" placeholder="بدون حد أعلى" /></View>
                </View>
                {dynamicFields.length ? (
                  <View style={styles.dynamicFields}>
                    <Text style={styles.filterLabel}>خصائص {selectedServiceType?.nameAr || 'الخدمة'}</Text>
                    {dynamicFields.map((field: PublicServiceTypeFieldOption) => {
                      const current = appliedFilters.attributeFilters[field.key];
                      const label = field.labelAr || field.label || field.key;
                      if (field.type === 'SELECT') {
                        return (
                          <View key={field.key} style={styles.dynamicField}>
                            <Text style={styles.filterLabel}>{label}</Text>
                            <View style={styles.chips}>
                              <FilterChip label="الكل" selected={typeof current !== 'string'} onPress={() => updateAttributeFilter(field.key, '')} />
                              {(field.options ?? []).map((option) => (
                                <FilterChip key={option.value} label={option.labelAr || option.label || option.value} selected={current === option.value} onPress={() => updateAttributeFilter(field.key, option.value)} />
                              ))}
                            </View>
                          </View>
                        );
                      }
                      if (field.type === 'BOOLEAN') {
                        return (
                          <View key={field.key} style={styles.dynamicField}>
                            <Text style={styles.filterLabel}>{label}</Text>
                            <View style={styles.chips}>
                              <FilterChip label="الكل" selected={typeof current !== 'boolean'} onPress={() => updateAttributeFilter(field.key, '')} />
                              <FilterChip label="نعم" selected={current === true} onPress={() => updateAttributeFilter(field.key, true)} />
                              <FilterChip label="لا" selected={current === false} onPress={() => updateAttributeFilter(field.key, false)} />
                            </View>
                          </View>
                        );
                      }
                      return (
                        <Field
                          key={field.key}
                          label={label}
                          value={draftAttributeFilters[field.key] ?? (typeof current === 'string' || typeof current === 'number' ? String(current) : '')}
                          onChangeText={(value) => setDraftAttributeFilters((draft) => ({ ...draft, [field.key]: value }))}
                          keyboardType={field.type === 'NUMBER' ? 'decimal-pad' : 'default'}
                          placeholder={field.type === 'NUMBER' ? 'أي قيمة' : `ابحث حسب ${label}`}
                        />
                      );
                    })}
                  </View>
                ) : null}
                <Text style={styles.filterLabel}>الترتيب</Text>
                <View style={styles.chips}>
                  {SERVICE_SORTS.map((item) => (
                    <FilterChip key={item.value} label={item.label} selected={appliedFilters.sort === item.value} onPress={() => setSort(item.value)} />
                  ))}
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
              <ErrorState title="تعذر تحميل الخدمات" description={list.error} onAction={() => void list.retry()} />
            ) : (
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>خدمات متاحة</Text>
                <Text style={styles.count}>{list.totalCount} نتيجة</Text>
              </View>
            )}
            {list.error && list.items.length > 0 ? <ErrorState title="تعذر تحديث الخدمات" description={list.error} onAction={() => void list.retry()} /> : null}
          </View>
        }
        ListEmptyComponent={
          !list.loading && !list.error && list.items.length === 0 ? (
            <EmptyState title="لا توجد خدمات مطابقة" description="جرّب كلمات بحث أو فلاتر مختلفة أو اسحب للتحديث." />
          ) : undefined
        }
        ItemSeparatorComponent={ListGapMd}
        ListFooterComponent={list.items.length > 0 ? (
          <View style={styles.listFooter}>
            {list.loadMoreError ? <ErrorState title="تعذر تحميل المزيد" description={list.loadMoreError} onAction={() => void list.retry()} /> : null}
            {list.hasNextPage ? <PrimaryButton label={list.loadingMore ? 'جارٍ التحميل…' : list.loadMoreError ? 'إعادة المحاولة' : 'تحميل المزيد'} onPress={() => void (list.loadMoreError ? list.retry() : list.loadMore())} busy={list.loadingMore} variant="secondary" /> : null}
          </View>
        ) : undefined}
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
  dynamicFields: { gap: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.md },
  dynamicField: { gap: spacing.xs },
  priceFields: { flexDirection: 'row', gap: spacing.md },
  priceField: { flex: 1, minWidth: 0 },
  filterError: { color: colors.danger, ...typography.caption, textAlign: 'right' },
  filterActions: { gap: spacing.sm },
  subtitle: { ...typography.caption, color: colors.muted, textAlign: 'right' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { ...typography.subtitle, color: colors.ink },
  count: { ...typography.caption, color: colors.muted },
});
