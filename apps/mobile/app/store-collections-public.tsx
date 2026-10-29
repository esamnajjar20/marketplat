import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { fetchPublicCollections, type StoreCollection } from '@/features/commerce/store-management.api';
import { Notice, PageShell, SectionCard } from '@/components/MobileUI';
import { colors, spacing } from '@/theme/tokens';
import { marketListPerf } from '@/lib/listPerformance';
import { AppImage } from '@/components/AppImage';

export default function PublicStoreCollectionsScreen() {
  const p = useLocalSearchParams<{ storeId?: string | string[] }>();
  const storeId = Array.isArray(p.storeId) ? p.storeId[0] : p.storeId;
  const [items, setItems] = useState<StoreCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      setError('معرّف المتجر غير صالح.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      setItems(await fetchPublicCollections(storeId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل المجموعات.');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageShell title="مجموعات المتجر" scroll={false}>
      <FlatList
        data={loading || error ? [] : items}
        keyExtractor={(item) => item.id}
        {...marketListPerf}
        contentContainerStyle={{ paddingBottom: 48, gap: spacing.md }}
        ListHeaderComponent={
          <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
            {loading ? <Notice tone="muted">جارٍ تحميل المجموعات…</Notice> : null}
            {error ? <Notice>{error}</Notice> : null}
          </View>
        }
        ListEmptyComponent={!loading && !error ? <Notice tone="muted">لم ينشر المتجر مجموعات منتجات بعد.</Notice> : undefined}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push({ pathname: '/collections/[id]', params: { id: item.id } })}>
            <SectionCard>
              {item.imageUrl ? (
                <AppImage uri={item.imageUrl} style={{ width: '100%', height: 140, borderRadius: 12 }} resizeMode="cover" />
              ) : null}
              <Text style={{ textAlign: 'right', fontSize: 17, fontWeight: '900', color: colors.ink }}>{item.name}</Text>
              <Text style={{ textAlign: 'right', color: colors.muted }}>
                {item.description || 'مجموعة منتجات'} · {item._count?.products ?? 0} منتج
              </Text>
              <Text style={{ textAlign: 'right', color: colors.brand, fontWeight: '800' }}>عرض المنتجات ←</Text>
            </SectionCard>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
      />
    </PageShell>
  );
}
