import { router, useLocalSearchParams } from 'expo-router';
import { ErrorState, ListRow, LoadingState, PageShell, PrimaryButton, SectionHeader } from '@/components/ui';
import { fetchPublicCategories, flattenPublicCategories, type PublicCategory } from '@/features/categories/categories.api';
import { useAsyncResource } from '@/hooks/useAsyncResource';

type CategoryDetail = { category: PublicCategory; children: PublicCategory[] };
const EMPTY_CHILDREN: PublicCategory[] = [];

export default function CategoryDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const resource = useAsyncResource<CategoryDetail>(
    async () => {
      const tree = await fetchPublicCategories();
      const all = flattenPublicCategories(tree);
      const found = all.find((x) => x.id === id || x.slug === id) || null;
      if (!found) throw new Error('لم يتم العثور على هذا التصنيف أو أنه غير متاح.');
      const parent = found.parentId ? all.find((x) => x.id === found.parentId) : null;
      const root = parent ? tree.find((x) => x.id === parent.id) : tree.find((x) => x.id === found.id);
      return { category: found, children: found.parentId ? EMPTY_CHILDREN : (root?.children ?? EMPTY_CHILDREN) };
    },
    {
      key: id ?? '',
      tag: 'category-detail',
      mapError: (e) => (e instanceof Error && e.message ? e.message : 'تعذر تحميل التصنيف.'),
    },
  );
  const { loading, reload: load } = resource;
  const category = resource.data?.category ?? null;
  const children = resource.data?.children ?? EMPTY_CHILDREN;
  const error = resource.error ?? '';

  const name = category ? category.nameAr || category.name : 'التصنيف';

  return (
    <PageShell title={name}>
      {loading ? (
        <LoadingState message="جاري تحميل التصنيف…" />
      ) : error || !category ? (
        <ErrorState description={error || undefined} onAction={() => void load()} />
      ) : (
        <>
          <SectionHeader title={name} subtitle="تصفح الإعلانات ضمن هذا التصنيف أو انتقل إلى التصنيفات الفرعية." />
          <PrimaryButton
            label="عرض إعلانات التصنيف"
            onPress={() => router.push({ pathname: '/search', params: { categoryId: category.id } })}
          />
          <PrimaryButton
            variant="secondary"
            label="البحث عن محتوى مشابه"
            onPress={() => router.push({ pathname: '/search', params: { q: name } })}
          />
          {children.map((child) => (
            <ListRow
              key={child.id}
              title={child.nameAr || child.name}
              onPress={() => router.push({ pathname: '/categories/[id]', params: { id: child.id } })}
            />
          ))}
        </>
      )}
    </PageShell>
  );
}
