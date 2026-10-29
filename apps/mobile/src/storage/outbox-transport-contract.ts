/**
 * عقد طلب إنشاء إعلان من الطابور — TypeScript نقي (بدل .mjs).
 */
import { OUTBOX_OP_ID_PATTERN } from '@/storage/outbox';
import type { OutboxItem } from '@/storage/mutation-outbox';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export type OutboxLocalImage = {
  uri: string;
  name: string;
  type: string;
};

export type OutboxCreateAdRequest = {
  method: 'POST';
  path: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  images: OutboxLocalImage[];
};

type ImageInput = {
  uri?: unknown;
  type?: unknown;
  name?: unknown;
  sizeBytes?: unknown;
};

export function toOutboxCreateAdRequest(item: OutboxItem): OutboxCreateAdRequest {
  if (item.operation !== 'create-ad') {
    throw new Error('Automatic outbox transport is only enabled for idempotent ad creation.');
  }
  if (typeof item.idempotencyKey !== 'string' || !OUTBOX_OP_ID_PATTERN.test(item.idempotencyKey)) {
    throw new Error('Offline operation ID must match the API X-Offline-Op-Id contract.');
  }
  let payload: unknown;
  try {
    payload = JSON.parse(item.payloadJson);
  } catch {
    throw new Error('Offline mutation payload is not valid JSON.');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Offline ad payload must be a JSON object.');
  }

  const record = payload as Record<string, unknown>;
  const images = record.images;
  if (!Array.isArray(images) || images.length < 1) {
    throw new Error(
      'لا يمكن مزامنة الإعلان دون صورة محفوظة محليًا. أعد فتح الإعلان واختر صورة قبل إضافته إلى الطابور.',
    );
  }
  if (images.length > 10) throw new Error('لا يمكن مزامنة أكثر من 10 صور للإعلان الواحد.');

  const validatedImages: OutboxLocalImage[] = images.map((raw, index) => {
    const image = raw as ImageInput;
    if (!image || typeof image !== 'object' || typeof image.uri !== 'string' || !image.uri.trim()) {
      throw new Error(`صورة الإعلان رقم ${index + 1} لا تحتوي على مسار محلي صالح.`);
    }
    if (!/^(file|content):\/\//i.test(image.uri)) {
      throw new Error(`صورة الإعلان رقم ${index + 1} ليست ملفًا محليًا قابلًا للرفع.`);
    }
    const type = typeof image.type === 'string' ? image.type.toLowerCase() : 'image/jpeg';
    if (!ALLOWED_IMAGE_TYPES.has(type)) {
      throw new Error(`نوع صورة الإعلان غير مدعوم من الخادم: ${type}`);
    }
    if (
      image.sizeBytes !== undefined &&
      (!Number.isFinite(image.sizeBytes as number) ||
        (image.sizeBytes as number) < 0 ||
        (image.sizeBytes as number) > MAX_IMAGE_SIZE_BYTES)
    ) {
      throw new Error(`حجم صورة الإعلان رقم ${index + 1} يتجاوز الحد المسموح (5MB).`);
    }
    const fallbackName = `offline-ad-${index + 1}.${
      type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'
    }`;
    const name =
      typeof image.name === 'string' && /^[\w.-]{1,120}$/.test(image.name)
        ? image.name
        : fallbackName;
    return { uri: image.uri, name, type };
  });

  const { images: _images, ...body } = record;
  return {
    method: 'POST',
    path: '/api/v1/ads',
    headers: { 'X-Offline-Op-Id': item.idempotencyKey },
    body: body as Record<string, unknown>,
    images: validatedImages,
  };
}
