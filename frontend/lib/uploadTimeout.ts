/**
 * FIX WEAK-NET-UPLOAD-01 — مهلة رفع تتناسب مع حجم الملفات.
 *
 * `policy.uploadTimeoutMs` ثابتة (30–45 ثانية) مهما كان حجم الطلب. على اتصال
 * 2G/3G (≈ 12–25 KB/s) صورتان بحجم 2 MB تحتاجان أكثر من 3 دقائق، فكانت كل
 * محاولة تُقطع عند 45 ثانية وتُعاد من الصفر حتى تفشل نهائيًا. هنا نحسب المهلة
 * من الحجم الفعلي وأدنى معدل رفع نفترضه لكل مستوى شبكة، بسقف معقول، ولا نخفّض
 * أبدًا المهلة التي تحددها السياسة.
 *
 * دالة صرفة (بلا وصول إلى الشبكة أو DOM) كي يسهل اختبارها.
 */

export const UPLOAD_TIMEOUT_CEILING_MS = 4 * 60 * 1000;
const UPLOAD_OVERHEAD_MS = 10_000;
const DEFAULT_BASE_TIMEOUT_MS = 30_000;

/** أدنى معدل رفع (بايت/ثانية) نفترضه لكل مستوى شبكة. */
const MIN_UPLOAD_BPS: Record<string, number> = {
  'very-slow': 12 * 1024,
  slow: 25 * 1024,
  unknown: 40 * 1024,
  normal: 60 * 1024,
  fast: 120 * 1024,
};

export interface UploadTimeoutPolicyLike {
  tier?: string;
  uploadTimeoutMs?: number;
}

export function computeUploadTimeoutMs(totalBytes: number, policy: UploadTimeoutPolicyLike): number {
  const base =
    typeof policy.uploadTimeoutMs === 'number' && policy.uploadTimeoutMs > 0
      ? policy.uploadTimeoutMs
      : DEFAULT_BASE_TIMEOUT_MS;
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) return base;

  const tier = policy.tier && policy.tier in MIN_UPLOAD_BPS ? policy.tier : 'unknown';
  const bps = MIN_UPLOAD_BPS[tier] ?? MIN_UPLOAD_BPS.unknown ?? 1;
  const needed = UPLOAD_OVERHEAD_MS + Math.ceil((totalBytes / bps) * 1000);

  // لا نقل عن مهلة السياسة، ولا نتجاوز السقف (إلا إن كانت السياسة نفسها أعلى).
  return Math.max(base, Math.min(UPLOAD_TIMEOUT_CEILING_MS, needed));
}

export function totalFileBytes(files: ReadonlyArray<{ size: number }>): number {
  let total = 0;
  for (const f of files) total += Number.isFinite(f.size) ? f.size : 0;
  return total;
}

/**
 * مجموع أحجام الملفات داخل FormData (حقول النص لا تُحسب). يعيد 0 إن لم يوجد
 * FormData أو لم يُدعم forEach (بيئات الاختبار القديمة).
 */
export function formDataFileBytes(data: unknown): number {
  try {
    if (typeof FormData === 'undefined' || !(data instanceof FormData)) return 0;
    let total = 0;
    data.forEach((value) => {
      if (typeof value !== 'string' && value && Number.isFinite((value as Blob).size)) {
        total += (value as Blob).size;
      }
    });
    return total;
  } catch {
    return 0;
  }
}
