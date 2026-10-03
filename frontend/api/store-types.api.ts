import type { ApiResponse } from '@/types/api.types';
import type { StoreType, StoreTypeField } from '@/types/store.types';
import { apiClient } from './client';

export const storeTypesApi = {
  getAll: () => apiClient.get<ApiResponse<StoreType[]>>('/store-types'),
  getFields: (storeTypeId: string) => apiClient.get<ApiResponse<StoreTypeField[]>>(`/store-types/${storeTypeId}/fields`),
};
