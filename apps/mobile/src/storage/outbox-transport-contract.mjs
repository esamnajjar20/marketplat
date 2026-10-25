/** Pure, executable request contract shared by the sync worker and Node tests. */
const OP_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
// Keep this allowlist aligned with apps/api/src/config/limits.ts. The API
// currently accepts JPEG, PNG and WebP only (not HEIC/HEIF).
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export function toOutboxCreateAdRequest(item) {
  if (item.operation !== 'create-ad') {
    throw new Error('Automatic outbox transport is only enabled for idempotent ad creation.');
  }
  if (typeof item.idempotencyKey !== 'string' || !OP_ID_PATTERN.test(item.idempotencyKey)) {
    throw new Error('Offline operation ID must match the API X-Offline-Op-Id contract.');
  }
  let payload;
  try {
    payload = JSON.parse(item.payloadJson);
  } catch {
    throw new Error('Offline mutation payload is not valid JSON.');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Offline ad payload must be a JSON object.');
  }

  // The API's create-ad route requires at least one multipart image. Never silently
  // send JSON and pretend a queued ad was synced when the server will reject it.
  const images = payload.images;
  if (!Array.isArray(images) || images.length < 1) {
    throw new Error('لا يمكن مزامنة الإعلان دون صورة محفوظة محليًا. أعد فتح الإعلان واختر صورة قبل إضافته إلى الطابور.');
  }
  if (images.length > 10) throw new Error('لا يمكن مزامنة أكثر من 10 صور للإعلان الواحد.');
  const validatedImages = images.map((image, index) => {
    if (!image || typeof image !== 'object' || typeof image.uri !== 'string' || !image.uri.trim()) {
      throw new Error(`صورة الإعلان رقم ${index + 1} لا تحتوي على مسار محلي صالح.`);
    }
    if (!/^(file|content):\/\//i.test(image.uri)) {
      throw new Error(`صورة الإعلان رقم ${index + 1} ليست ملفًا محليًا قابلًا للرفع.`);
    }
    const type = typeof image.type === 'string' ? image.type.toLowerCase() : 'image/jpeg';
    if (!ALLOWED_IMAGE_TYPES.has(type)) throw new Error(`نوع صورة الإعلان غير مدعوم من الخادم: ${type}`);
    if (image.sizeBytes !== undefined && (!Number.isFinite(image.sizeBytes) || image.sizeBytes < 0 || image.sizeBytes > MAX_IMAGE_SIZE_BYTES)) {
      throw new Error(`حجم صورة الإعلان رقم ${index + 1} يتجاوز الحد المسموح (5MB).`);
    }
    const fallbackName = `offline-ad-${index + 1}.${type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'}`;
    const name = typeof image.name === 'string' && /^[\w.-]{1,120}$/.test(image.name)
      ? image.name : fallbackName;
    return { uri: image.uri, name, type };
  });

  const { images: _images, ...body } = payload;
  return {
    method: 'POST',
    path: '/api/v1/ads',
    headers: { 'X-Offline-Op-Id': item.idempotencyKey },
    body,
    images: validatedImages,
  };
}
