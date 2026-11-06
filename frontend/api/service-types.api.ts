import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';
import type { ServiceType, CreateServiceTypePayload, UpdateServiceTypePayload, CreateServiceTypeFieldPayload, UpdateServiceTypeFieldPayload } from '@/types/service.types';
import type { ApiRequestConfig } from './requestConfig';

export const serviceTypesApi = {
  getAll: (config?: ApiRequestConfig) => apiClient.get<ApiResponse<ServiceType[]>>('/service-types', config),
  getAllForAdmin: (config?: ApiRequestConfig) => apiClient.get<ApiResponse<ServiceType[]>>('/service-types/admin/all', config),
  create: (payload: CreateServiceTypePayload) => apiClient.post<ApiResponse<ServiceType>>('/service-types', payload),
  update: (id: string, payload: UpdateServiceTypePayload) => apiClient.patch<ApiResponse<ServiceType>>(`/service-types/${id}`, payload),
  createField: (payload: CreateServiceTypeFieldPayload) => apiClient.post<ApiResponse<ServiceType['fields'][number]>>('/service-types/fields', payload),
  updateField: (id: string, payload: UpdateServiceTypeFieldPayload) => apiClient.patch<ApiResponse<ServiceType['fields'][number]>>(`/service-types/fields/${id}`, payload),
  deleteField: (id: string) => apiClient.delete<ApiResponse<null>>(`/service-types/fields/${id}`),
};
