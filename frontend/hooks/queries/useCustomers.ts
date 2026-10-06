'use client';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { customersApi } from '@/api/customers.api';
import { queryKeys } from '@/lib/queryKeys';

export function useCustomers(params?: { page?: number; limit?: number; q?: string; dueOnly?: boolean }) {
  return useQuery({ queryKey: queryKeys.customers.list(params), queryFn: () => customersApi.list(params).then((r) => r.data.data), placeholderData: keepPreviousData });
}

export function useCustomerSearch(q: string, enabled = true) {
  return useQuery({ queryKey: queryKeys.customers.search(q), queryFn: () => customersApi.search(q).then((r) => r.data.data ?? []), enabled: enabled && q.trim().length >= 2, staleTime: 30_000 });
}
