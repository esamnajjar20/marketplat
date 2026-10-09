'use client';
import { queryOptions, useQuery, keepPreviousData } from '@tanstack/react-query';
import { salesApi } from '@/api/sales.api';
import { queryKeys, type SalesListQueryParams } from '@/lib/queryKeys';
import type { SalesPage } from '@/types/sale.types';

/** Shared typed options keep the request parameters tied to the cache identity. */
export function salesListQueryOptions(params?: SalesListQueryParams) {
  return queryOptions<SalesPage, Error, SalesPage, ReturnType<typeof queryKeys.sales.list>>({
    queryKey: queryKeys.sales.list(params),
    queryFn: ({ queryKey }) => salesApi.list(queryKey[2]).then((r) => r.data.data as SalesPage),
    placeholderData: keepPreviousData,
  });
}

export function useSales(params?: SalesListQueryParams) {
  return useQuery(salesListQueryOptions(params));
}

export function useSalesSummary(period: 'day' | 'week' | 'month' | 'year' = 'month') {
  return useQuery({
    queryKey: queryKeys.sales.summary(period),
    queryFn: () => salesApi.summary(period).then((r) => r.data.data),
  });
}

export function useSalesChart(period: 'day' | 'week' | 'month' = 'day') {
  return useQuery({
    queryKey: queryKeys.sales.chart(period),
    queryFn: () => salesApi.chart({ period }).then((r) => r.data.data ?? []),
  });
}

export function useSalesCompare(period: 'week'|'month'|'year' = 'month') {
  return useQuery({
    queryKey: queryKeys.sales.compare(period),
    queryFn: () => salesApi.compare(period).then((r) => r.data.data),
  });
}


export function useSalesCostSettings() {
  return useQuery({ queryKey: queryKeys.sales.costSettings(), queryFn: () => salesApi.costSettings().then(r => r.data.data) });
}

export function useSalesCostProducts(enabled = true) {
  return useQuery({ queryKey: queryKeys.sales.costProducts(), queryFn: () => salesApi.costProducts().then(r => r.data.data ?? []), enabled });
}

export function useDebtSummary() {
  return useQuery({ queryKey: queryKeys.sales.debtSummary(), queryFn: () => salesApi.debtSummary().then(r => r.data.data), staleTime: 30_000 });
}


export function useSalesDashboard() {
  return useQuery({ queryKey: queryKeys.sales.dashboard(), queryFn: () => salesApi.dashboard().then(r => r.data.data), staleTime: 30_000 });
}

export function useSalesReport(params?: Parameters<typeof salesApi.report>[0]) {
  return useQuery({ queryKey: queryKeys.sales.report(params), queryFn: () => salesApi.report(params).then(r => r.data.data), staleTime: 30_000 });
}

export function useSalesSmartInsights() {
  return useQuery({ queryKey: queryKeys.sales.smartInsights(), queryFn: () => salesApi.smartInsights().then(r => r.data.data), staleTime: 60_000 });
}
