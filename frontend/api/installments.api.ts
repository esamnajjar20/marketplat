import type { ApiResponse } from '@/types/api.types';
import { apiClient } from './client';
import type { AxiosRequestConfig } from 'axios';
import type { SaleInstallment } from '@/types/installment.types';
export const installmentsApi = {
  upcoming: (config?: AxiosRequestConfig) => apiClient.get<ApiResponse<SaleInstallment[]>>('/sales/installments/upcoming', config),
  overdue: (config?: AxiosRequestConfig) => apiClient.get<ApiResponse<SaleInstallment[]>>('/sales/installments/overdue', config),
  pay: (id: string, amount?: number) => apiClient.post<ApiResponse<SaleInstallment>>(`/sales/installments/${id}/pay`, amount == null ? {} : { amount }),
};
