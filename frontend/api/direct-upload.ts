import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';

export type DirectImagePurpose = 'ads' | 'products' | 'service-listings' | 'requests';

type DirectUploadIntent = {
  publicId: string;
  timestamp: number;
  tags: string;
  overwrite: false;
  transformation: string;
  signature: string;
  apiKey: string;
  cloudName: string;
  uploadUrl: string;
};

type DirectIntentResponse = { intents: DirectUploadIntent[] };

const MAX_UPLOAD_CONCURRENCY = 3;

function uploadOne(file: File, intent: DirectUploadIntent, onProgress: (loaded: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('timestamp', String(intent.timestamp));
    form.append('public_id', intent.publicId);
    form.append('tags', intent.tags);
    form.append('overwrite', String(intent.overwrite));
    form.append('transformation', intent.transformation);
    form.append('api_key', intent.apiKey);
    form.append('signature', intent.signature);
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', intent.uploadUrl, true);
    xhr.withCredentials = false;
    xhr.timeout = 90_000;
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    xhr.onerror = () => reject(new Error('تعذر الاتصال بخدمة رفع الصور.'));
    xhr.ontimeout = () => reject(new Error('انتهت مهلة رفع الصورة.'));
    xhr.onabort = () => reject(new Error('تم إلغاء رفع الصورة.'));
    xhr.onload = () => {
      let payload: { public_id?: unknown; error?: { message?: string } };
      try {
        payload = JSON.parse(xhr.responseText) as typeof payload;
      } catch {
        reject(new Error('استجابة خدمة رفع الصور غير صالحة.'));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(payload.error?.message || `فشل رفع الصورة (${xhr.status}).`));
        return;
      }
      if (payload.public_id !== intent.publicId) {
        reject(new Error('لم تتطابق هوية الصورة بعد الرفع.'));
        return;
      }
      onProgress(file.size);
      resolve(intent.publicId);
    };
    xhr.send(form);
  });
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await fn(item, index);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Upload image bytes from the browser straight to Cloudinary. Only opaque
 * public IDs return to the API; it resolves canonical URLs after verifying
 * the signed owner/purpose tags via Cloudinary's Admin API. */
export async function uploadImagesDirect(
  files: File[],
  purpose: DirectImagePurpose,
  onProgress?: (percent: number) => void,
): Promise<string[]> {
  if (!files.length) return [];
  if (files.length > 10) throw new Error('يمكن رفع عشر صور كحد أقصى.');
  for (const file of files) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024) {
      throw new Error('يجب أن تكون الصور JPEG أو PNG أو WebP وألا يتجاوز حجم الصورة 5MB.');
    }
  }

  const { data } = await apiClient.post<ApiResponse<DirectIntentResponse>>('/media/direct/intents', {
    purpose,
    count: files.length,
  });
  const intents = data.data?.intents;
  if (!Array.isArray(intents) || intents.length !== files.length) {
    throw new Error('لم يصدر الخادم تصاريح رفع كافية.');
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const loaded = new Array<number>(files.length).fill(0);
  const reportProgress = (index: number, bytes: number) => {
    const file = files[index];
    if (!file) return;
    loaded[index] = Math.max(loaded[index] ?? 0, Math.min(file.size, bytes));
    const totalLoaded = loaded.reduce((sum, value) => sum + value, 0);
    onProgress?.(totalBytes > 0 ? Math.min(100, Math.round((totalLoaded / totalBytes) * 100)) : 100);
  };

  const publicIds = await mapLimit(files, MAX_UPLOAD_CONCURRENCY, (file, index) => {
    const intent = intents[index];
    if (!intent) throw new Error('بيانات تصريح رفع الصورة غير مكتملة.');
    return uploadOne(file, intent, bytes => reportProgress(index, bytes));
  });
  onProgress?.(100);
  return publicIds;
}
