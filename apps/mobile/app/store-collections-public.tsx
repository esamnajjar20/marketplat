
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { RefreshControl, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { fetchPublicCollections, type StoreCollection } from '@/features/commerce/store-management.api';
import { ErrorState, Notice, PageShell, SectionCard } from '@/components/ui';
import { spacing, radius } from '@/theme/tokens';
import { AppImage } from '@/components/AppImage';
import { useAsyncResource } from '@/hooks/useAsyncResource';
import { AppFlashList } from '@/components/ui/AppFlashList';
import { ListGapMd } from '@/components/ui/ListSeparator';

export default function PublicStoreCollectionsScreen() {

  const p = useLocalSearchParams<{ storeId?: string | string[] }>();
  const storeId = Array.isArray(p.storeId) ? p.storeId[0] : p.storeId;
  const { data, loading, refreshing, error, reload } = useAsyncResource<StoreCollection[]>(
    (signal) => storeId ? fetchPublicCollections(storeId, signal) : Promise.reject(new Error('معرّف المتجر غير صالح.')),
    { key: `public-store-collections:${storeId ?? 'missing'}`, tag: 'public-store-collections' },
  );
  const { colors: refreshTheme } = useAppTheme();
  const items = data ?? [];

  return (
    <PageShell title="مجموعات المتجر" scroll={false}>
      <AppFlashList refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload({ soft: true })} tintColor={refreshTheme.brand} />}
        data={loading || error ? [] : items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: spacing.x4l }}
        ListHeaderComponent={
          <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
            {loading ? <Notice tone="muted">جارٍ تحميل المجموعات…</Notice> : null}
            {error ? <ErrorState title="تعذر تحميل المجموعات" description={error} onAction={() => void reload()} /> : null}
          </View>
        }
        ListEmptyComponent={!loading && !error ? <Notice tone="muted">لم ينشر المتجر مجموعات منتجات بعد.</Notice> : undefined}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => pushOnce({ pathname: '/collections/[id]', params: { id: item.id } })}>
            <SectionCard>
              {item.imageUrl ? <AppImage uri={item.imageUrl} style={{ width: '100%', height: 140, borderRadius: radius.control }} resizeMode="cover" /> : null}
              <Text tone="ink" strong size={17}>{item.name}</Text>
              <Text tone="muted">{item.description || 'مجموعة منتجات'} · {item._count?.products ?? 0} منتج</Text>
              <Text tone="brand" strong>عرض المنتجات ←</Text>
            </SectionCard>
          </Pressable>
        )}
        ItemSeparatorComponent={ListGapMd}
      />
    </PageShell>
  );
}
