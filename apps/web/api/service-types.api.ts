import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';
import type { ServiceType, CreateServiceTypePayload, UpdateServiceTypePayload, CreateServiceTypeFieldPayload, UpdateServiceTypeFieldPayload } from '@/types/service.types';

export const serviceTypesApi = {
  getAll: () => apiClient.get<ApiResponse<ServiceType[]>>('/service-types'),
  getAllForAdmin: () => apiClient.get<ApiResponse<ServiceType[]>>('/service-types/admin/all'),
  create: (payload: CreateServiceTypePayload) => apiClient.post<ApiResponse<ServiceType>>('/service-types', payload),
  update: (id: string, payload: UpdateServiceTypePayload) => apiClient.patch<ApiResponse<ServiceType>>(`/service-types/${id}`, payload),
  createField: (payload: CreateServiceTypeFieldPayload) => apiClient.post<ApiResponse<ServiceType['fields'][number]>>('/service-types/fields', payload),
  updateField: (id: string, payload: UpdateServiceTypeFieldPayload) => apiClient.patch<ApiResponse<ServiceType['fields'][number]>>(`/service-types/fields/${id}`, payload),
  deleteField: (id: string) => apiClient.delete<ApiResponse<null>>(`/service-types/fields/${id}`),
};
