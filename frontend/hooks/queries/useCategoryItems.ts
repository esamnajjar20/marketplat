'use client';

import { useCategories } from '@/hooks/queries/useCategories';
import { useProductCategories } from '@/hooks/queries/useProductCategories';
import { useServiceCategories } from '@/hooks/queries/useServiceCategories';
import { useHomepage } from '@/hooks/queries/useHomepage';
import { interleave, toCategoryItems, type Item } from '@/lib/categoryItems';

/**
 * كل فئات الجذر (إعلانات/منتجات/خدمات) بشكل موحّد، مرتّبة بالتناوب.
 *
 * تُقرأ من GET /home أولاً؛ ولا تُطلب القوائم الثلاث منفردة إلا إذا فشل
 * /home أو رجع أحد الأجزاء null. تُستخدم في صف الرئيسية وصفحة /categories.
 */
export function useCategoryItems(): { items: Item[]; byType: Record<Item['type'], Item[]>; isLoading: boolean } {
  const home = useHomepage();
  const fromHome = home.data?.categories;
  const homeSettled = home.isError || home.isSuccess;
  const needAds = home.isError || (home.isSuccess && (fromHome?.ads ?? null) === null);
  const needProducts = home.isError || (home.isSuccess && (fromHome?.products ?? null) === null);
  const needServices = home.isError || (home.isSuccess && (fromHome?.services ?? null) === null);

  const { data: adCats, isLoading: adLoading } = useCategories({ enabled: needAds });
  const { data: productCats, isLoading: productLoading } = useProductCategories({ enabled: needProducts });
  const { data: serviceCats, isLoading: serviceLoading } = useServiceCategories({ enabled: needServices });

  const isLoading =
    home.isPending ||
    (homeSettled &&
      ((needAds && adLoading) || (needProducts && productLoading) || (needServices && serviceLoading)));

  const ads = toCategoryItems('ad', fromHome?.ads ?? adCats);
  const products = toCategoryItems('product', fromHome?.products ?? productCats);
  const services = toCategoryItems('service', fromHome?.services ?? serviceCats);

  return {
    items: interleave(ads, products, services),
    byType: { ad: ads, product: products, service: services },
    isLoading,
  };
}
