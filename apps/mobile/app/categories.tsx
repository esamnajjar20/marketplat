import { useAppTheme } from '@/theme/ThemeProvider';
import { FlatList, RefreshControl, View } from 'react-native';

import { pushOnce } from '@/lib/navigation';
import { fetchPublicCategories, type PublicCategory } from '@/features/categories/categories.api';
import { EmptyState, ErrorState, ListRow, LoadingState, PageShell } from '@/components/ui';
import { marketListPerf } from '@/lib/listPerformance';
import { spacing } from '@/theme/tokens';
import { useAsyncResource } from '@/hooks/useAsyncResource';

export default function CategoriesScreen() {
  const { data, loading, refreshing, error, reload } = useAsyncResource<PublicCategory[]>(
    () => fetchPublicCategories(),
    { key: 'public-market-categories', tag: 'public-categories' },
  );
  const { colors: refreshTheme } = useAppTheme();
  const items = data ?? [];

  return (
    <PageShell title="تصنيفات السوق" scroll={false}>
      {loading ? <LoadingState message="جاري تحميل التصنيفات…" /> : error ? (
        <ErrorState title="تعذر تحميل التصنيفات" description={error} onAction={() => void reload()} />
      ) : (
        <FlatList refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload({ soft: true })} tintColor={refreshTheme.brand} />}
          data={items}
          keyExtractor={(item) => item.id}
          {...marketListPerf}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          ListEmptyComponent={<EmptyState title="لا توجد تصنيفات نشطة" />}
          renderItem={({ item: category }) => (
            <ListRow
              title={category.nameAr || category.name}
              description={category.children?.length ? `${category.children.length} تصنيف فرعي` : undefined}
              onPress={() => pushOnce({ pathname: '/categories/[id]', params: { id: category.id } })}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}
    </PageShell>
  );
}
