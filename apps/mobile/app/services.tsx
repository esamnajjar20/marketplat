import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { formatMoney } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { useState , useMemo} from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { marketListPerf } from '@/lib/listPerformance';
import { ScreenFrame } from '@/components/ui/ScreenFrame';

import { pushOnce } from '@/lib/navigation';
import { fetchServiceListingsPage, getCachedServiceListingsPage, type ServiceListing } from '@/features/services/services.api';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import {
  AppHeader,
  EmptyState,
  ErrorState,
  PrimaryButton,
  SkeletonList,
  SearchBar,
} from '@/components/MobileUI';
import { CatalogCard } from '@/components/MarketCards';
import { spacing, typography } from '@/theme/tokens';

function priceLabel(item: ServiceListing) {
  if (item.pricingType === 'NEGOTIABLE' || item.price == null) return 'السعر عند الاتفاق';
  const value = Number(item.price);
  return Number.isFinite(value)
    ? `${formatMoney(value)}${item.pricingType === 'STARTING_FROM' ? ' وما فوق' : ''}`
    : 'السعر عند الاتفاق';
}

export default function ServicesScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);

  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const list = usePaginatedList<ServiceListing>({
    key: `public-services:${submitted}`,
    pageSize: 30,
    fetchPage: async (page, signal) => {
      const result = await fetchServiceListingsPage({ page, limit: 30, search: submitted, signal });
      return { items: result.items, meta: { page: result.page, totalPages: result.totalPages, total: result.total } };
    },
    readCachedPage: async (page) => {
      const cached = await getCachedServiceListingsPage({ page, limit: 30, search: submitted });
      return cached ? { items: cached.items, meta: { page: cached.page, totalPages: cached.totalPages, total: cached.total } } : null;
    },
    getItemKey: (item) => item.id,
  });
  const items = list.items;

  return (
    <ScreenFrame>
      <AppHeader title="الخدمات" />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        {...marketListPerf}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} tintColor={colors.brand} />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.md }}>
            <Text style={styles.subtitle}>اعثر على مقدم الخدمة المناسب</Text>
            <SearchBar
              value={query}
              onChangeText={setQuery}
              onSubmit={() => setSubmitted(query.trim())}
              onClear={() => setSubmitted('')}
              placeholder="ابحث عن خدمة…"
              accessibilityLabel="ابحث عن خدمة"
            />
            {list.loading && items.length === 0 ? (
              <SkeletonList count={4} />
            ) : list.error && items.length === 0 ? (
              <ErrorState title="تعذر تحميل الخدمات" description={list.error} onAction={() => void list.retry()} />
            ) : (
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>خدمات متاحة</Text>
                <Text style={styles.count}>{items.length} نتيجة</Text>
              </View>
            )}
            {list.error && items.length > 0 ? <ErrorState title="تعذر تحديث الخدمات" description={list.error} onAction={() => void list.retry()} /> : null}
          </View>
        }
        ListEmptyComponent={
          !list.loading && !list.error && items.length === 0 ? (
            <EmptyState title="لا توجد خدمات مطابقة" description="جرّب كلمات بحث مختلفة أو اسحب للتحديث." />
          ) : undefined
        }
        renderItem={({ item }) => {
          const image = item.images?.find((uri) => typeof uri === 'string' && /^https?:\/\//i.test(uri));
          return (
            <CatalogCard
              title={item.title}
              subtitle={`${item.provider?.businessName || item.provider?.sellerProfile?.displayName || 'مقدم خدمة'}`}
              price={priceLabel(item)}
              meta={item.category?.nameAr || item.category?.name || undefined}
              imageUri={image}
              glyph="✦"
              onPress={() => pushOnce(`/services/${encodeURIComponent(item.id)}`)}
            />
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListFooterComponent={items.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            {list.loadMoreError ? <ErrorState title="تعذر تحميل المزيد" description={list.loadMoreError} onAction={() => void list.retry()} /> : null}
            {!list.loadMoreError && list.hasNextPage ? <PrimaryButton label={list.loadingMore ? 'جارٍ التحميل…' : 'تحميل المزيد'} onPress={() => void list.loadMore()} busy={list.loadingMore} variant="secondary" /> : null}
          </View>
        ) : undefined}
      />
    </ScreenFrame>
  );
}

const createThemeStyles = (colors: ColorPalette) => StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.x4l },
  subtitle: { ...typography.caption, color: colors.muted, textAlign: 'right' },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { ...typography.subtitle, color: colors.ink },
  count: { ...typography.caption, color: colors.muted },
});
