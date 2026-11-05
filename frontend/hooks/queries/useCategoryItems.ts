'use client';

import { useCategories } from '@/hooks/queries/useCategories';
import { useProductCategories } from '@/hooks/queries/useProductCategories';
import { useServiceCategories } from '@/hooks/queries/useServiceCategories';
import { interleave, toCategoryItems, type Item } from '@/lib/categoryItems';

/**
 * كل فئات الجذر (إعلانات/منتجات/خدمات) بشكل موحّد، مرتّبة بالتناوب.
 *
 * تُقرأ أشجار الإعلانات والمنتجات والخدمات من hooks مستقلة بمفاتيحها
 * القياسية؛ صفحة /categories تهيّئ هذه المفاتيح خادمياً دون جلب حمولة /home.
 */
export function useCategoryItems(): { items: Item[]; byType: Record<Item['type'], Item[]>; isLoading: boolean } {
  // This directory needs only the three taxonomy trees. Depending on the
  // homepage aggregate here forced /categories to download unrelated feeds,
  // recommendations, counters and carousel payloads.
  const adsQuery = useCategories();
  const productsQuery = useProductCategories();
  const servicesQuery = useServiceCategories();

  const ads = toCategoryItems('ad', adsQuery.data);
  const products = toCategoryItems('product', productsQuery.data);
  const services = toCategoryItems('service', servicesQuery.data);
  const isLoading = adsQuery.isLoading || productsQuery.isLoading || servicesQuery.isLoading;

  return {
    items: interleave(ads, products, services),
    byType: { ad: ads, product: products, service: services },
    isLoading,
  };
}
