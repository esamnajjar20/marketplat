import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { fetchServiceProviders, type ProviderSummary } from '@/features/services/providers.api';
import { Field, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { colors, spacing } from '@/theme/tokens';
import { marketListPerf } from '@/lib/listPerformance';

export default function ServiceProvidersScreen() {
  const [items, setItems] = useState<ProviderSummary[]>([]);
  const [city, setCity] = useState('');
  const [appliedCity, setAppliedCity] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const sequence = useRef(0);

  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    setLoadingMore(false);
    setError('');
    try {
      const result = await fetchServiceProviders({ city: appliedCity, page: 1, limit: 30 });
      if (current !== sequence.current) return;
      setItems(result.items);
      setPage(result.page);
      setTotalPages(result.totalPages);
    } catch (e) {
      if (current === sequence.current) setError(e instanceof Error ? e.message : 'تعذر تحميل مقدمي الخدمات.');
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [appliedCity]);

  useEffect(() => {
    void load();
    return () => {
      sequence.current += 1;
    };
  }, [load]);

  const loadMore = async () => {
    if (loading || loadingMore || page >= totalPages) return;
    const current = sequence.current;
    setLoadingMore(true);
    setError('');
    try {
      const result = await fetchServiceProviders({ city: appliedCity, page: page + 1, limit: 30 });
      if (current !== sequence.current) return;
      setItems((old) => {
        const ids = new Set(old.map((x) => x.id));
        return [...old, ...result.items.filter((x) => !ids.has(x.id))];
      });
      setPage(result.page);
      setTotalPages(result.totalPages);
    } catch (e) {
      if (current === sequence.current) setError(e instanceof Error ? e.message : 'تعذر تحميل المزيد من مقدمي الخدمات.');
    } finally {
      if (current === sequence.current) setLoadingMore(false);
    }
  };

  return (
    <PageShell title="مقدمو الخدمات" scroll={false}>
      <FlatList
        data={loading && items.length === 0 ? [] : items}
        keyExtractor={(item) => item.id}
        {...marketListPerf}
        contentContainerStyle={{ paddingBottom: 48, gap: spacing.md }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <Field label="تصفية حسب المدينة" value={city} onChangeText={setCity} placeholder="اسم المدينة" />
            <PrimaryButton label="تطبيق الفلتر" onPress={() => setAppliedCity(city.trim())} />
            {loading && items.length === 0 ? <ActivityIndicator color={colors.brand} /> : null}
            {error && items.length === 0 ? (
              <>
                <Notice>{error}</Notice>
                <PrimaryButton label="إعادة المحاولة" variant="secondary" onPress={() => void load()} />
              </>
            ) : null}
            {!loading && items.length > 0 ? (
              <Text style={{ textAlign: 'right', color: colors.muted }}>{items.length} مقدم خدمة معروض</Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !loading && !error ? <Notice tone="muted">لا توجد ملفات مقدمي خدمات مطابقة.</Notice> : null
        }
        renderItem={({ item: p }) => (
          <Pressable onPress={() => router.push({ pathname: '/service-providers/[id]', params: { id: p.id } })}>
            <SectionCard>
              <Text style={{ textAlign: 'right', fontSize: 18, fontWeight: '900', color: colors.ink }}>
                {p.businessName || p.sellerProfile?.displayName || 'مقدم خدمة'}
              </Text>
              <Text style={{ textAlign: 'right', color: colors.muted, lineHeight: 21 }} numberOfLines={3}>
                {p.description || 'لا يوجد وصف.'}
              </Text>
              <Text style={{ textAlign: 'right', color: colors.brand, fontWeight: '700' }}>
                ★ {p.sellerProfile?.averageRating ?? '—'} · {p.sellerProfile?.totalRatings ?? 0} تقييم
              </Text>
              <Text style={{ textAlign: 'right', color: colors.muted, fontSize: 13 }}>
                مناطق الخدمة: {p.serviceAreaCities?.join('، ') || 'غير محددة'}
              </Text>
              <Text style={{ textAlign: 'right', color: colors.brand, fontWeight: '800' }}>عرض الملف والخدمات ←</Text>
            </SectionCard>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListFooterComponent={
          <View style={{ gap: spacing.sm }}>
            {error && items.length > 0 ? <Notice>{error}</Notice> : null}
            {page < totalPages ? (
              <PrimaryButton
                label={loadingMore ? 'جارٍ تحميل المزيد…' : 'تحميل المزيد'}
                variant="secondary"
                busy={loadingMore}
                onPress={() => void loadMore()}
              />
            ) : null}
          </View>
        }
      />
    </PageShell>
  );
}
