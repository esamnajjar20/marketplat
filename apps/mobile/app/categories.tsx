import { BrandRefreshControl } from '@/components/ui/BrandRefreshControl';

import { pushOnce } from '@/lib/navigation';
import { fetchPublicCategories, type PublicCategory } from '@/features/categories/categories.api';
import { EmptyState, ErrorState, ListRow, LoadingState, PageShell } from '@/components/ui';
import { spacing } from '@/theme/tokens';
import { useAsyncResource } from '@/hooks/useAsyncResource';
import { AppFlashList } from '@/components/ui/AppFlashList';
import { ListGapSm } from '@/components/ui/ListSeparator';

export default function CategoriesScreen() {
  const { data, loading, refreshing, error, reload } = useAsyncResource<PublicCategory[]>(
    () => fetchPublicCategories(),
    { key: 'public-market-categories', tag: 'public-categories' },
  );
  const items = data ?? [];

  return (
    <PageShell title="تصنيفات السوق" scroll={false}>
      {loading ? <LoadingState message="جاري تحميل التصنيفات…" /> : error ? (
        <ErrorState title="تعذر تحميل التصنيفات" description={error} onAction={() => void reload()} />
      ) : (
        <AppFlashList refreshControl={<BrandRefreshControl refreshing={refreshing} onRefresh={() => void reload({ soft: true })} />}
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          ListEmptyComponent={<EmptyState title="لا توجد تصنيفات نشطة" />}
          renderItem={({ item: category }) => (
            <ListRow
              title={category.nameAr || category.name}
              description={category.children?.length ? `${category.children.length} تصنيف فرعي` : undefined}
              onPress={() => pushOnce({ pathname: '/categories/[id]', params: { id: category.id } })}
            />
          )}
          ItemSeparatorComponent={ListGapSm}
        />
      )}
    </PageShell>
  );
}
