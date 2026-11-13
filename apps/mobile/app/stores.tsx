import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { memo, useCallback, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { AppFlashList } from '@/components/ui/AppFlashList';
import { ListGapMd } from '@/components/ui/ListSeparator';
import { ScreenFrame } from '@/components/ui/ScreenFrame';

import { pushOnce } from '@/lib/navigation';
import { fetchStores, type StoreSummary } from '@/features/commerce/commerce.api';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { toPaginatedResponse } from '@/lib/pagination';
import {
  AppHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  PrimaryButton,
  SearchBar,
} from '@/components/ui';
import { CatalogCard } from '@/components/MarketCards';
import { spacing, typography } from '@/theme/tokens';

/** صف متجر — memo: يعتمد على id + دالة فتح ثابتة. */
const StoreRow = memo(function StoreRow({ store, onOpen }: { store: StoreSummary; onOpen: (id: string) => void }) {
  return (
    <CatalogCard
      id={store.id}
      title={store.name}
      subtitle={store.description || 'متجر محلي على MarketPlat'}
      meta={`${store.city || 'الموقع غير محدد'}${
        typeof store._count?.products === 'number' ? ` · ${store._count.products} منتج` : ''
      }`}
      imageUri={store.logoUrl}
      glyph="▣"
      onPressItem={onOpen}
    />
  );
});

export default function StoresScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);

  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const list = usePaginatedList<StoreSummary>({
    key: `public-stores:${submitted}`,
    pageSize: 30,
    fetchPage: async (page) => toPaginatedResponse(await fetchStores({ page, limit: 30, search: submitted })),
    getItemKey: (item) => item.id,
    mapError: (e) => (e instanceof Error && e.message ? e.message : 'تعذر تحميل المتاجر.'),
  });
  const { items, loading, refreshing, loadingMore, error, loadMoreError, hasNextPage } = list;
  const { refresh, retry, loadMore } = list;
  const onRefresh = useCallback(() => { void refresh(); }, [refresh]);
  const onRetry = useCallback(() => { void retry(); }, [retry]);
  const onLoadMore = useCallback(() => { void loadMore(); }, [loadMore]);

  const openStore = useCallback((id: string) => pushOnce(`/stores/${encodeURIComponent(id)}`), []);
  const keyExtractor = useCallback((item: StoreSummary) => item.id, []);
  const renderItem = useCallback(
    ({ item }: { item: StoreSummary }) => <StoreRow store={item} onOpen={openStore} />,
    [openStore],
  );

  return (
    <ScreenFrame>
      <AppHeader title="المتاجر" />
      <AppFlashList
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
        }
        ListHeaderComponent={
          <View style={styles.listHeader}>
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
              <ErrorState title="تعذر تحميل المتاجر" description={error} onAction={onRetry} />
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
        ItemSeparatorComponent={ListGapMd}
        ListFooterComponent={
          !loading && items.length > 0 ? (
            <View style={styles.listFooter}>
              {loadMoreError ? <ErrorState title="تعذر تحميل المزيد" description={loadMoreError} onAction={onRetry} /> : null}
              {!loadMoreError && hasNextPage ? (
                <PrimaryButton label={loadingMore ? 'جاري التحميل…' : 'تحميل المزيد'} onPress={onLoadMore} busy={loadingMore} variant="secondary" />
              ) : null}
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
  subtitle: { ...typography.caption, color: colors.muted, textAlign: 'right' },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { ...typography.subtitle, color: colors.ink },
  count: { ...typography.caption, color: colors.muted },
});
