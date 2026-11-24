import { useMemo } from 'react';
import { View } from 'react-native';
import { pushOnce } from '@/lib/navigation';
import { fetchPublicCategories, type PublicCategory } from '@/features/categories/categories.api';
import { fetchProductCategories, type ProductCategory } from '@/features/commerce/commerce.api';
import { fetchServiceCategoryOptions, type ServiceCategoryOption } from '@/features/services/services.api';
import { EmptyState, ErrorState, ListRow, LoadingState, Notice, PageShell, SectionHeader } from '@/components/ui';
import { spacing } from '@/theme/tokens';
import { useAsyncResource } from '@/hooks/useAsyncResource';

type MarketCategoryCatalog = {
  ads: PublicCategory[];
  products: ProductCategory[];
  services: ServiceCategoryOption[];
  unavailable: string[];
};

export default function CategoriesScreen() {
  const resource = useAsyncResource<MarketCategoryCatalog>(async () => {
    const [adsResult, productsResult, servicesResult] = await Promise.allSettled([
      fetchPublicCategories(),
      fetchProductCategories(),
      fetchServiceCategoryOptions(),
    ]);

    const unavailable = [
      adsResult.status === 'rejected' ? 'الإعلانات' : null,
      productsResult.status === 'rejected' ? 'المنتجات' : null,
      servicesResult.status === 'rejected' ? 'الخدمات' : null,
    ].filter((value): value is string => Boolean(value));

    if (unavailable.length === 3) {
      throw new Error('تعذر تحميل تصنيفات السوق. تحقق من الاتصال ثم حاول مرة أخرى.');
    }

    return {
      ads: adsResult.status === 'fulfilled' ? adsResult.value : [],
      products: productsResult.status === 'fulfilled' ? adsafeProducts(productsResult.value) : [],
      services: servicesResult.status === 'fulfilled' ? servicesResult.value : [],
      unavailable,
    };
  }, {
    key: 'public-market-category-catalog-v2',
    tag: 'public-category-catalog',
    mapError: (error) => error instanceof Error && error.message ? error.message : 'تعذر تحميل تصنيفات السوق.',
  });

  const { data, loading, error, reload } = resource;
  const ads = data?.ads ?? [];
  const products = data?.products ?? [];
  const services = data?.services ?? [];
  const hasCategories = ads.length + products.length + services.length > 0;

  const productItems = useMemo(() => products, [products]);
  const serviceItems = useMemo(() => services, [services]);

  return (
    <PageShell title="تصنيفات السوق">
      {loading && !data ? <LoadingState message="جاري تحميل تصنيفات السوق…" /> : null}
      {error && !data ? <ErrorState title="تعذر تحميل التصنيفات" description={error} onAction={() => void reload()} /> : null}
      {data?.unavailable.length ? (
        <Notice tone="warning">تعذر تحميل تصنيفات {data.unavailable.join(' و')}؛ يمكنك تصفح الأقسام المتاحة وإعادة المحاولة لاحقًا.</Notice>
      ) : null}
      {data && !hasCategories ? (
        <EmptyState title="لا توجد تصنيفات نشطة" description="ستظهر تصنيفات الإعلانات والمنتجات والخدمات هنا عند توفرها." />
      ) : null}

      {ads.length ? (
        <View style={{ gap: spacing.sm }}>
          <SectionHeader title="تصنيفات الإعلانات" subtitle="تصفح الإعلانات حسب القسم والتصنيف الفرعي." actionLabel="عرض الكل" onAction={() => pushOnce('/ads')} />
          {ads.map((category) => (
            <ListRow
              key={`ad-${category.id}`}
              title={category.nameAr || category.name}
              description={category.children?.length ? `${category.children.length} تصنيف فرعي` : 'تصفح إعلانات هذا التصنيف'}
              onPress={() => pushOnce({ pathname: '/categories/[id]', params: { id: category.id } })}
            />
          ))}
        </View>
      ) : null}

      {productItems.length ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          <SectionHeader title="تصنيفات المنتجات" subtitle="اكتشف المنتجات المعروضة في المتاجر." actionLabel="عرض الكل" onAction={() => pushOnce('/products')} />
          {productItems.map((category) => (
            <ListRow
              key={`product-${category.id}`}
              title={category.nameAr || category.name}
              description={category.parentId ? 'تصنيف فرعي للمنتجات' : category.children?.length ? `${category.children.length} تصنيف فرعي` : 'تصفح منتجات هذا التصنيف'}
              onPress={() => pushOnce({ pathname: '/products', params: { categoryId: category.id } })}
            />
          ))}
        </View>
      ) : null}

      {serviceItems.length ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          <SectionHeader title="تصنيفات الخدمات" subtitle="اعثر على الخدمات ومقدميها حسب التخصص." actionLabel="عرض الكل" onAction={() => pushOnce('/services')} />
          {serviceItems.map((category) => (
            <ListRow
              key={`service-${category.id}`}
              title={category.nameAr || category.name}
              description={category.parentId ? 'تصنيف فرعي للخدمات' : 'تصفح الخدمات ضمن هذا التخصص'}
              onPress={() => pushOnce({ pathname: '/services', params: { categoryId: category.id } })}
            />
          ))}
        </View>
      ) : null}
    </PageShell>
  );
}

function adsafeProducts(items: ProductCategory[]): ProductCategory[] {
  return items.filter((item) => item && typeof item.id === 'string' && item.isActive !== false);
}
