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
  downloadedAt: string;
  /** هل المحتوى محفوظ في IndexedDB للفتح دون نت */
  hasOfflineBody?: boolean;
}

function readList(): CatalogDownloadRecord[] {
  return localGet<CatalogDownloadRecord[]>(KEY, []);
}

function writeList(list: CatalogDownloadRecord[]) {
  localSet(KEY, list.slice(0, 50));
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
