import { useAppTheme } from '@/theme/ThemeProvider';
import { showToast } from '@/lib/toast';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useState } from 'react';
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

import { useAsyncResource } from '@/hooks/useAsyncResource';
import { AppFlashList } from '@/components/ui/AppFlashList';
import { ListGapMd } from '@/components/ui/ListSeparator';

export default function SavedSearchesScreen() {
  const { colors } = useAppTheme();

  const params = useLocalSearchParams<{ label?: string | string[]; type?: string | string[]; q?: string | string[]; city?: string | string[]; minPrice?: string | string[]; maxPrice?: string | string[]; categoryId?: string | string[] }>();
  const first = (value?: string | string[]) => Array.isArray(value) ? value[0] : value;
  const { accessToken, csrfToken } = useAuth();
  const [label, setLabel] = useState(() => first(params.label) || '');
  const [type, setType] = useState<'ads' | 'products' | 'services'>(() => ['ads', 'products', 'services'].includes(first(params.type) || '') ? first(params.type) as 'ads' | 'products' | 'services' : 'ads');
  const [q, setQ] = useState(() => first(params.q) || '');
  const [city, setCity] = useState(() => first(params.city) || '');
  const [min, setMin] = useState(() => first(params.minPrice) || '');
  const [max, setMax] = useState(() => first(params.maxPrice) || '');
  const [categoryId, setCategoryId] = useState(() => first(params.categoryId) || '');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');

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
            ...(city.trim() ? { city: city.trim() } : {}),
            ...(minValue !== undefined ? { minPrice: minValue } : {}),
            ...(maxValue !== undefined ? { maxPrice: maxValue } : {}),
            ...(categoryId.trim() ? { categoryId: categoryId.trim() } : {}),
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
                      onPress={() => setType(v)}
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
                <Field label="المدينة" value={city} onChangeText={setCity} placeholder="للإعلانات فقط حاليًا" />
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
              <Text tone="muted">
                {i.filters.type || 'ads'} · {i.filters.q || i.filters.city || 'فلاتر سعرية'}
              </Text>
              <Pressable accessibilityRole="button" onPress={() => pushOnce({ pathname: '/search', params: { q: i.filters.q || '', categoryId: i.filters.categoryId || '', type: i.filters.type || 'ads', city: i.filters.city || '', minPrice: i.filters.minPrice == null ? '' : String(i.filters.minPrice), maxPrice: i.filters.maxPrice == null ? '' : String(i.filters.maxPrice) } })}>
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
