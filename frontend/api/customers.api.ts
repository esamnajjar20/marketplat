import type { ApiResponse } from '@/types/api.types';
import { apiClient } from './client';
import type { AxiosRequestConfig } from 'axios';
import type { Customer } from '@/types/customer.types';

export const customersApi = {
  summary: () => apiClient.get<ApiResponse<{ totalCustomers:number; vipCustomers:number; debtors:number; inactiveCustomers:number; totalSpent:number; averageCustomerSpend:number }>>('/customers/summary'),
  // NOTE: backend returns { data: { items, meta } } directly (paginated),
  // so we don't wrap with unwrapPaginated — that helper expects the raw
  // list on data[] and would incorrectly nest { items, meta } inside items.
  list: (params?: { page?: number; limit?: number; q?: string; dueOnly?: boolean }, config?: AxiosRequestConfig) =>
    apiClient.get<ApiResponse<{ items: Customer[]; meta: import('@/types/api.types').PaginationMeta }>>('/customers', { ...config, params }),
  getById: (id: string) => apiClient.get<ApiResponse<Customer>>(`/customers/${id}`),
  search: (q: string, config?: AxiosRequestConfig) => apiClient.get<ApiResponse<Customer[]>>('/customers/search', { ...config, params: { q } }),
  create: (payload: { name: string; phone?: string | null; email?: string | null; address?: string | null; note?: string | null; tags?: string[] }) => apiClient.post<ApiResponse<Customer>>('/customers', payload),
  update: (id: string, payload: Partial<{ name: string; phone: string | null; email: string | null; address: string | null; note: string | null; tags: string[]; isVip: boolean; isBlacklisted: boolean }>) => apiClient.patch<ApiResponse<Customer>>(`/customers/${id}`, payload),
};
