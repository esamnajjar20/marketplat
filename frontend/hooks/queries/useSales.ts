'use client';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { salesApi } from '@/api/sales.api';
import { queryKeys } from '@/lib/queryKeys';

export function useSales(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.sales.list(params),
    queryFn: () => salesApi.list(params).then((r) => r.data.data),
    placeholderData: keepPreviousData,
  });
}

export function useSalesSummary(period: 'day' | 'week' | 'month' | 'year' = 'month') {
  return useQuery({
    queryKey: queryKeys.sales.summary(period),
    queryFn: () => salesApi.summary(period).then((r) => r.data.data),
  });
}

export function useSalesChart() {
  return useQuery({
    queryKey: queryKeys.sales.chart(),
    queryFn: () => salesApi.chart().then((r) => r.data.data ?? []),
  });
}
