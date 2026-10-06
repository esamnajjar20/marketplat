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

export function useSalesCompare(period: 'week'|'month'|'year' = 'month') {
  return useQuery({
    queryKey: [...queryKeys.sales.all(), 'compare', period],
    queryFn: () => salesApi.compare(period).then((r) => r.data.data),
  });
}


export function useSalesCostSettings() {
  return useQuery({ queryKey: [...queryKeys.sales.all(), 'cost-settings'], queryFn: () => salesApi.costSettings().then(r => r.data.data) });
}

export function useSalesCostProducts(enabled = true) {
  return useQuery({ queryKey: [...queryKeys.sales.all(), 'cost-products'], queryFn: () => salesApi.costProducts().then(r => r.data.data ?? []), enabled });
}
