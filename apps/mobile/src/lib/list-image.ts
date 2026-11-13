/**
 * سياسة صور القوائم الموحّدة.
 *
 * - القوائم تعرض صورة واحدة فقط لكل عنصر: نختار أول رابط صالح بدل تمرير المصفوفة كاملة.
 * - `limitImagesForList` يقصّ المصفوفة قبل تخزينها في حالة الشاشة/الكاش (يقلل الذاكرة وحجم JSON).
 */
const REMOTE_IMAGE = /^https?:\/\//i;
const LOCAL_OR_REMOTE_IMAGE = /^(https?:|file:|content:)/i;

export const LIST_IMAGE_LIMIT = 2;

export function pickRemoteImageUri(images?: ReadonlyArray<unknown> | null): string | undefined {
  if (!Array.isArray(images)) return undefined;
  for (const value of images) {
    if (typeof value === 'string' && REMOTE_IMAGE.test(value)) return value;
  }
  return undefined;
}

/** مثل pickRemoteImageUri لكن يقبل أيضًا الصور المحفوظة محليًا (offline: file:/content:). */
export function pickAnyImageUri(images?: ReadonlyArray<unknown> | null): string | undefined {
  if (!Array.isArray(images)) return undefined;
  for (const value of images) {
    if (typeof value === 'string' && LOCAL_OR_REMOTE_IMAGE.test(value)) return value;
  }
  return undefined;
}

export function limitImagesForList<T>(images: ReadonlyArray<T> | null | undefined, limit = LIST_IMAGE_LIMIT): T[] | undefined {
  return Array.isArray(images) ? images.slice(0, limit) : undefined;
}
