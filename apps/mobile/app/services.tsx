import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { formatMoney } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { memo, useCallback, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { AppFlashList } from '@/components/ui/AppFlashList';
import { ListGapMd } from '@/components/ui/ListSeparator';
import { pickRemoteImageUri } from '@/lib/list-image';
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
} from '@/components/ui';
import { CatalogCard } from '@/components/MarketCards';
import { spacing, typography } from '@/theme/tokens';

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

  const openService = useCallback((id: string) => pushOnce(`/services/${encodeURIComponent(id)}`), []);
  const keyExtractor = useCallback((item: ServiceListing) => item.id, []);
  const renderItem = useCallback(
    ({ item }: { item: ServiceListing }) => <ServiceRow item={item} onOpen={openService} />,
    [openService],
  );

  return (
    <ScreenFrame>
      <AppHeader title="الخدمات" />
      <AppFlashList
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} tintColor={colors.brand} />
        }
        ListHeaderComponent={
          <View style={styles.listHeader}>
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
        ItemSeparatorComponent={ListGapMd}
        ListFooterComponent={items.length > 0 ? (
          <View style={styles.listFooter}>
            {list.loadMoreError ? <ErrorState title="تعذر تحميل المزيد" description={list.loadMoreError} onAction={() => void list.retry()} /> : null}
            {!list.loadMoreError && list.hasNextPage ? <PrimaryButton label={list.loadingMore ? 'جارٍ التحميل…' : 'تحميل المزيد'} onPress={() => void list.loadMore()} busy={list.loadingMore} variant="secondary" /> : null}
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
  subtitle: { ...typography.caption, color: colors.muted, textAlign: 'right' },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { ...typography.subtitle, color: colors.ink },
  count: { ...typography.caption, color: colors.muted },
});
