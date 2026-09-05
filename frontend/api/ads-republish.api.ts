import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';

/** POST /ads/:id/republish */
export const republishAd = (adId: string) =>
  apiClient.post<ApiResponse<unknown>>(`/ads/${adId}/republish`);
