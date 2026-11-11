
import { usePullRefresh } from '@/hooks/usePullRefresh';
import { useAppTheme } from '@/theme/ThemeProvider';
import { formatMoney } from '@/lib/formatters';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { fetchPublicCollectionProducts } from '@/features/commerce/store-management.api';
import type { ProductSummary } from '@/features/commerce/commerce.api';
import { Notice, PageShell, SectionCard } from '@/components/ui';
import { spacing, radius } from '@/theme/tokens';
import { marketListPerf } from '@/lib/listPerformance';
import { AppImage } from '@/components/AppImage';


export default function CollectionProductsScreen() {

  const p = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(p.id) ? p.id[0] : p.id;
  const [items, setItems] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      setItems(await fetchPublicCollectionProducts(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل المنتجات.');
    } finally {
      setLoading(false);
    }
  }, [id]);
  const { colors: refreshTheme } = useAppTheme();
  const { refreshing: pullRefreshing, onRefresh: onPullRefresh } = usePullRefresh(() => load());

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageShell title="منتجات المجموعة" scroll={false}>
      <FlatList refreshControl={<RefreshControl refreshing={pullRefreshing} onRefresh={() => void onPullRefresh()} tintColor={refreshTheme.brand} />}
        data={loading || error ? [] : items}
        keyExtractor={(item) => item.id}
        {...marketListPerf}
        contentContainerStyle={{ paddingBottom: spacing.x4l, gap: spacing.md }}
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
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
      />
    </PageShell>
  );
}
