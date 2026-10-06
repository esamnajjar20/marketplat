import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';

export const republishAd = (adId: string) =>
  apiClient.post<ApiResponse<unknown>>(`/ads/${adId}/republish`);
