import type { ApiResponse } from '@/types/api.types';
import { unwrapPaginated } from '@/lib/apiPagination';
import { apiClient } from './client';
import type { CreateSalePayload, SaleRecord, SalesSummary } from '@/types/sale.types';

export const salesApi = {
  list: (params?: Record<string, unknown>) =>
    apiClient.get<ApiResponse<SaleRecord[]>>('/sales', { params }).then((r) => unwrapPaginated<SaleRecord>(r)),
  getById: (id: string) => apiClient.get<ApiResponse<SaleRecord>>(`/sales/${id}`),
  create: (payload: CreateSalePayload) => apiClient.post<ApiResponse<SaleRecord>>('/sales', payload),
  summary: (period: 'day' | 'week' | 'month' | 'year' = 'month') =>
    apiClient.get<ApiResponse<SalesSummary>>('/sales/summary', { params: { period } }),
  debts: () => apiClient.get<ApiResponse<SaleRecord[]>>('/sales/debts'),
  chart: (params?: { from?: string; to?: string; period?: 'day' | 'week' | 'month' | 'year' }) =>
    apiClient.get<ApiResponse<Array<{ date: string; revenue: number; paid: number; due: number; count: number }>>>('/sales/chart', { params }),
};
