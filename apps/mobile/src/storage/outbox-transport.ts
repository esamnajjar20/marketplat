import { apiRequest } from '@/api/client';
import * as FileSystem from 'expo-file-system/legacy';
import type { OutboxItem } from './mutation-outbox';
import { toOutboxCreateAdRequest } from './outbox-transport-contract';

type ApiEnvelope<T> = { success: boolean; message?: string; data?: T };

// Keep the request deadline comfortably below the SQLite lease duration used by
// outbox-sync.ts. A timed-out request remains retryable with the same operation ID.
export const OUTBOX_REQUEST_TIMEOUT_MS = 12_000;
const MAX_OUTBOX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

/** Verify persisted image files immediately before upload; picker cache URIs may have expired. */
async function verifyOutboxImages(images: Array<{ uri: string; name: string; type: string }>): Promise<void> {
  for (const [index, image] of images.entries()) {
    if (!image.uri.startsWith('file://')) {
      throw new Error(`صورة الإعلان رقم ${index + 1} ليست محفوظة في مساحة التطبيق الدائمة. أعد اختيار الصورة قبل المزامنة.`);
    }
    const info = await FileSystem.getInfoAsync(image.uri);
    if (!info.exists || info.isDirectory) {
      throw new Error(`ملف صورة الإعلان رقم ${index + 1} لم يعد موجودًا على الجهاز. أعد اختيار الصورة قبل المزامنة.`);
    }
    if (typeof info.size !== 'number' || info.size <= 0 || info.size > MAX_OUTBOX_IMAGE_SIZE_BYTES) {
      throw new Error(`حجم صورة الإعلان رقم ${index + 1} غير صالح أو يتجاوز 5MB.`);
    }
  }
}

/**
 * Send one supported outbox item as multipart/form-data. The API requires at least
 * one image for ad creation; local image URIs are persisted with the operation and
 * this transport does not acknowledge/delete queued work; only the sync worker may do so
 * converted to React Native's FormData file descriptors only at send time.
 */
export async function sendOutboxCreateAd<T>(
  item: OutboxItem,
  token: string,
  csrfToken?: string | null,
): Promise<T> {
  const request = toOutboxCreateAdRequest(item);
  // Check file existence at send time, not only when the image was first picked.
  // Missing files must leave the durable outbox row unacknowledged for user recovery.
  await verifyOutboxImages(request.images);
  const form = new FormData();
  for (const [key, value] of Object.entries(request.body)) {
    if (value === undefined || value === null) continue;
    form.append(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  for (const image of request.images) {
    // React Native FormData supports the { uri, name, type } file descriptor.
    form.append('images', image as unknown as Blob);
  }
  const response = await apiRequest<ApiEnvelope<T>>(request.path, {
    method: request.method,
    body: form,
    timeoutMs: OUTBOX_REQUEST_TIMEOUT_MS,
    token,
    headers: {
      ...request.headers,
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
  });
  if (!response || response.success !== true || response.data === undefined) {
    throw new Error(response?.message || 'استجابة إنشاء الإعلان عبر المزامنة غير صالحة.');
  }
  return response.data;
}


/** Send an explicit, durable delete request. Server-side delete is replay-safe (phase 62). */
export async function sendOutboxDeleteAd<T = unknown>(
  item: OutboxItem,
  token: string,
  csrfToken?: string | null,
): Promise<T> {
  if (item.operation !== 'delete-ad' || !item.resourceId?.trim()) {
    throw new Error('طلب حذف الإعلان لا يحتوي على معرّف إعلان صالح.');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(item.idempotencyKey)) {
    throw new Error('معرّف عملية الحذف غير صالح.');
  }
  const response = await apiRequest<ApiEnvelope<T>>(`/api/v1/ads/${encodeURIComponent(item.resourceId)}`, {
    method: 'DELETE',
    timeoutMs: OUTBOX_REQUEST_TIMEOUT_MS,
    token,
    headers: {
      'X-Offline-Op-Id': item.idempotencyKey,
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
  });
  // DELETE controller returns a success envelope; require it before acking the queue.
  if (!response || response.success !== true) {
    throw new Error(response?.message || 'استجابة حذف الإعلان عبر المزامنة غير صالحة.');
  }
  return response.data as T;
}


/** Replay an ad update. Fields are applied first; optional persisted images are appended second. */
export async function sendOutboxUpdateAd<T = unknown>(
  item: OutboxItem,
  token: string,
  csrfToken?: string | null,
): Promise<T> {
  if (item.operation !== 'update-ad' || !item.resourceId?.trim()) {
    throw new Error('طلب تعديل الإعلان لا يحتوي على معرّف إعلان صالح.');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(item.idempotencyKey)) {
    throw new Error('معرّف عملية التعديل غير صالح.');
  }
  let payload: unknown;
  try { payload = JSON.parse(item.payloadJson); } catch { throw new Error('بيانات تعديل الإعلان المحفوظة غير صالحة.'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('بيانات تعديل الإعلان يجب أن تكون كائنًا صالحًا.');
  }
  const raw = payload as Record<string, unknown>;
  const allowed = new Set(['title', 'description', 'city', 'price', 'categoryId', 'isNegotiable', 'images']);
  if (Object.keys(raw).some((key) => !allowed.has(key)) ||
      typeof raw.title !== 'string' || typeof raw.description !== 'string' ||
      typeof raw.city !== 'string' || typeof raw.isNegotiable !== 'boolean' ||
      (raw.price !== null && typeof raw.price !== 'number') ||
      (raw.categoryId !== null && typeof raw.categoryId !== 'string')) {
    throw new Error('بيانات التعديل لا تطابق عقد المزامنة الآمن؛ بقيت العملية محفوظة في الطابور.');
  }
  const images = raw.images === undefined ? [] : raw.images;
  if (!Array.isArray(images) || images.length > 10 || images.some((image) =>
    !image || typeof image !== 'object' || Array.isArray(image) ||
    typeof (image as { uri?: unknown }).uri !== 'string' ||
    typeof (image as { name?: unknown }).name !== 'string' ||
    typeof (image as { type?: unknown }).type !== 'string' ||
    !/^image\/(jpeg|jpg|png|webp)$/.test((image as { type: string }).type))) {
    throw new Error('قائمة صور التعديل غير صالحة؛ بقيت العملية محفوظة في الطابور.');
  }
  const body = { title: raw.title, description: raw.description, city: raw.city,
    price: raw.price, categoryId: raw.categoryId, isNegotiable: raw.isNegotiable };
  const headers = { 'X-Offline-Op-Id': item.idempotencyKey, ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) };
  const response = await apiRequest<ApiEnvelope<T>>(`/api/v1/ads/${encodeURIComponent(item.resourceId)}`, {
    method: 'PATCH', body: JSON.stringify(body), timeoutMs: OUTBOX_REQUEST_TIMEOUT_MS, token, headers,
  });
  if (!response || response.success !== true || response.data === undefined) {
    throw new Error(response?.message || 'استجابة تعديل الإعلان عبر المزامنة غير صالحة.');
  }

  if (images.length > 0) {
    const typedImages = images as Array<{ uri: string; name: string; type: string }>;
    await verifyOutboxImages(typedImages);
    const form = new FormData();
    for (const image of typedImages) form.append('images', image as unknown as Blob);
    const uploaded = await apiRequest<ApiEnvelope<T>>(`/api/v1/ads/${encodeURIComponent(item.resourceId)}/images`, {
      method: 'POST', body: form, timeoutMs: OUTBOX_REQUEST_TIMEOUT_MS, token, headers,
    });
    if (!uploaded || uploaded.success !== true || uploaded.data === undefined) {
      throw new Error(uploaded?.message || 'تعذر تأكيد رفع صور التعديل؛ ستُعاد المحاولة بالمعرّف نفسه.');
    }
    return uploaded.data;
  }
  return response.data;
}
