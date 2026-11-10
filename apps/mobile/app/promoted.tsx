import { useAppTheme } from '@/theme/ThemeProvider';
import { formatMoney } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { Spinner } from '@/components/ui';
import { marketListPerf } from '@/lib/listPerformance';
import { AppImage } from '@/components/AppImage';
import { router } from 'expo-router';
import { fetchProducts, type ProductSummary } from '@/features/commerce/commerce.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { fontSizes, spacing } from '@/theme/tokens';
import { usePaginatedList } from '@/hooks/usePaginatedList';

function price(p: ProductSummary): string {
  const value = Number(p.effectivePrice?.price ?? p.discountPrice ?? p.price);
  return Number.isFinite(value)
    ? formatMoney(value)
    : 'السعر عند التواصل';
}

export default function PromotedScreen() {
  const { colors } = useAppTheme();

  const fetchPage = useCallback(async (page: number, signal: AbortSignal) => {
    const result = await fetchProducts({
      page,
      limit: 24,
      hasPromotion: true,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      signal,
    });
    return { items: result.items, meta: { page: result.page, totalPages: result.totalPages, total: result.total } };
  }, []);
  const list = usePaginatedList<ProductSummary>({
    key: 'promoted-products',
    pageSize: 24,
    fetchPage,
    getItemKey: (item) => item.id,
    mapError: () => 'تعذر تحميل المنتجات المروّجة. حاول مجددًا.',
  });

  return (
    <PageShell title="العروض والمنتجات المروجة" scroll={false}>
      <FlatList
        data={list.items}
        keyExtractor={(item) => item.id}
        {...marketListPerf}
        contentContainerStyle={{ paddingBottom: spacing.x4l, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} tintColor={colors.brand} />}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <Text style={{ textAlign: 'right', color: colors.muted, lineHeight: 21 }}>
              منتجات مرتبطة بعروض ترويجية نشطة أو مجدولة حسب بيانات الخادم.
            </Text>
            {list.loading && list.items.length === 0 ? <Spinner color={colors.brand} /> : null}
            {list.error && list.items.length === 0 ? (
              <>
                <Notice>{list.error}</Notice>
                <PrimaryButton label="إعادة المحاولة" onPress={() => void list.refresh()} />
              </>
            ) : null}
            {list.error && list.items.length > 0 ? <Notice>{list.error}</Notice> : null}
          </View>
        }
        ListEmptyComponent={!list.loading && !list.error ? <Notice tone="muted">لا توجد منتجات مروجة حاليًا.</Notice> : undefined}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => router.push(`/products/${encodeURIComponent(item.id)}`)}>
            <SectionCard>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                {item.images?.[0] ? (
                  <AppImage uri={item.images[0]} style={{ width: 92, height: 92, borderRadius: 14, backgroundColor: colors.border }} resizeMode="cover" />
                ) : (
                  <View style={{ width: 92, height: 92, borderRadius: 14, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: colors.brandOnSoft, fontSize: fontSizes[28] }}>◇</Text>
                  </View>
                )}
                <View style={{ flex: 1, alignItems: 'flex-end', gap: 7, paddingVertical: 3 }}>
                  <Text tone="ink" strong size={15} numberOfLines={2}>{item.name}</Text>
                  <Text tone="muted" size={12}>{item.store?.name || 'متجر'}</Text>
                  <Text style={{ color: colors.brand, fontWeight: '700' }}>{price(item)}</Text>
                  {(item.effectivePrice?.originalPrice != null || (item.discountPrice != null && Number(item.discountPrice) < Number(item.price))) ? <Text style={{ color: colors.muted, fontSize: fontSizes[12], textDecorationLine: 'line-through' }}>{formatMoney(Number(item.effectivePrice?.originalPrice ?? item.price))}</Text> : null}
                  {item.discountPrice != null && Number.isFinite(Number(item.discountPrice)) && Number.isFinite(Number(item.price)) && Number(item.price) > 0 ? <Text style={{ color: colors.brand, fontSize: fontSizes[12], fontWeight: '700' }}>خصم {Math.round((1 - Number(item.discountPrice) / Number(item.price)) * 100)}%</Text> : null}
                  <Text style={{ color: colors.muted, fontSize: fontSizes[12] }}>{item.availability === 'OUT_OF_STOCK' ? 'غير متوفر' : 'عرض ترويجي'}</Text>
                </View>
              </View>
            </SectionCard>
          </Pressable>
        )}
        ListFooterComponent={
          <View style={{ gap: 10, marginTop: spacing.sm }}>
            {list.loadMoreError ? <Notice>{list.loadMoreError}</Notice> : null}
            {list.hasNextPage ? (
              <PrimaryButton
                label={list.loadingMore ? 'جارٍ تحميل المزيد…' : list.loadMoreError ? 'إعادة المحاولة' : 'تحميل المزيد'}
                variant="secondary"
                busy={list.loadingMore}
                onPress={() => void list.loadMore()}
              />
            ) : null}
          </View>
        }
      />
    </PageShell>
  );
}
