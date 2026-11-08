import type { ApiResponse } from '@/types/api.types';
import { apiClient } from './client';
import type { AxiosRequestConfig } from 'axios';
import type { SaleInstallment } from '@/types/installment.types';

export interface InstallmentsOverview {
  upcoming: SaleInstallment[];
  overdue: SaleInstallment[];
}
export const installmentsApi = {
  overview: (config?: AxiosRequestConfig) => (config ? apiClient.get<ApiResponse<InstallmentsOverview>>('/sales/installments/overview', config) : apiClient.get<ApiResponse<InstallmentsOverview>>('/sales/installments/overview')),
  upcoming: (config?: AxiosRequestConfig) => (config ? apiClient.get<ApiResponse<SaleInstallment[]>>('/sales/installments/upcoming', config) : apiClient.get<ApiResponse<SaleInstallment[]>>('/sales/installments/upcoming')),
  overdue: (config?: AxiosRequestConfig) => (config ? apiClient.get<ApiResponse<SaleInstallment[]>>('/sales/installments/overdue', config) : apiClient.get<ApiResponse<SaleInstallment[]>>('/sales/installments/overdue')),
  pay: (id: string, amount?: number) => apiClient.post<ApiResponse<SaleInstallment>>(`/sales/installments/${id}/pay`, amount == null ? {} : { amount }),
};
