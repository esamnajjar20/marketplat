import { useCallback, useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { fetchPublicCategories, type PublicCategory } from '@/features/categories/categories.api';
import {
  EmptyState,
  ErrorState,
  ListRow,
  LoadingState,
  PageShell,
} from '@/components/MobileUI';
import { marketListPerf } from '@/lib/listPerformance';
import { spacing } from '@/theme/tokens';

export default function CategoriesScreen() {
  const [items, setItems] = useState<PublicCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await fetchPublicCategories());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل التصنيفات.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageShell title="تصنيفات السوق" scroll={false}>
      {loading ? (
        <LoadingState message="جاري تحميل التصنيفات…" />
      ) : error ? (
        <ErrorState title="تعذر تحميل التصنيفات" description={error} onAction={() => void load()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          {...marketListPerf}
          contentContainerStyle={{ paddingBottom: 32 }}
          ListEmptyComponent={<EmptyState title="لا توجد تصنيفات نشطة" />}
          renderItem={({ item: category }) => (
            <ListRow
              title={category.nameAr || category.name}
              description={
                category.children?.length ? `${category.children.length} تصنيف فرعي` : undefined
              }
              onPress={() =>
                router.push(`/categories/${encodeURIComponent(category.id)}` as never)
              }
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}
    </PageShell>
  );
}
