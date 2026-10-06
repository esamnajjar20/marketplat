import type { ApiResponse } from '@/types/api.types';
import { apiClient } from './client';
import type { SaleInstallment } from '@/types/installment.types';
export const installmentsApi = {
  upcoming: () => apiClient.get<ApiResponse<SaleInstallment[]>>('/sales/installments/upcoming'),
  overdue: () => apiClient.get<ApiResponse<SaleInstallment[]>>('/sales/installments/overdue'),
  pay: (id: string, amount?: number) => apiClient.post<ApiResponse<SaleInstallment>>(`/sales/installments/${id}/pay`, amount == null ? {} : { amount }),
};
