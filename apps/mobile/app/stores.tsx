import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { useCallback, useEffect, useRef, useState , useMemo} from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { marketListPerf } from '@/lib/listPerformance';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { fetchStores, type StoreSummary } from '@/features/commerce/commerce.api';
import {
  AppHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  PrimaryButton,
  SearchBar,
} from '@/components/MobileUI';
import { CatalogCard } from '@/components/MarketCards';
import { spacing, typography } from '@/theme/tokens';

export default function StoresScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);

  const [items, setItems] = useState<StoreSummary[]>([]);
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const requestSequence = useRef(0);

  const load = useCallback(
    async (refresh = false) => {
      const sequence = ++requestSequence.current;
      setLoadingMore(false);
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      setMoreError(null);
      try {
        const result = await fetchStores({ page: 1, limit: 30, search: submitted });
        if (sequence === requestSequence.current) {
          setItems(result.items);
          setPage(result.page);
          setTotalPages(result.totalPages);
        }
      } catch (e) {
        if (sequence === requestSequence.current) {
          setError(e instanceof Error ? e.message : 'تعذر تحميل المتاجر.');
        }
      } finally {
        if (sequence === requestSequence.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [submitted],
  );

  useEffect(() => {
    void load();
    return () => {
      requestSequence.current += 1;
    };
  }, [load]);

  const loadMore = async () => {
    if (loadingMore || loading || page >= totalPages) return;
    const sequence = requestSequence.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const result = await fetchStores({ page: page + 1, limit: 30, search: submitted });
      if (sequence === requestSequence.current) {
        setItems((current) => {
          const seen = new Set(current.map((item) => item.id));
          return [...current, ...result.items.filter((item) => !seen.has(item.id))];
        });
        setPage(result.page);
        setTotalPages(result.totalPages);
      }
    } catch (e) {
      if (sequence === requestSequence.current) {
        setMoreError(e instanceof Error ? e.message : 'تعذر تحميل المزيد من المتاجر.');
      }
    } finally {
      if (sequence === requestSequence.current) setLoadingMore(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader title="المتاجر" />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        {...marketListPerf}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.brand} />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.md }}>
            <Text style={styles.subtitle}>اكتشف المتاجر المحلية ومنتجاتها</Text>
            <SearchBar
              value={query}
              onChangeText={setQuery}
              onSubmit={() => setSubmitted(query.trim())}
              onClear={() => setSubmitted('')}
              placeholder="ابحث باسم المتجر أو المدينة…"
              accessibilityLabel="ابحث عن متجر"
            />
            {loading ? (
              <LoadingState message="جاري تحميل المتاجر…" />
            ) : error ? (
              <ErrorState title="تعذر تحميل المتاجر" description={error} onAction={() => void load()} />
            ) : (
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>متاجر متاحة</Text>
                <Text style={styles.count}>{items.length} نتيجة</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !loading && !error && items.length === 0 ? (
            <EmptyState title="لا توجد متاجر مطابقة" description="جرّب بحثًا آخر أو اسحب الشاشة للتحديث." />
          ) : undefined
        }
        renderItem={({ item: store }) => (
          <CatalogCard
            title={store.name}
            subtitle={store.description || 'متجر محلي على MarketPlat'}
            meta={`${store.city || 'الموقع غير محدد'}${
              typeof store._count?.products === 'number' ? ` · ${store._count.products} منتج` : ''
            }`}
            imageUri={store.logoUrl}
            glyph="▣"
            onPress={() => router.push(`/stores/${encodeURIComponent(store.id)}`)}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListFooterComponent={
          !loading && items.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              {moreError ? <ErrorState title="تعذر تحميل المزيد" description={moreError} onAction={() => void loadMore()} /> : null}
              {!moreError && page < totalPages ? (
                <PrimaryButton label={loadingMore ? 'جاري التحميل…' : 'تحميل المزيد'} onPress={() => void loadMore()} busy={loadingMore} variant="secondary" />
              ) : null}
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
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { ...typography.subtitle, color: colors.ink },
  count: { ...typography.caption, color: colors.muted },
  list: { gap: spacing.md },
});
