'use client';

import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchApi } from '@/api/search.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import {
  PROGRESSIVE_RADIUS_KM,
  MIN_RESULTS_ACCEPT,
  type ProgressiveRadiusKm,
} from '@/lib/progressiveRadius';
import type { SearchQuery, SearchType, SearchSort, SearchResult } from '@/types/search.types';

export interface SequentialGeoSearchArgs {
  enabled: boolean;
  lat?: number;
  lng?: number;
  type?: SearchType;
  q?: string;
  categoryId?: string;
  /** يُفرض sort=distance عند التفعيل */
  limit?: number;
  page?: number;
  minAccept?: number;
}

export interface SequentialGeoSearchResult {
  isLoading: boolean;
  isError: boolean;
  radiusKm: ProgressiveRadiusKm | null;
  items: SearchResult[];
  total?: number;
  /** انتهى التوسيع (وجد نتائج أو استنفد كل الأنصاف) */
  settled: boolean;
  refetch: () => void;
}

/**
 * توسيع متسلسل: يطلب نطاقًا واحدًا فقط، وإن قلّت النتائج ينتقل للتالي.
 * مناسب للشبكات الضعيفة (بدل 5 طلبات متوازية).
 */
export function useSequentialGeoSearch(
  args: SequentialGeoSearchArgs,
): SequentialGeoSearchResult {
  const {
    enabled,
    lat,
    lng,
    type = 'all',
    q,
    categoryId,
    limit = 12,
    page = 1,
    minAccept = MIN_RESULTS_ACCEPT,
  } = args;

  const canRun = Boolean(enabled && lat != null && lng != null);
  const [step, setStep] = useState(0);

  // إعادة من 1 كم عند تغيّر الإحداثيات/النوع
  useEffect(() => {
    setStep(0);
  }, [lat, lng, type, q, categoryId, enabled]);

  const radius = PROGRESSIVE_RADIUS_KM[
    Math.min(step, PROGRESSIVE_RADIUS_KM.length - 1)
  ]!;

  const params: SearchQuery = {
    type,
    q,
    categoryId,
    sort: 'distance' as SearchSort,
    lat: lat,
    lng: lng,
    radius,
    limit,
    page,
  };

  const query = useQuery({
    queryKey: queryKeys.search.unified(params),
    queryFn: () => searchApi.search(params).then((r) => r.data.data),
    enabled: canRun,
    staleTime: CACHE_TTL.search,
  });

  const count = query.data?.items?.length ?? 0;
  const hasEnough = count >= minAccept;
  const isLast = step >= PROGRESSIVE_RADIUS_KM.length - 1;

  // بعد نجاح الطلب: إن لم تكفِ النتائج وسّع خطوة واحدة
  useEffect(() => {
    if (!canRun || query.isLoading || query.isFetching || query.isError) return;
    if (hasEnough || isLast) return;
    setStep((s) => Math.min(s + 1, PROGRESSIVE_RADIUS_KM.length - 1));
  }, [
    canRun,
    query.isLoading,
    query.isFetching,
    query.isError,
    hasEnough,
    isLast,
    count,
    step,
  ]);

  return useMemo(() => {
    if (!canRun) {
      return {
        isLoading: false,
        isError: false,
        radiusKm: null,
        items: [],
        settled: true,
        refetch: () => {
          void query.refetch();
        },
      };
    }

    const settled = !query.isLoading && (hasEnough || isLast || query.isError);

    return {
      isLoading: query.isLoading || query.isFetching || (!settled && !hasEnough),
      isError: query.isError,
      radiusKm: settled && !query.isError ? radius : hasEnough ? radius : null,
      items: (query.data?.items ?? []) as SearchResult[],
      total: query.data?.meta?.total,
      settled: Boolean(settled),
      refetch: () => {
        void query.refetch();
      },
    };
  }, [
    canRun,
    query,
    hasEnough,
    isLast,
    radius,
  ]);
}
