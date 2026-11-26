import { apiRequest } from '@/api/client';
import * as FileSystem from 'expo-file-system/legacy';

type Envelope<T> = { success: boolean; message?: string; data?: T };
export type DirectImagePurpose = 'ads' | 'products' | 'service-listings' | 'requests';
export type MobileImageAsset = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
};

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

const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_CONCURRENCY = 3;

function unwrap<T>(response: Envelope<T>, fallback: string): T {
  if (!response || response.success !== true || response.data === undefined) {
    throw new Error(response?.message || fallback);
  }
  return response.data;
}

async function validateAssets(assets: MobileImageAsset[]): Promise<void> {
  if (assets.length < 1 || assets.length > MAX_IMAGES) {
    throw new Error(`يمكن رفع من صورة واحدة إلى ${MAX_IMAGES} صور.`);
  }
  for (const asset of assets) {
    const mimeType = asset.mimeType || 'image/jpeg';
    if (!asset.uri?.trim() || !/^image\/(jpeg|jpg|png|webp)$/i.test(mimeType)) {
      throw new Error('إحدى الصور المحددة غير صالحة.');
    }

    let fileSize = asset.fileSize;
    if (fileSize === undefined || fileSize === null) {
      const info = await FileSystem.getInfoAsync(asset.uri);
      if (!info.exists || info.isDirectory || typeof info.size !== 'number') {
        throw new Error('تعذر التحقق من حجم إحدى الصور؛ أعد اختيار الصورة.');
      }
      fileSize = info.size;
    }
    if (!Number.isFinite(fileSize) || fileSize < 1 || fileSize > MAX_IMAGE_BYTES) {
      throw new Error('يجب أن يكون حجم الصورة أكبر من صفر وألا يتجاوز 5MB.');
    }
  }
}

async function mapLimit<T, R>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let firstError: unknown;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (firstError === undefined) {
      const index = nextIndex++;
      if (index >= items.length) return;
      try {
        const item = items[index];
        if (item === undefined) throw new Error('بيانات رفع الصورة غير مكتملة.');
        results[index] = await mapper(item, index);
      } catch (error) {
        firstError = error;
        return;
      }
    }
  });
  await Promise.all(workers);
  if (firstError !== undefined) throw firstError;
  return results;
}

async function uploadOne(asset: MobileImageAsset, intent: DirectUploadIntent): Promise<void> {
  const form = new FormData();
  form.append('timestamp', String(intent.timestamp));
  form.append('public_id', intent.publicId);
  form.append('tags', intent.tags);
  form.append('overwrite', String(intent.overwrite));
  form.append('transformation', intent.transformation);
  form.append('api_key', intent.apiKey);
  form.append('signature', intent.signature);
  form.append('file', {
    uri: asset.uri,
    name: asset.fileName || `marketplat-${Date.now()}.jpg`,
    type: asset.mimeType || 'image/jpeg',
  } as unknown as Blob);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(intent.uploadUrl, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null) as {
      public_id?: unknown;
      error?: { message?: string };
    } | null;
    if (!response.ok) {
      throw new Error(payload?.error?.message || `فشل رفع الصورة (${response.status}).`);
    }
    if (payload?.public_id !== intent.publicId) {
      throw new Error('لم تتطابق هوية الصورة بعد الرفع.');
    }
  } catch (error) {
    if (controller.signal.aborted) throw new Error('انتهت مهلة رفع الصورة.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/** Upload image bytes from the device to Cloudinary, returning only API-issued public IDs. */
export async function uploadMobileImagesDirect(
  assets: MobileImageAsset[],
  purpose: DirectImagePurpose,
  token: string,
  csrfToken?: string | null,
): Promise<string[]> {
  if (!assets.length) return [];
  await validateAssets(assets);
  const intentResponse = await apiRequest<Envelope<{ intents: DirectUploadIntent[] }>>(
    '/api/v1/media/direct/intents',
    {
      method: 'POST',
      token,
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
      body: JSON.stringify({ purpose, count: assets.length }),
    },
  );
  const { intents } = unwrap(intentResponse, 'تعذر تجهيز رفع الصور.');
  if (!Array.isArray(intents) || intents.length !== assets.length) {
    throw new Error('لم يصدر الخادم تصاريح رفع كافية.');
  }
  await mapLimit(assets, MAX_CONCURRENCY, (asset, index) => {
    const intent = intents[index];
    if (!intent) throw new Error('بيانات تصريح رفع الصورة غير مكتملة.');
    return uploadOne(asset, intent);
  });
  return intents.map(intent => intent.publicId);
}
