/**
 * غلاف اختياري فوق useHomeAds عند تثبيت @tanstack/react-query.
 * بدون الحزمة: يُعيد نفس سلوك useHomeAds.
 *
 * التثبيت: npx expo install @tanstack/react-query
 */
import { useHomeAds, type HomeAdFilters, type HomeAdSort, homeAdsQueryKey } from './useHomeAds';

type Options = {
  search: string;
  filters: HomeAdFilters;
  sort: HomeAdSort;
};

/**
 * حالياً يفوّض إلى useHomeAds.
 * بعد تثبيت TanStack يمكن استبدال الجسم بـ useInfiniteQuery مع نفس queryKey.
 */
export function useHomeAdsQuery(options: Options) {
  const result = useHomeAds(options);
  return {
    ...result,
    queryKey: homeAdsQueryKey(options),
  };
}

export { homeAdsQueryKey };
