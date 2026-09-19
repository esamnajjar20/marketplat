/**
 * ضغط صور محلي للأوفلاين — Canvas API، بلا رفع لأي سيرفر.
 *
 * ⚠️ ملاحظة صدق: هذا الملف كان موجودًا سابقًا بلا أي caller (وُثِّق
 * كـ"كود ميت" بالتدقيق)، ثم حُذف بجلسة سابقة. هذه إعادة كتابة كاملة —
 * ليست استعادة للبايتات الأصلية (لم تعد موجودة). التوقيع والغرض نفس
 * الفكرة الأصلية (ضغط + فحص حجم الصورة)، لكن التنفيذ الفعلي جديد.
 *
 * الاستخدام الفعلي الآن (FIX IMAGEOFFLINE-WIRE-01): compressImageForOffline
 * تُستدعى من useAdMutations.ts's onError عند حفظ مسودة إعلان أوفلاين —
 * تُنتج نسخة مصغّرة تُخزَّن مع المسودة (lib/offlineAdDrafts.ts's images
 * الجديد) لعرضها كمعاينة بمركز المزامنة (SyncCenterClient.tsx). هذه
 * النسخة المضغوطة **للعرض فقط** — الصور الأصلية بجودتها الكاملة تُرسَل
 * فعليًا عبر طابور الـ SW (نفس الطلب الأصلي المُخزَّن بالكامل، انظر
 * FIX OFFLINE-ADS-01 بـ public/sw.js). لو الضغط هنا فشل أو أُلغي، النشر
 * الفعلي غير متأثر إطلاقًا — فقط المعاينة بمركز المزامنة تغيب.
 */

const MAX_DIMENSION = 480; // بكسل — كافٍ لمعاينة صغيرة، ليس للنشر
const JPEG_QUALITY = 0.6;
const MAX_OUTPUT_BYTES = 150 * 1024; // ~150KB سقف لكل صورة معاينة واحدة

/**
 * يضغط صورة إلى نسخة صغيرة (JPEG، أبعاد محدودة) صالحة لتخزينها محليًا
 * بـ IndexedDB كمعاينة. يرمي استثناء لو الملف ليس صورة أو لو بيئة
 * التشغيل لا تدعم Canvas — المستدعي (useAdMutations.ts) يتعامل مع هذا
 * بـ try/catch ويتابع بلا معاينة، لا يوقف حفظ المسودة نفسها.
 */
export async function compressImageForOffline(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new Error('الملف ليس صورة');
  }
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') {
    // بيئة بلا Canvas/createImageBitmap (مثلًا اختبارات Node بلا jsdom
    // كامل) — لا نحاول، نترك المستدعي يتعامل مع الفشل بأمان.
    throw new Error('الضغط غير مدعوم بهذه البيئة');
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('تعذّر إنشاء سياق Canvas');
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob) throw new Error('فشل ترميز الصورة المضغوطة');

    // سقف أخير: لو الضغط بالجودة المحددة ما زال أكبر من المتوقع (صورة
    // معقدة جدًا)، لا نرفض — فقط لا نتجاوز MAX_OUTPUT_BYTES بمحاولة
    // ثانية بجودة أقل. مرة واحدة فقط، لا حلقة — هذه معاينة، لا تستحق
    // محاولات لا نهائية.
    if (blob.size > MAX_OUTPUT_BYTES) {
      const smaller = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.35),
      );
      if (smaller) return smaller;
    }
    return blob;
  } finally {
    bitmap.close();
  }
}

/**
 * فحص حجم استجابة HTTP قبل تخزينها بكاش الصور — نفس المنطق المطبَّق
 * فعليًا (بشكل مستقل، بالضرورة — sw.js سكربت classic لا يستورد وحدات
 * TS) داخل public/sw.js عند التخزين الفعلي لصور الشبكة (Cache First،
 * 2.5MB سقف). هذه النسخة هنا للتوثيق/الاختبار من جانب التطبيق (مثلًا
 * لو أردت لاحقًا فحصًا مشابهًا قبل عرض صورة من كاش المتصفح)، وليست
 * مستوردة من sw.js نفسه — إن عدّلت الحد هنا حدّثه يدويًا هناك أيضًا
 * (نفس قيد offlineCachePolicy.ts's SW_CACHE_LIMITS الموثّق).
 */
export function shouldCacheImageResponse(response: Response): boolean {
  if (!response.ok) return false;
  const len = response.headers.get('content-length');
  const lenNum = len ? Number(len) : NaN;
  const tooLarge = Number.isFinite(lenNum) && lenNum > 2.5 * 1024 * 1024;
  return !tooLarge;
}


/**
 * FIX OFFLINE-QUEUE-RELIABILITY-01: ضغط معتدل للنشر أوفلاين (ليس مجرد معاينة).
 * صور الهاتف غالبًا 8–12MB — تتجاوز حد الطابور/المسودة. نُنتج JPEG بجودة
 * جيدة وأبعاد كافية للإعلان، تحت ~1.5MB غالبًا، قابلة لإعادة الرفع الحقيقي.
 */
const PUBLISH_MAX_DIMENSION = 1600;
const PUBLISH_JPEG_QUALITY = 0.82;
const PUBLISH_MAX_OUTPUT_BYTES = 2 * 1024 * 1024; // 2 MB

export async function compressImageForPublish(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (file.size <= 1.5 * 1024 * 1024) return file; // already small enough
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, PUBLISH_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, width, height);

      let quality = PUBLISH_JPEG_QUALITY;
      let blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality),
      );
      if (blob && blob.size > PUBLISH_MAX_OUTPUT_BYTES) {
        quality = 0.7;
        blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/jpeg', quality),
        );
      }
      if (!blob || blob.size >= file.size) return file;
      const base = (file.name || 'image').replace(/\.[^.]+$/, '') || 'image';
      return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
}
