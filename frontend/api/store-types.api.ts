import type { ApiResponse } from '@/types/api.types';
import type { StoreType, StoreTypeField } from '@/types/store.types';
import { apiClient } from './client';
import type { ApiRequestConfig } from './requestConfig';

export const storeTypesApi = {
  getAll: (config?: ApiRequestConfig) => apiClient.get<ApiResponse<StoreType[]>>('/store-types', config),
  getFields: (storeTypeId: string, config?: ApiRequestConfig) => apiClient.get<ApiResponse<StoreTypeField[]>>(`/store-types/${storeTypeId}/fields`, config),
};
