/**
 * إحصائيات التخزين المحلي للـ PWA — Cache Storage + تقديرات IndexedDB.
 * يُستخدم من صفحة الإعدادات → التخزين والبيانات.
 */

export interface CacheBucketStat {
  /** اسم الكاش في Cache Storage */
  name: string;
  /** تسمية عربية للعرض */
  label: string;
  /** عدد المداخل */
  entries: number;
  /** حجم تقريبي بالبايت (مجموع أحجام الأجسام إن توفرت) */
  bytes: number;
  /** هل يُسمح بمسحه من الواجهة */
  clearable: boolean;
}

export interface StorageStats {
  caches: CacheBucketStat[];
  totalBytes: number;
  totalEntries: number;
  /** تقدير من navigator.storage.estimate إن وُجد */
  quotaBytes: number | null;
  usageBytes: number | null;
  supported: boolean;
}

const CACHE_LABELS: Record<string, string> = {
  'market-static': 'صفحات وأصول التطبيق',
  'market-images': 'الصور',
  'market-api': 'بيانات API',
  'market-core': 'الحزمة الأساسية (تصفح عام)',
  'market-personal-shell': 'شكل الرسائل والإشعارات',
  'market-saved-ads': 'إعلانات محفوظة دون اتصال',
};

function labelForCacheName(name: string): string {
  if (name === 'market-saved-ads') {
    return CACHE_LABELS['market-saved-ads'] ?? name;
  }

  const base = name.replace(/-v\d+$/, '');
  return CACHE_LABELS[base] ?? name;
}

function isClearable(name: string): boolean {
  // كل كاشات market-* قابلة للمسح من الواجهة عدا ما قد يُعاد بناؤه تلقائيًا
  return name.startsWith('market-');
}

async function measureCache(name: string): Promise<{ entries: number; bytes: number }> {
  try {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    let bytes = 0;
    // قياس عيّنة/كامل بحذر — clone + blob لكل مدخل
    await Promise.all(
      keys.map(async (req) => {
        try {
          const res = await cache.match(req);
          if (!res) return;
          const blob = await res.clone().blob();
          bytes += blob.size;
        } catch {
          // تجاهل مدخل فاشل
        }
      }),
    );
    return { entries: keys.length, bytes };
  } catch {
    return { entries: 0, bytes: 0 };
  }
}

export async function collectStorageStats(): Promise<StorageStats> {
  if (typeof window === 'undefined' || typeof caches === 'undefined') {
    return {
      caches: [],
      totalBytes: 0,
      totalEntries: 0,
      quotaBytes: null,
      usageBytes: null,
      supported: false,
    };
  }

  const names = (await caches.keys()).filter((n) => n.startsWith('market-'));
  const cachesStats: CacheBucketStat[] = [];

  for (const name of names) {
    const { entries, bytes } = await measureCache(name);
    cachesStats.push({
      name,
      label: labelForCacheName(name),
      entries,
      bytes,
      clearable: isClearable(name),
    });
  }

  // ترتيب: الأكبر أولًا
  cachesStats.sort((a, b) => b.bytes - a.bytes);

  let quotaBytes: number | null = null;
  let usageBytes: number | null = null;
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      quotaBytes = est.quota ?? null;
      usageBytes = est.usage ?? null;
    }
  } catch {
    // غير مدعوم
  }

  const totalBytes = cachesStats.reduce((s, c) => s + c.bytes, 0);
  const totalEntries = cachesStats.reduce((s, c) => s + c.entries, 0);

  return {
    caches: cachesStats,
    totalBytes,
    totalEntries,
    quotaBytes,
    usageBytes,
    supported: true,
  };
}

/** مسح كاش واحد بالاسم */
export async function clearCacheByName(name: string): Promise<void> {
  if (typeof caches === 'undefined') return;
  await caches.delete(name);
}

/** مسح كل كاشات market-* (لا يمس IndexedDB للطابور ولا localStorage) */
export async function clearAllMarketCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  const names = await caches.keys();
  await Promise.all(
    names.filter((n) => n.startsWith('market-')).map((n) => caches.delete(n)),
  );
}

/**
 * مسح بيانات التصفح المؤقت فقط (صفحات/API/صور/core/shell)
 * مع الإبقاء على الإعلانات المحفوظة يدويًا (market-saved-ads).
 */
export async function clearBrowsableCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((n) => n.startsWith('market-') && n !== 'market-saved-ads')
      .map((n) => caches.delete(n)),
  );
}

export function formatStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 بايت';
  const units = ['بايت', 'ك.ب', 'م.ب', 'ج.ب'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : i === 1 ? 0 : 1;
  return `${v.toFixed(digits)} ${units[i]}`;
}
