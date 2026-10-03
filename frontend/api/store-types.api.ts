import type { ApiResponse } from '@/types/api.types';
import type { StoreType } from '@/types/store.types';
import { apiClient } from './client';

export const storeTypesApi = {
  getAll: () => apiClient.get<ApiResponse<StoreType[]>>('/store-types'),
};
