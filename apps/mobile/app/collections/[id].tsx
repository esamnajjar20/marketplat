
import { usePullRefresh } from '@/hooks/usePullRefresh';
import { useAppTheme } from '@/theme/ThemeProvider';
import { formatMoney } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { RefreshControl, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { fetchPublicCollectionProducts } from '@/features/commerce/store-management.api';
import type { ProductSummary } from '@/features/commerce/commerce.api';
import { Notice, PageShell, SectionCard } from '@/components/ui';
import { spacing, radius } from '@/theme/tokens';
import { AppImage } from '@/components/AppImage';
import { AppFlashList } from '@/components/ui/AppFlashList';
import { ListGapMd } from '@/components/ui/ListSeparator';
import { useAsyncResource } from '@/hooks/useAsyncResource';

const EMPTY_PRODUCTS: ProductSummary[] = [];


export default function CollectionProductsScreen() {

  const p = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(p.id) ? p.id[0] : p.id;
  const resource = useAsyncResource<ProductSummary[]>(
    () => fetchPublicCollectionProducts(id as string),
    {
      key: id ?? '',
      manual: !id,
      tag: 'collection-products',
      mapError: (e) => (e instanceof Error && e.message ? e.message : 'تعذر تحميل المنتجات.'),
    },
  );
  const { loading, reload } = resource;
  const items = resource.data ?? EMPTY_PRODUCTS;
  const error = resource.error ?? '';
  const { colors: refreshTheme } = useAppTheme();
  // السحب للتحديث يبقي العناصر الحالية ظاهرة بدل تفريغ القائمة (soft reload).
  const { refreshing: pullRefreshing, onRefresh: onPullRefresh } = usePullRefresh(() => reload({ soft: true }));

  return (
    <PageShell title="منتجات المجموعة" scroll={false}>
      <AppFlashList refreshControl={<RefreshControl refreshing={pullRefreshing} onRefresh={() => void onPullRefresh()} tintColor={refreshTheme.brand} />}
        data={loading || error ? [] : items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: spacing.x4l }}
        ListHeaderComponent={
          <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
            {loading ? <Notice tone="muted">جارٍ تحميل المنتجات…</Notice> : null}
            {error ? <Notice>{error}</Notice> : null}
          </View>
        }
        ListEmptyComponent={
          !loading && !error ? <Notice tone="muted">لا توجد منتجات متاحة في هذه المجموعة.</Notice> : undefined
        }
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => pushOnce({ pathname: '/products/[id]', params: { id: item.id } })}>
            <SectionCard>
              {item.images?.[0] ? (
                <AppImage uri={item.images[0]} style={{ width: '100%', height: 160, borderRadius: radius.control }} resizeMode="cover" />
              ) : null}
              <Text tone="ink" strong size={16}>{item.name}</Text>
              <Text tone="brand" strong>
                {(() => { const value = Number(item.effectivePrice?.price ?? item.discountPrice ?? item.price); return Number.isFinite(value) ? formatMoney(value) : 'السعر غير متاح'; })()}
              </Text>
              <Text tone="muted">
                {item.availability === 'OUT_OF_STOCK' ? 'غير متوفر' : item.availability === 'LIMITED' ? 'كمية محدودة' : item.availability === 'IN_STOCK' ? 'متوفر' : 'حالة التوفر غير محددة'}
              </Text>
            </SectionCard>
          </Pressable>
        )}
        ItemSeparatorComponent={ListGapMd}
      />
    </PageShell>
  );
}
