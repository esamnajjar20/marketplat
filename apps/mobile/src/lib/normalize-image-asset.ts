export type PickedImageAsset = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
};

export type NormalizedImageAsset = {
  uri: string;
  fileName: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
};

const MIME_BY_EXTENSION = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const;

type SupportedMime = NormalizedImageAsset['mimeType'];

/** Normalize Expo picker metadata and reject MIME/extension mismatches before multipart upload. */
export function normalizePickedImage(asset: PickedImageAsset, fallbackPrefix = 'image'): NormalizedImageAsset {
  if (!asset.uri || typeof asset.uri !== 'string') throw new Error('مسار الصورة غير صالح. أعد اختيار الصورة.');

  const uriPath = asset.uri.split(/[?#]/, 1)[0];
  const uriName = uriPath.split(/[\\/]/).pop() || '';
  const rawName = (asset.fileName || uriName).split(/[\\/]/).pop() || '';
  const extension = rawName.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  const inferredMime = extension && Object.prototype.hasOwnProperty.call(MIME_BY_EXTENSION, extension)
    ? MIME_BY_EXTENSION[extension as keyof typeof MIME_BY_EXTENSION]
    : null;
  if (extension && !inferredMime) {
    throw new Error('امتداد الصورة غير مدعوم. اختر JPEG أو PNG أو WebP.');
  }

  const declared = (asset.mimeType || '').trim().toLowerCase();
  const normalizedDeclared = declared === 'image/jpg' ? 'image/jpeg' : declared;
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (normalizedDeclared && !allowed.includes(normalizedDeclared)) {
    throw new Error('صيغة الصورة غير مدعومة. اختر JPEG أو PNG أو WebP.');
  }
  if (normalizedDeclared && inferredMime && normalizedDeclared !== inferredMime) {
    throw new Error('امتداد الصورة لا يطابق نوعها. اختر صورة أخرى.');
  }

  const mimeType = (normalizedDeclared || inferredMime || 'image/jpeg') as SupportedMime;
  const canonicalExtension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const stem = rawName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  const fileName = extension
    ? `${stem || fallbackPrefix}.${canonicalExtension}`
    : `${stem || fallbackPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${canonicalExtension}`;

  return { uri: asset.uri, fileName, mimeType };
}
