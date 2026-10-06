'use client';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { customersApi } from '@/api/customers.api';
import { queryKeys } from '@/lib/queryKeys';
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

export function useCustomers(params?: { page?: number; limit?: number; q?: string; dueOnly?: boolean }) {
  return useQuery({
    queryKey: queryKeys.customers.list(params),
    queryFn: () => customersApi.list(params).then((r) => normalize(r.data)),
    placeholderData: keepPreviousData,
  });
}

export function useCustomerSearch(q: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.customers.search(q),
    queryFn: () => customersApi.search(q).then((r) => {
      const raw = (r.data as unknown as { data?: Customer[] }).data;
      return Array.isArray(raw) ? raw : [];
    }),
    enabled: enabled && q.trim().length >= 2,
    staleTime: 30_000,
  });
}
