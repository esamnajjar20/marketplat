'use client';
import { queryOptions, useQuery, keepPreviousData } from '@tanstack/react-query';
import { customersApi } from '@/api/customers.api';
import { queryKeys, type CustomerListQueryParams } from '@/lib/queryKeys';
import type { Customer } from '@/types/customer.types';

interface PaginatedCustomers {
  items: Customer[];
  meta: { total: number; page: number; limit: number; totalPages: number; hasNextPage: boolean; hasPrevPage: boolean } | null;
}

/**
 * Defensive normalize — tolerates:
 *   - { items: [], meta }        (backend paginated shape)
 *   - Customer[]                 (bare array)
 *   - { data: { items, meta } }  (wrapped)
 *   - { data: Customer[] }       (wrapped array)
 *   - undefined/null             → empty
 */
function normalize(raw: unknown): PaginatedCustomers {
  if (!raw) return { items: [], meta: null };
  if (Array.isArray(raw)) return { items: raw as Customer[], meta: null };
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj as unknown as PaginatedCustomers;
    const inner = obj.data;
    if (inner && typeof inner === 'object') {
      const inObj = inner as Record<string, unknown>;
      if (Array.isArray(inObj.items)) return inObj as unknown as PaginatedCustomers;
      if (Array.isArray(inner)) return { items: inner as Customer[], meta: null };
    }
  }
  return { items: [], meta: null };
}

export function useCustomerSummary() {
  return useQuery({ queryKey: queryKeys.customers.summary(), queryFn: () => customersApi.summary().then(r => r.data.data), staleTime: 30_000 });
}

export function customerListQueryOptions(params?: CustomerListQueryParams) {
  return queryOptions<PaginatedCustomers, Error, PaginatedCustomers, ReturnType<typeof queryKeys.customers.list>>({
    queryKey: queryKeys.customers.list(params),
    queryFn: ({ queryKey }) => customersApi.list(queryKey[2]).then((r) => normalize(r.data)),
    placeholderData: keepPreviousData,
  });
}

export function useCustomers(params?: CustomerListQueryParams) {
  return useQuery(customerListQueryOptions(params));
}

export function customerSearchQueryOptions(q: string) {
  return queryOptions({
    queryKey: queryKeys.customers.search(q),
    queryFn: ({ queryKey }) => customersApi.search(queryKey[2]).then((r) => {
      const raw = (r.data as unknown as { data?: Customer[] }).data;
      return Array.isArray(raw) ? raw : [];
    }),
    staleTime: 30_000,
  });
}

export function useCustomerSearch(q: string, enabled = true) {
  return useQuery({ ...customerSearchQueryOptions(q), enabled: enabled && q.trim().length >= 2 });
}
