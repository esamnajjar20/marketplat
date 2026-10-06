import type { ApiResponse } from '@/types/api.types';
import { unwrapPaginated } from '@/lib/apiPagination';
import { apiClient } from './client';
import type { Customer } from '@/types/customer.types';

export const customersApi = {
  list: (params?: { page?: number; limit?: number; q?: string; dueOnly?: boolean }) =>
    apiClient.get<ApiResponse<Customer[]>>('/customers', { params }).then((r) => unwrapPaginated<Customer>(r)),
  getById: (id: string) => apiClient.get<ApiResponse<Customer>>(`/customers/${id}`),
  search: (q: string) => apiClient.get<ApiResponse<Customer[]>>('/customers/search', { params: { q } }),
  create: (payload: { name: string; phone?: string | null; email?: string | null; address?: string | null; note?: string | null; tags?: string[] }) => apiClient.post<ApiResponse<Customer>>('/customers', payload),
  update: (id: string, payload: Partial<{ name: string; phone: string | null; email: string | null; address: string | null; note: string | null; tags: string[] }>) => apiClient.patch<ApiResponse<Customer>>(`/customers/${id}`, payload),
};
