import { useAppTheme } from '@/theme/ThemeProvider';
import { formatMoney } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback } from 'react';
import { RefreshControl, View } from 'react-native';
import { ListEmpty, ListStaleError, PaginatedFooter, PageShell, SectionCard } from '@/components/ui';
import { AppImage } from '@/components/AppImage';

import { pushOnce } from '@/lib/navigation';
import { fetchProducts, type ProductSummary } from '@/features/commerce/commerce.api';
import { fontSizes, spacing, fontWeights, radius } from '@/theme/tokens';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { AppFlashList } from '@/components/ui/AppFlashList';
import { ListGapMd } from '@/components/ui/ListSeparator';

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
    mapError: () => 'تعذر تحميل المنتجات المروّجة. حاول مرة أخرى.',
  });

  return (
    <PageShell title="العروض والمنتجات المروجة" scroll={false}>
      <AppFlashList ItemSeparatorComponent={ListGapMd}
        data={list.items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: spacing.x4l }}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} tintColor={colors.brand} />}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <Text style={{ textAlign: 'right', color: colors.muted, lineHeight: 21 }}>
              منتجات مرتبطة بعروض ترويجية نشطة أو مجدولة حسب بيانات الخادم.
            </Text>
            <ListStaleError list={list} />
          </View>
        }
        ListEmptyComponent={<ListEmpty list={list} loadingMessage="جاري تحميل المنتجات المروجة…" errorTitle="تعذر تحميل المنتجات المروجة" emptyTitle="لا توجد منتجات مروجة حاليًا" />}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => pushOnce(`/products/${encodeURIComponent(item.id)}`)}>
            <SectionCard>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
                {item.images?.[0] ? (
                  <AppImage variant="list" uri={item.images[0]} style={{ width: 92, height: 92, borderRadius: radius.button, backgroundColor: colors.border }} resizeMode="cover" />
                ) : (
                  <View style={{ width: 92, height: 92, borderRadius: radius.button, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: colors.brandOnSoft, fontSize: fontSizes[28] }}>◇</Text>
                  </View>
                )}
                <View style={{ flex: 1, alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.xs }}>
                  <Text tone="ink" strong size={15} numberOfLines={2}>{item.name}</Text>
                  <Text tone="muted" size={12}>{item.store?.name || 'متجر'}</Text>
                  <Text style={{ color: colors.brand, fontWeight: fontWeights.bold }}>{price(item)}</Text>
                  {(item.effectivePrice?.originalPrice != null || (item.discountPrice != null && Number(item.discountPrice) < Number(item.price))) ? <Text style={{ color: colors.muted, fontSize: fontSizes[12], textDecorationLine: 'line-through' }}>{formatMoney(Number(item.effectivePrice?.originalPrice ?? item.price))}</Text> : null}
                  {item.discountPrice != null && Number.isFinite(Number(item.discountPrice)) && Number.isFinite(Number(item.price)) && Number(item.price) > 0 ? <Text style={{ color: colors.brand, fontSize: fontSizes[12], fontWeight: fontWeights.bold }}>خصم {Math.round((1 - Number(item.discountPrice) / Number(item.price)) * 100)}%</Text> : null}
                  <Text style={{ color: colors.muted, fontSize: fontSizes[12] }}>{item.availability === 'OUT_OF_STOCK' ? 'غير متوفر' : 'عرض ترويجي'}</Text>
                </View>
              </View>
            </SectionCard>
          </Pressable>
        )}
        ListFooterComponent={<PaginatedFooter list={list} />}
      />
    </PageShell>
  );
}
