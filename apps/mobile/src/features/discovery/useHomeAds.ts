/**
 * تحميل إعلانات الصفحة الرئيسية مع كاش محلي و pagination.
 * المرحلة 5: logger + queryKeys + error-reporting.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/api/client';
import {
  AdListItem,
  fetchPublicAds,
  getCachedPublicAdsWithMetadata,
} from '@/features/ads/ads.api';
import { queryKeys } from '@/lib/queryKeys';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/error-reporting';

export type HomeAdFilters = {
  city?: string;
  minPrice?: number;
  maxPrice?: number;
};

export type HomeAdSort = {
  sortBy: 'createdAt' | 'price' | 'views';
  sortOrder: 'asc' | 'desc';
};

type Options = {
  search: string;
  filters: HomeAdFilters;
  sort: HomeAdSort;
};

export function homeAdsQueryKey(options: Options) {
  return queryKeys.home.ads({
    search: options.search,
    city: options.filters.city,
    minPrice: options.filters.minPrice,
    maxPrice: options.filters.maxPrice,
    sortBy: options.sort.sortBy,
    sortOrder: options.sort.sortOrder,
  });
}

export function useHomeAds({ search, filters, sort }: Options) {
  const [ads, setAds] = useState<AdListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [adsSavedAt, setAdsSavedAt] = useState<number | null>(null);
  const [adsFromCache, setAdsFromCache] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failedImageIds, setFailedImageIds] = useState<string[]>([]);
  const sequenceRef = useRef(0);
  const loadingMoreRef = useRef(false);

  const buildOptions = useCallback(
    (pageNum: number) => ({
      page: pageNum,
      limit: 8,
      search,
      categoryId: undefined as string | undefined,
      city: filters.city,
      minPrice: filters.minPrice,
      maxPrice: filters.maxPrice,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
    }),
    [search, filters, sort],
  );

  const loadAds = useCallback(
    async (isRefresh = false) => {
      const requestSequence = ++sequenceRef.current;
      const isCurrent = () => requestSequence === sequenceRef.current;
      if (isRefresh) setRefreshing(true);
      setErrorMessage(null);
      setLoadingMore(false);
      setPage(1);
      setTotalPages(1);
      const options = buildOptions(1);
      let hasCachedData = false;
      try {
        const cached = await getCachedPublicAdsWithMetadata(options);
        if (!isCurrent()) return;
        if (cached) {
          hasCachedData = true;
          setAds(cached.result.items);
          setPage(cached.result.page || 1);
          setTotalPages(
            cached.result.totalPages ?? (cached.result.items.length >= options.limit ? 2 : 1),
          );
          setAdsSavedAt(cached.savedAt);
          setAdsFromCache(true);
          setLoading(false);
        }
      } catch {
        /* cache optional */
      }
      if (!hasCachedData && !isRefresh) setLoading(true);
      try {
        const result = await fetchPublicAds(options);
        if (!isCurrent()) return;
        setAds(result.items);
        setFailedImageIds([]);
        setPage(result.page || 1);
        setTotalPages(
          result.totalPages ??
            (result.items.length >= options.limit ? (result.page || 1) + 1 : result.page || 1),
        );
        setAdsFromCache(false);
        const latestCache = await getCachedPublicAdsWithMetadata(options);
        if (!isCurrent()) return;
        if (latestCache) setAdsSavedAt(latestCache.savedAt);
      } catch (error) {
        if (!isCurrent()) return;
        if (!hasCachedData) {
          const message =
            error instanceof ApiError || error instanceof Error
              ? error.message
              : 'تعذر تحميل الإعلانات. حاول مرة أخرى.';
          setErrorMessage(message);
          logger.warn('home-ads', message);
          captureException(error, { scope: 'useHomeAds' });
        }
      } finally {
        if (isCurrent()) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [buildOptions],
  );

  const loadMoreAds = useCallback(async () => {
    if (loadingMoreRef.current || loading || refreshing || page >= totalPages) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const requestSequence = sequenceRef.current;
    const nextPage = page + 1;
    try {
      const result = await fetchPublicAds(buildOptions(nextPage));
      if (requestSequence !== sequenceRef.current) return;
      setAds((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        return [...prev, ...result.items.filter((item) => !seen.has(item.id))];
      });
      setPage(result.page || nextPage);
      setTotalPages(result.totalPages ?? totalPages);
    } catch (error) {
      logger.warn('home-ads', 'loadMore failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [buildOptions, loading, refreshing, page, totalPages]);

  useEffect(() => {
    void loadAds();
  }, [loadAds]);

  const markImageFailed = useCallback((id: string) => {
    setFailedImageIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  return {
    ads,
    loading,
    refreshing,
    errorMessage,
    adsSavedAt,
    adsFromCache,
    page,
    totalPages,
    loadingMore,
    failedImageIds,
    loadAds,
    loadMoreAds,
    markImageFailed,
    setErrorMessage,
    queryKey: homeAdsQueryKey({ search, filters, sort }),
  };
}
