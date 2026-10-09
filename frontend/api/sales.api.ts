import type { ApiResponse, PaginationMeta } from '@/types/api.types';
import { apiClient } from './client';
import { OFFLINE_OP_ID_HEADER } from '@/lib/offlineOperationId';
import type { CreateSalePayload, SaleRecord, SalesSummary, SalesDashboard, SalesReport, SalesSmartInsights, SalesListQueryParams, SalesReportQueryParams } from '@/types/sale.types';

export const salesApi = {
  // NOTE: GET /sales returns { data: { items, meta } } directly (see sales.controller list),
  // NOT a bare array + meta.pagination — so unwrapPaginated must NOT be used here
  // (it would nest { items, meta } inside items and the list would render empty).
  list: (params?: SalesListQueryParams) =>
    apiClient.get<ApiResponse<{ items: SaleRecord[]; meta: PaginationMeta }>>('/sales', { params }),
  getById: (id: string) => apiClient.get<ApiResponse<SaleRecord>>(`/sales/${id}`),
  create: (payload: CreateSalePayload, operationId?: string) => apiClient.post<ApiResponse<SaleRecord>>('/sales', payload, { headers: operationId ? { [OFFLINE_OP_ID_HEADER]: operationId } : undefined }),
  summary: (period: 'day' | 'week' | 'month' | 'year' = 'month') =>
    apiClient.get<ApiResponse<SalesSummary>>('/sales/summary', { params: { period } }),
  dashboard: () => apiClient.get<ApiResponse<SalesDashboard>>('/sales/dashboard'),
  report: (params?: SalesReportQueryParams) => apiClient.get<ApiResponse<SalesReport>>('/sales/reports', { params }),
  debtSummary: () => apiClient.get<ApiResponse<{totalDue:number;overdueDue:number;dueToday:number;debtorCount:number}>>('/sales/debts/summary'),
  debts: () => apiClient.get<ApiResponse<SaleRecord[]>>('/sales/debts'),
  addPayment: (id: string, payload: { amount: number; method: import('@/types/sale.types').SaleTransferMethod; transferRef?: string; note?: string }) => apiClient.post<ApiResponse<SaleRecord>>(`/sales/${id}/payments`, payload),
  receipt: (id: string) => apiClient.get<ApiResponse<{ invoiceNumber: string | null; sale: SaleRecord }>>(`/sales/${id}/receipt`),
  chart: (params?: { from?: string; to?: string; period?: 'day' | 'week' | 'month' | 'year' }) =>
    apiClient.get<ApiResponse<Array<{ date: string; revenue: number; paid: number; due: number; count: number }>>>('/sales/chart', { params }),
  compare: (period: 'week'|'month'|'year' = 'month') => apiClient.get<ApiResponse<{period:string;current:SalesSummary;previous:SalesSummary;samePeriodLastYear:SalesSummary;revenueChangePercentage:number|null;lastYearRevenueChangePercentage:number|null}>>('/sales/compare', { params: { period }}),
  costSettings: () => apiClient.get<ApiResponse<{ enabled: boolean }>>('/sales/cost-settings'),
  updateCostSettings: (enabled: boolean) => apiClient.patch<ApiResponse<{ enabled: boolean }>>('/sales/cost-settings', { enabled }),
  costProducts: () => apiClient.get<ApiResponse<Array<{ id:string; storeId:string; name:string; price:string; costPrice:string|null; stockQuantity:number|null; availability:string; images:string[]; store:{id:string;name:string} }>>>('/sales/cost-products'),
  updateProductCost: (productId:string, costPrice:number|null) => apiClient.patch<ApiResponse<unknown>>(`/sales/cost-products/${productId}`, { costPrice }),
  smartInsights: () => apiClient.get<ApiResponse<SalesSmartInsights>>('/sales/smart-insights'),
  runAutomation: () => apiClient.post<ApiResponse<{ scanned: Record<string, number>; notificationsSent: number }>>('/sales/automation/run', {}),
  addReturn: (id: string, payload: { itemId?: string; quantity:number; refundAmount:number; reason:'DAMAGED'|'WRONG_ITEM'|'NOT_LIKED'|'LATE'|'OTHER'; reasonNote?:string; restockedToInventory:boolean }) => apiClient.post<ApiResponse<SaleRecord>>(`/sales/${id}/return`, payload),
};
