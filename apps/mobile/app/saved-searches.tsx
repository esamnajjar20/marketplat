import { useAppTheme } from '@/theme/ThemeProvider';
import { showToast } from '@/lib/toast';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { BrandRefreshControl } from '@/components/ui/BrandRefreshControl';
import { useLocalSearchParams } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { useAuth } from '@/features/auth/AuthContext';
import {
  createSavedSearch,
  deleteSavedSearch,
  fetchSavedSearches,
  type SavedSearch,
} from '@/features/account/saved-searches.api';
import { Field, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/ui';
import { spacing, fontWeights, radius } from '@/theme/tokens';
import { normalizeNumericInput } from '@/lib/normalize-numeric-input';
import { fetchPublicCategories, flattenPublicCategories } from '@/features/categories/categories.api';
import { fetchProductCategories } from '@/features/commerce/commerce.api';
import { fetchServiceCategoryOptions } from '@/features/services/services.api';

import { useAsyncResource } from '@/hooks/useAsyncResource';
import { AppFlashList } from '@/components/ui/AppFlashList';
import { ListGapMd } from '@/components/ui/ListSeparator';

function savedSearchFilterLabels(item: SavedSearch, categoryLabels: Record<string, string>): string[] {
  const filters = item.filters;
  const type = filters.type || 'ads';
  const labels: string[] = [type === 'ads' ? 'الإعلانات' : type === 'products' ? 'المنتجات' : 'الخدمات'];
  if (filters.q?.trim()) labels.push(`بحث: ${filters.q.trim()}`);
  if (type === 'ads' && filters.city?.trim()) labels.push(`المدينة: ${filters.city.trim()}`);
  if (filters.categoryId) labels.push(`التصنيف: ${categoryLabels[filters.categoryId] || filters.categoryId}`);
  if (type === 'ads' && filters.condition) {
    labels.push(filters.condition === 'NEW' ? 'جديد' : filters.condition === 'USED' ? 'مستعمل' : 'مجدد');
  }
  if (filters.minPrice != null) labels.push(`من ${filters.minPrice}`);
  if (filters.maxPrice != null) labels.push(`إلى ${filters.maxPrice}`);
  if (labels.length === 1) labels.push('دون فلاتر إضافية');
  return labels;
}

export default function SavedSearchesScreen() {
  const { colors } = useAppTheme();

  const params = useLocalSearchParams<{ label?: string | string[]; type?: string | string[]; q?: string | string[]; city?: string | string[]; minPrice?: string | string[]; maxPrice?: string | string[]; condition?: string | string[]; categoryId?: string | string[] }>();
  const first = (value?: string | string[]) => Array.isArray(value) ? value[0] : value;
  const { accessToken, csrfToken } = useAuth();
  const [label, setLabel] = useState(() => first(params.label) || '');
  const [type, setType] = useState<'ads' | 'products' | 'services'>(() => ['ads', 'products', 'services'].includes(first(params.type) || '') ? first(params.type) as 'ads' | 'products' | 'services' : 'ads');
  const [q, setQ] = useState(() => first(params.q) || '');
  const [city, setCity] = useState(() => first(params.type) === 'ads' ? first(params.city) || '' : '');
  const [min, setMin] = useState(() => first(params.minPrice) || '');
  const [max, setMax] = useState(() => first(params.maxPrice) || '');
  const [categoryId, setCategoryId] = useState(() => first(params.categoryId) || '');
  const [condition, setCondition] = useState<'NEW' | 'USED' | 'REFURBISHED' | ''>(() => {
    const value = first(params.condition);
    return first(params.type) === 'ads' && (value === 'NEW' || value === 'USED' || value === 'REFURBISHED') ? value : '';
  });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const [categoryLabels, setCategoryLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      fetchPublicCategories().then((items) => flattenPublicCategories(items)),
      fetchProductCategories(),
      fetchServiceCategoryOptions(),
    ]).then((groups) => {
      if (!active) return;
      const next: Record<string, string> = {};
      for (const group of groups) {
        if (group.status !== 'fulfilled' || !Array.isArray(group.value)) continue;
        for (const category of group.value) {
          if (!category || typeof category.id !== 'string') continue;
          const label = category.nameAr?.trim() || category.name?.trim();
          if (label) next[category.id] = label;
        }
      }
      setCategoryLabels(next);
    });
    return () => { active = false; };
  }, []);

  // دورة الجلب الموحّدة: تلغي الطلب القديم وتتجاهل الاستجابة المتأخرة عند تغيّر الحساب.
  const resource = useAsyncResource<SavedSearch[]>(
    () => fetchSavedSearches(accessToken as string),
    {
      key: accessToken ?? '',
      manual: !accessToken,
      tag: 'saved-searches',
      mapError: (e) => (e instanceof Error && e.message ? e.message : 'تعذر تحميل عمليات البحث.'),
    },
  );
  const { loading, reload } = resource;
  const items = resource.data ?? [];
  const error = actionError || resource.error || '';
  const load = useCallback(() => reload({ soft: true }), [reload]);
  const pullReload = useCallback(() => { void reload({ soft: true }); }, [reload]);

  const save = async () => {
    if (!accessToken) return;
    if (!label.trim()) {
      setActionError('أدخل اسمًا للبحث.');
      return;
    }
    const minValue = min.trim() ? Number(normalizeNumericInput(min)) : undefined;
    const maxValue = max.trim() ? Number(normalizeNumericInput(max)) : undefined;
    if ((minValue !== undefined && (!Number.isFinite(minValue) || minValue < 0)) || (maxValue !== undefined && (!Number.isFinite(maxValue) || maxValue < 0)) || (minValue !== undefined && maxValue !== undefined && minValue > maxValue)) {
      setActionError('تحقق من نطاق السعر قبل حفظ البحث.');
      return;
    }
    setBusy(true);
    setActionError('');
    setMessage('');
    try {
      await createSavedSearch(
        {
          label: label.trim(),
          filters: {
            type,
            ...(q.trim() ? { q: q.trim() } : {}),
            ...(type === 'ads' && city.trim() ? { city: city.trim() } : {}),
            ...(minValue !== undefined ? { minPrice: minValue } : {}),
            ...(maxValue !== undefined ? { maxPrice: maxValue } : {}),
            ...(categoryId.trim() ? { categoryId: categoryId.trim() } : {}),
            ...(type === 'ads' && condition ? { condition } : {}),
          },
        },
        accessToken,
        csrfToken,
      );
      setLabel('');
      setQ('');
      setCity('');
      setMin('');
      setMax('');
      setCategoryId('');
      setCondition('');
      setMessage('تم حفظ البحث.');
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'تعذر حفظ البحث.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (id: string) => {
    if (!accessToken) return;
    void deleteSavedSearch(id, accessToken, csrfToken)
      .then(async () => {
        await load();
        showToast('تم حذف البحث المحفوظ', 'يمكنك إنشاء عملية بحث جديدة في أي وقت.', 'success');
      })
      .catch((e) => showToast('تعذر حذف البحث', e instanceof Error ? e.message : 'حاول مرة أخرى.', 'error'));
  };

  return (
    <PageShell title="عمليات البحث المحفوظة" scroll={false}>
      {!accessToken ? (
        <>
          <Notice>سجّل الدخول لحفظ عمليات البحث.</Notice>
          <PrimaryButton label="تسجيل الدخول" onPress={() => pushOnce('/login')} />
        </>
      ) : (
        <AppFlashList refreshControl={<BrandRefreshControl refreshing={resource.refreshing} onRefresh={pullReload} />}
          data={loading && items.length === 0 ? [] : items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: spacing.x4l }}
          ListHeaderComponent={
            <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
              <SectionCard>
                <Text tone="ink" strong size={18}>
                  حفظ بحث جديد
                </Text>
                <Field
                  label="اسم البحث"
                  value={label}
                  onChangeText={setLabel}
                  maxLength={100}
                  placeholder="مثال: هواتف بسعر مناسب"
                />
                <View style={{ flexDirection: 'row', gap: spacing.md }}>
                  {(
                    [
                      ['ads', 'الإعلانات'],
                      ['products', 'المنتجات'],
                      ['services', 'الخدمات'],
                    ] as const
                  ).map(([v, l]) => (
                    <Pressable accessibilityRole="button"
                      key={v}
                      onPress={() => {
                        if (type === v) return;
                        setType(v);
                        setCategoryId('');
                        if (v !== 'ads') { setCity(''); setCondition(''); }
                      }}
                      style={{
                        flex: 1,
                        minHeight: 44,
                        justifyContent: 'center',
                        padding: spacing.md,
                        borderRadius: radius.control,
                        backgroundColor: type === v ? colors.brand : colors.surface,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <Text
                        style={{
                          textAlign: 'center',
                          color: type === v ? colors.white : colors.ink,
                          fontWeight: fontWeights.bold,
                        }}
                      >
                        {l}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Field label="كلمة البحث" value={q} onChangeText={setQ} placeholder="اختياري" />
                {type === 'ads' ? (
                  <>
                    <Field label="المدينة" value={city} onChangeText={setCity} placeholder="اختياري" />
                    <View style={{ gap: spacing.xs }}>
                      <Text tone="muted" strong>حالة الإعلان</Text>
                      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                        {([['', 'الكل'], ['NEW', 'جديد'], ['USED', 'مستعمل'], ['REFURBISHED', 'مجدد']] as const).map(([value, title]) => (
                          <Pressable key={value || 'all'} accessibilityRole="button" accessibilityState={{ selected: condition === value }} onPress={() => setCondition(value)} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: condition === value ? colors.brand : colors.border, backgroundColor: condition === value ? colors.brandSoft : colors.surface }}>
                            <Text tone={condition === value ? 'brand' : 'ink'} strong>{title}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  </>
                ) : (
                  <Notice tone="muted">فلتر المدينة غير مدعوم في تنبيهات البحث المحفوظ لهذا النوع؛ لذلك لن يُحفظ ضمن شروط المطابقة.</Notice>
                )}
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Field label="أقل سعر" value={min} onChangeText={(v) => setMin(normalizeNumericInput(v))} keyboardType="numeric" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field label="أعلى سعر" value={max} onChangeText={(v) => setMax(normalizeNumericInput(v))} keyboardType="numeric" />
                  </View>
                </View>
                <PrimaryButton label="حفظ البحث" onPress={() => void save()} busy={busy} />
              </SectionCard>
              <Text tone="ink" strong size={18}>
                عمليات البحث المحفوظة
              </Text>
              {loading ? <Notice tone="muted">جارٍ تحميل عمليات البحث…</Notice> : null}
              {message ? <Notice tone="success">{message}</Notice> : null}
              {error ? <Notice>{error}</Notice> : null}
            </View>
          }
          ListEmptyComponent={!loading ? <Notice tone="muted">لا توجد عمليات بحث محفوظة.</Notice> : undefined}
          renderItem={({ item: i }) => (
            <SectionCard>
              <Text tone="ink" strong>{i.label}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {savedSearchFilterLabels(i, categoryLabels).map((filterLabel) => (
                  <View key={filterLabel} style={{ borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.borderSubtle }}>
                    <Text tone="muted" size={12}>{filterLabel}</Text>
                  </View>
                ))}
              </View>
              <Pressable accessibilityRole="button" onPress={() => pushOnce({ pathname: '/search', params: { q: i.filters.q || '', categoryId: i.filters.categoryId || '', type: i.filters.type || 'ads', city: (i.filters.type || 'ads') === 'ads' ? i.filters.city || '' : '', condition: (i.filters.type || 'ads') === 'ads' ? i.filters.condition || '' : '', minPrice: i.filters.minPrice == null ? '' : String(i.filters.minPrice), maxPrice: i.filters.maxPrice == null ? '' : String(i.filters.maxPrice) } })}>
                <Text tone="brand" strong>فتح نتائج البحث</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => remove(i.id)}>
                <Text tone="danger" strong>حذف البحث</Text>
              </Pressable>
            </SectionCard>
          )}
          ItemSeparatorComponent={ListGapMd}
        />
      )}
    </PageShell>
  );
}
