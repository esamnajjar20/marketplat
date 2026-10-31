import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import {
  createSavedSearch,
  deleteSavedSearch,
  fetchSavedSearches,
  type SavedSearch,
} from '@/features/account/saved-searches.api';
import { Field, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { colors, spacing } from '@/theme/tokens';
import { normalizeNumericInput } from '@/lib/normalize-numeric-input';
import { marketListPerf } from '@/lib/listPerformance';

export default function SavedSearchesScreen() {
  const params = useLocalSearchParams<{ label?: string | string[]; type?: string | string[]; q?: string | string[]; city?: string | string[]; minPrice?: string | string[]; maxPrice?: string | string[]; categoryId?: string | string[] }>();
  const first = (value?: string | string[]) => Array.isArray(value) ? value[0] : value;
  const { accessToken, csrfToken } = useAuth();
  const [items, setItems] = useState<SavedSearch[]>([]);
  const seq = useRef(0);
  const [label, setLabel] = useState(() => first(params.label) || '');
  const [type, setType] = useState<'ads' | 'products' | 'services'>(() => ['ads', 'products', 'services'].includes(first(params.type) || '') ? first(params.type) as 'ads' | 'products' | 'services' : 'ads');
  const [q, setQ] = useState(() => first(params.q) || '');
  const [city, setCity] = useState(() => first(params.city) || '');
  const [min, setMin] = useState(() => first(params.minPrice) || '');
  const [max, setMax] = useState(() => first(params.maxPrice) || '');
  const [categoryId, setCategoryId] = useState(() => first(params.categoryId) || '');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    const current = ++seq.current;
    setLoading(true);
    setError('');
    try {
      const data = await fetchSavedSearches(accessToken);
      if (current === seq.current) setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل عمليات البحث.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
    return () => { seq.current += 1; };
  }, [load]);

  const save = async () => {
    if (!accessToken) return;
    if (!label.trim()) {
      setError('أدخل اسمًا للبحث.');
      return;
    }
    const minValue = min.trim() ? Number(normalizeNumericInput(min)) : undefined;
    const maxValue = max.trim() ? Number(normalizeNumericInput(max)) : undefined;
    if ((minValue !== undefined && (!Number.isFinite(minValue) || minValue < 0)) || (maxValue !== undefined && (!Number.isFinite(maxValue) || maxValue < 0)) || (minValue !== undefined && maxValue !== undefined && minValue > maxValue)) {
      setError('تحقق من نطاق السعر قبل حفظ البحث.');
      return;
    }
    setBusy(true);
    setError('');
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
      setError(e instanceof Error ? e.message : 'تعذر حفظ البحث.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (id: string) => {
    Alert.alert('حذف البحث', 'هل تريد حذف عملية البحث المحفوظة؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: () => {
          if (!accessToken) return;
          void deleteSavedSearch(id, accessToken, csrfToken)
            .then(load)
            .catch((e) => setError(e instanceof Error ? e.message : 'تعذر الحذف.'));
        },
      },
    ]);
  };

  return (
    <PageShell title="عمليات البحث المحفوظة" scroll={false}>
      {!accessToken ? (
        <>
          <Notice>سجّل الدخول لحفظ عمليات البحث.</Notice>
          <PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} />
        </>
      ) : (
        <FlatList
          data={loading && items.length === 0 ? [] : items}
          keyExtractor={(item) => item.id}
          {...marketListPerf}
          contentContainerStyle={{ paddingBottom: 48, gap: spacing.md }}
          ListHeaderComponent={
            <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
              <SectionCard>
                <Text style={{ textAlign: 'right', fontWeight: '900', fontSize: 18, color: colors.ink }}>
                  حفظ بحث جديد
                </Text>
                <Field
                  label="اسم البحث"
                  value={label}
                  onChangeText={setLabel}
                  maxLength={100}
                  placeholder="مثال: هواتف بسعر مناسب"
                />
                <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                  {(
                    [
                      ['ads', 'الإعلانات'],
                      ['products', 'المنتجات'],
                      ['services', 'الخدمات'],
                    ] as const
                  ).map(([v, l]) => (
                    <Pressable
                      key={v}
                      onPress={() => setType(v)}
                      style={{
                        flex: 1,
                        minHeight: 44,
                        justifyContent: 'center',
                        padding: 10,
                        borderRadius: 12,
                        backgroundColor: type === v ? colors.brand : colors.surface,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <Text
                        style={{
                          textAlign: 'center',
                          color: type === v ? colors.white : colors.ink,
                          fontWeight: '700',
                        }}
                      >
                        {l}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Field label="كلمة البحث" value={q} onChangeText={setQ} placeholder="اختياري" />
                <Field label="المدينة" value={city} onChangeText={setCity} placeholder="للإعلانات فقط حاليًا" />
                <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Field label="أقل سعر" value={min} onChangeText={(v) => setMin(normalizeNumericInput(v))} keyboardType="numeric" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field label="أعلى سعر" value={max} onChangeText={(v) => setMax(normalizeNumericInput(v))} keyboardType="numeric" />
                  </View>
                </View>
                <PrimaryButton label="حفظ البحث" onPress={() => void save()} busy={busy} />
              </SectionCard>
              <Text style={{ textAlign: 'right', fontSize: 19, fontWeight: '900', color: colors.ink }}>
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
              <Text style={{ textAlign: 'right', fontWeight: '800', color: colors.ink }}>{i.label}</Text>
              <Text style={{ textAlign: 'right', color: colors.muted }}>
                {i.filters.type || 'ads'} · {i.filters.q || i.filters.city || 'فلاتر سعرية'}
              </Text>
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/search', params: { q: i.filters.q || '', categoryId: i.filters.categoryId || '', type: i.filters.type || 'ads', city: i.filters.city || '', minPrice: i.filters.minPrice == null ? '' : String(i.filters.minPrice), maxPrice: i.filters.maxPrice == null ? '' : String(i.filters.maxPrice) } })}>
                <Text style={{ textAlign: 'right', color: colors.brand, fontWeight: '800' }}>فتح نتائج البحث</Text>
              </Pressable>
              <Pressable onPress={() => remove(i.id)}>
                <Text style={{ textAlign: 'right', color: colors.danger, fontWeight: '800' }}>حذف البحث</Text>
              </Pressable>
            </SectionCard>
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        />
      )}
    </PageShell>
  );
}
