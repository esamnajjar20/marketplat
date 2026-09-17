import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';

export type UploadedImage = { url: string; publicId: string };

export const mediaApi = {
  uploadImages: (files: File[]) => {
    const form = new FormData();
    for (const f of files) form.append('images', f);
    return apiClient.post<ApiResponse<UploadedImage[]>>('/media/images', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};
