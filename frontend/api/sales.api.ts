import type { ApiResponse, PaginationMeta } from '@/types/api.types';
import { apiClient } from './client';
import type { AxiosRequestConfig } from 'axios';
import { OFFLINE_OP_ID_HEADER } from '@/lib/offlineOperationId';
import type { CreateSalePayload, SaleRecord, SalesSummary, SalesDashboard, SalesReport, SalesSmartInsights, SalesListQueryParams, SalesReportQueryParams } from '@/types/sale.types';

export const salesApi = {
  // NOTE: GET /sales returns { data: { items, meta } } directly (see sales.controller list),
  // NOT a bare array + meta.pagination — so unwrapPaginated must NOT be used here
  // (it would nest { items, meta } inside items and the list would render empty).
  list: (params?: SalesListQueryParams, config?: AxiosRequestConfig) =>
    apiClient.get<ApiResponse<{ items: SaleRecord[]; meta: PaginationMeta }>>('/sales', { ...config, params }),
  getById: (id: string) => apiClient.get<ApiResponse<SaleRecord>>(`/sales/${id}`),
  create: (payload: CreateSalePayload, operationId?: string) => apiClient.post<ApiResponse<SaleRecord>>('/sales', payload, { headers: operationId ? { [OFFLINE_OP_ID_HEADER]: operationId } : undefined }),
  summary: (period: 'day' | 'week' | 'month' | 'year' = 'month', config?: AxiosRequestConfig) =>
    apiClient.get<ApiResponse<SalesSummary>>('/sales/summary', { ...config, params: { period } }),
  dashboard: (config?: AxiosRequestConfig) => apiClient.get<ApiResponse<SalesDashboard>>('/sales/dashboard', config),
  report: (params?: SalesReportQueryParams, config?: AxiosRequestConfig) => apiClient.get<ApiResponse<SalesReport>>('/sales/reports', { ...config, params }),
  debtSummary: (config?: AxiosRequestConfig) => apiClient.get<ApiResponse<{totalDue:number;overdueDue:number;dueToday:number;debtorCount:number}>>('/sales/debts/summary', config),
  debts: (config?: AxiosRequestConfig) => apiClient.get<ApiResponse<SaleRecord[]>>('/sales/debts', config),
  addPayment: (id: string, payload: { amount: number; method: import('@/types/sale.types').SaleTransferMethod; transferRef?: string; note?: string }) => apiClient.post<ApiResponse<SaleRecord>>(`/sales/${id}/payments`, payload),
  receipt: (id: string) => apiClient.get<ApiResponse<{ invoiceNumber: string | null; sale: SaleRecord }>>(`/sales/${id}/receipt`),
  chart: (params?: { from?: string; to?: string; period?: 'day' | 'week' | 'month' | 'year' }, config?: AxiosRequestConfig) =>
    apiClient.get<ApiResponse<Array<{ date: string; revenue: number; paid: number; due: number; count: number }>>>('/sales/chart', { ...config, params }),
  compare: (period: 'week'|'month'|'year' = 'month', config?: AxiosRequestConfig) => apiClient.get<ApiResponse<{period:string;current:SalesSummary;previous:SalesSummary;samePeriodLastYear:SalesSummary;revenueChangePercentage:number|null;lastYearRevenueChangePercentage:number|null}>>('/sales/compare', { ...config, params: { period }}),
  costSettings: (config?: AxiosRequestConfig) => apiClient.get<ApiResponse<{ enabled: boolean }>>('/sales/cost-settings', config),
  updateCostSettings: (enabled: boolean) => apiClient.patch<ApiResponse<{ enabled: boolean }>>('/sales/cost-settings', { enabled }),
  costProducts: (config?: AxiosRequestConfig) => apiClient.get<ApiResponse<Array<{ id:string; storeId:string; name:string; price:string; costPrice:string|null; stockQuantity:number|null; availability:string; images:string[]; store:{id:string;name:string} }>>>('/sales/cost-products', config),
  updateProductCost: (productId:string, costPrice:number|null) => apiClient.patch<ApiResponse<unknown>>(`/sales/cost-products/${productId}`, { costPrice }),
  smartInsights: (config?: AxiosRequestConfig) => apiClient.get<ApiResponse<SalesSmartInsights>>('/sales/smart-insights', config),
  runAutomation: () => apiClient.post<ApiResponse<{ scanned: Record<string, number>; notificationsSent: number }>>('/sales/automation/run', {}),
  addReturn: (id: string, payload: { itemId?: string; quantity:number; refundAmount:number; reason:'DAMAGED'|'WRONG_ITEM'|'NOT_LIKED'|'LATE'|'OTHER'; reasonNote?:string; restockedToInventory:boolean }) => apiClient.post<ApiResponse<SaleRecord>>(`/sales/${id}/return`, payload),
};
