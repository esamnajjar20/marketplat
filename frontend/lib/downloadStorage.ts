/**
 * سجل تنزيلات الكتالوج + ربط IndexedDB للمحتوى الكامل (تصفح دون نت).
 */

import { localGet, localSet } from '@/lib/localStore';
import {
  idbPutCatalog,
  idbDeleteCatalog,
  openCatalogOffline,
} from '@/lib/catalogIdb';

const KEY = 'catalog-downloads';

export interface CatalogDownloadRecord {
  id: string;
  storeId: string;
  storeName: string;
  productCount: number;
  fileName: string;
  /** وقت آخر حفظ/تحديث لهذه النسخة المحلية */
  downloadedAt: string;
  /** هل المحتوى محفوظ في IndexedDB للفتح دون نت */
  hasOfflineBody?: boolean;
  /** حجم النسخة المحفوظة (بايت) — لعرضه للمستخدم في قائمة المحفوظات */
  sizeBytes?: number;
}

/** تحويل حجم بالبايت إلى نص مقروء (كيلوبايت/ميجابايت) بالعربية. */
export function formatCatalogSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} بايت`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} كيلوبايت`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} ميجابايت`;
}

function readList(): CatalogDownloadRecord[] {
  return localGet<CatalogDownloadRecord[]>(KEY, []);
}

/**
 * قبل، `slice(0, 50)` كان يحذف من localStorage
 * فقط — IndexedDB (catalogIdb) يبقى بـ HTML الكامل للأبد. الآن نحذف
 * الأجسام المُقصاة أيضاً (نفس نمط SAVED-ADS-LEAK-01).
 */
function writeList(list: CatalogDownloadRecord[]) {
  const kept = list.slice(0, 50);
  const evicted = list.slice(50);
  localSet(KEY, kept);
  if (evicted.length > 0) {
    void Promise.all(
      evicted.map((r) => idbDeleteCatalog(r.id).catch(() => undefined)),
    );
  }
}

export function listCatalogDownloads(): CatalogDownloadRecord[] {
  return readList().sort(
    (a, b) => new Date(b.downloadedAt).getTime() - new Date(a.downloadedAt).getTime(),
  );
}

export async function recordCatalogDownload(input: {
  storeId: string;
  storeName: string;
  productCount: number;
  fileName: string;
  html?: string;
}): Promise<CatalogDownloadRecord> {
  const list = readList().filter((r) => r.storeId !== input.storeId);
  const entry: CatalogDownloadRecord = {
    id: crypto.randomUUID(),
    storeId: input.storeId,
    storeName: input.storeName,
    productCount: input.productCount,
    fileName: input.fileName,
    downloadedAt: new Date().toISOString(),
    hasOfflineBody: Boolean(input.html),
    sizeBytes: input.html ? new Blob([input.html]).size : undefined,
  };

  if (input.html) {
    try {
      await idbPutCatalog({
        id: entry.id,
        storeId: entry.storeId,
        storeName: entry.storeName,
        fileName: entry.fileName,
        productCount: entry.productCount,
        html: input.html,
        savedAt: entry.downloadedAt,
      });
      entry.hasOfflineBody = true;
    } catch {
      entry.hasOfflineBody = false;
    }
  }

  writeList([entry, ...list]);
  return entry;
}

export async function removeCatalogDownload(id: string): Promise<void> {
  writeList(readList().filter((r) => r.id !== id));
  try {
    await idbDeleteCatalog(id);
  } catch {
    /* ignore */
  }
}

export function clearCatalogDownloads(): void {
  const ids = readList().map((r) => r.id);
  writeList([]);
  void Promise.all(ids.map((id) => idbDeleteCatalog(id).catch(() => undefined)));
}

export { openCatalogOffline };
