import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ErrorState, ListRow, LoadingState, PageShell, PrimaryButton, SectionHeader } from '@/components/ui';
import { fetchPublicCategories, flattenPublicCategories, type PublicCategory } from '@/features/categories/categories.api';

export default function CategoryDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [category, setCategory] = useState<PublicCategory | null>(null);
  const [children, setChildren] = useState<PublicCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const tree = await fetchPublicCategories();
      const all = flattenPublicCategories(tree);
      const found = all.find((x) => x.id === id || x.slug === id) || null;
      setCategory(found);
      const parent = found?.parentId ? all.find((x) => x.id === found.parentId) : null;
      const root = parent ? tree.find((x) => x.id === parent.id) : tree.find((x) => x.id === found?.id);
      setChildren(found ? (found.parentId ? [] : (root?.children ?? [])) : []);
      if (!found) setError('لم يتم العثور على هذا التصنيف أو أنه غير متاح.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل التصنيف.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

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
