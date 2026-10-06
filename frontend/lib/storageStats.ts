/**
 * إحصائيات التخزين المحلي للـ PWA — Cache Storage + تقديرات IndexedDB/التنزيلات.
 */

import { listCatalogDownloads } from '@/lib/downloadStorage';
import { listAdDrafts } from '@/lib/offlineAdDrafts';

export interface CacheBucketStat {
  name: string;
  label: string;
  entries: number;
  bytes: number;
  clearable: boolean;
}

export interface LocalDataExtras {
  catalogDownloads: number;
  catalogBytes: number;
  offlineDrafts: number;
  pendingDrafts: number;
}

export interface StorageStats {
  caches: CacheBucketStat[];
  totalBytes: number;
  totalEntries: number;
  quotaBytes: number | null;
  usageBytes: number | null;
  supported: boolean;
  extras: LocalDataExtras;
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
  return name.startsWith('market-');
}

async function measureCache(name: string): Promise<{ entries: number; bytes: number }> {
  try {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    let bytes = 0;
    await Promise.all(
      keys.map(async (req) => {
        try {
          const res = await cache.match(req);
          if (!res) return;
          const blob = await res.clone().blob();
          bytes += blob.size;
        } catch {
          /* ignore */
        }
      }),
    );
    return { entries: keys.length, bytes };
  } catch {
    return { entries: 0, bytes: 0 };
  }
}

/**
 * كان listAdDrafts() يُستدعى بلا userId،
 * فتُحتسب مسودات كل المستخدمين على نفس الجهاز في إحصائيات المستخدم
 * الحالي. المظهر: مستخدم B يسجّل دخول على جهاز مشترك → يرى عدد مسودات A
 * في "التخزين والبيانات" رغم أنه لا يملكها. الآن يُمرَّر userId (نفس
 * ما تفعله SyncCenterClient.tsx) لتصفية المسودات بحسب الملكية.
 */
async function collectExtras(userId?: string | null): Promise<LocalDataExtras> {
  let catalogDownloads = 0;
  let catalogBytes = 0;
  let offlineDrafts = 0;
  let pendingDrafts = 0;
  try {
    const catalogs = listCatalogDownloads();
    catalogDownloads = catalogs.length;
    catalogBytes = catalogs.reduce((s, c) => s + (c.sizeBytes ?? 0), 0);
  } catch {
    /* ignore */
  }
  try {
    const drafts = await listAdDrafts(userId);
    offlineDrafts = drafts.length;
    pendingDrafts = drafts.filter(
      (d) => d.status === 'pending_sync' || d.status === 'failed',
    ).length;
  } catch {
    /* ignore */
  }
  return { catalogDownloads, catalogBytes, offlineDrafts, pendingDrafts };
}

/**
 * يقبل userId اختياريًا لتصفية مسودات
 * المستخدم الحالي (نفس سبب collectExtras أعلاه). مرّر userId دومًا من
 * أي واجهة تعرضها لمستخدم مسجّل.
 */
export async function collectStorageStats(
  userId?: string | null,
): Promise<StorageStats> {
  const emptyExtras: LocalDataExtras = {
    catalogDownloads: 0,
    catalogBytes: 0,
    offlineDrafts: 0,
    pendingDrafts: 0,
  };

  if (typeof window === 'undefined' || typeof caches === 'undefined') {
    return {
      caches: [],
      totalBytes: 0,
      totalEntries: 0,
      quotaBytes: null,
      usageBytes: null,
      supported: false,
      extras: emptyExtras,
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
    /* ignore */
  }

  const extras = await collectExtras(userId);
  const totalBytes =
    cachesStats.reduce((s, c) => s + c.bytes, 0) + extras.catalogBytes;
  const totalEntries =
    cachesStats.reduce((s, c) => s + c.entries, 0) +
    extras.catalogDownloads +
    extras.offlineDrafts;

  return {
    caches: cachesStats,
    totalBytes,
    totalEntries,
    quotaBytes,
    usageBytes,
    supported: true,
    extras,
  };
}

export async function clearCacheByName(name: string): Promise<void> {
  if (typeof caches === 'undefined') return;
  await caches.delete(name);
}

export async function clearAllMarketCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  const names = await caches.keys();
  await Promise.all(
    names.filter((n) => n.startsWith('market-')).map((n) => caches.delete(n)),
  );
}

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
