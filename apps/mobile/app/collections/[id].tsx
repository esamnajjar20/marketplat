import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { fetchPublicCollectionProducts } from '@/features/commerce/store-management.api';
import type { ProductSummary } from '@/features/commerce/commerce.api';
import { Notice, PageShell, SectionCard } from '@/components/MobileUI';
import { colors, spacing } from '@/theme/tokens';
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

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageShell title="منتجات المجموعة" scroll={false}>
      <FlatList
        data={loading || error ? [] : items}
        keyExtractor={(item) => item.id}
        {...marketListPerf}
        contentContainerStyle={{ paddingBottom: 48, gap: spacing.md }}
        ListHeaderComponent={
          <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
            {loading ? <Notice tone="muted">جارٍ تحميل المنتجات…</Notice> : null}
            {error ? <Notice>{error}</Notice> : null}
          </View>
        }
        ListEmptyComponent={
          !loading && !error ? <Notice tone="muted">لا توجد منتجات متاحة في هذه المجموعة.</Notice> : null
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push({ pathname: '/products/[id]', params: { id: item.id } })}>
            <SectionCard>
              {item.images?.[0] ? (
                <AppImage uri={item.images[0]} style={{ width: '100%', height: 160, borderRadius: 12 }} resizeMode="cover" />
              ) : null}
              <Text style={{ textAlign: 'right', fontSize: 16, fontWeight: '900', color: colors.ink }}>{item.name}</Text>
              <Text style={{ textAlign: 'right', color: colors.brand, fontWeight: '900' }}>
                {item.effectivePrice?.price ?? item.discountPrice ?? item.price} ₪
              </Text>
              <Text style={{ textAlign: 'right', color: colors.muted }}>
                {item.availability === 'OUT_OF_STOCK' ? 'غير متوفر' : 'متوفر حسب المخزون'}
              </Text>
            </SectionCard>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
      />
    </PageShell>
  );
}
