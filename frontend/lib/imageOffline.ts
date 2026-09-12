/**
 * إدارة صور الأوفلاين — ضغط قبل أي تخزين محلي، ورفض الملفات الضخمة.
 * لا نجعل كاش الصور ينتفخ على الهاتف.
 */

/** أقصى بُعد (عرض أو ارتفاع) بعد الضغط */
const MAX_DIMENSION = 1280;
/** جودة JPEG/WebP */
const QUALITY = 0.72;
/** رفض الملف الخام إن تجاوز هذا الحجم قبل الضغط */
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
/** بعد الضغط — إن بقي أكبر لا نخزّنه في المسودات */
const MAX_OUTPUT_BYTES = 1.5 * 1024 * 1024;

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
  originalName: string;
  originalSize: number;
  compressedSize: number;
}

/**
 * يضغط صورة للمتصفح (canvas). يُستخدم قبل إضافة صورة لمسودة إعلان offline.
 * يرمي Error برسالة عربية عند الفشل أو الحجم الزائد.
 */
export async function compressImageForOffline(file: File): Promise<CompressedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('الملف ليس صورة');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('الصورة أكبر من 8MB — صغّرها قبل الحفظ بدون إنترنت');
  }

  const bitmap = await createImageBitmap(file);
  try {
    let { width, height } = bitmap;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('تعذّر معالجة الصورة على هذا الجهاز');
    ctx.drawImage(bitmap, 0, 0, width, height);

    const mime =
      file.type === 'image/png' || file.type === 'image/webp'
        ? file.type
        : 'image/jpeg';

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('فشل ضغط الصورة'))),
        mime,
        QUALITY,
      );
    });

    if (blob.size > MAX_OUTPUT_BYTES) {
      throw new Error('الصورة ما زالت كبيرة بعد الضغط — استخدم صورة أصغر');
    }

    return {
      blob,
      width,
      height,
      originalName: file.name,
      originalSize: file.size,
      compressedSize: blob.size,
    };
  } finally {
    bitmap.close();
  }
}

/** هل يُنصح بتخزين هذه الاستجابة في كاش الصور؟ */
export function shouldCacheImageResponse(contentLengthHeader: string | null): boolean {
  if (!contentLengthHeader) return true;
  const n = Number(contentLengthHeader);
  if (!Number.isFinite(n)) return true;
  // 2.5MB سقف لكل صورة في Cache API
  return n > 0 && n <= 2.5 * 1024 * 1024;
}
