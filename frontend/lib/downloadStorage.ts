/**
 * سجل تنزيلات كتالوجات المتاجر — محلي فقط (metadata).
 * الملف نفسه يُحمَّل للجهاز؛ الصفحة تعرض السجل وروابط إعادة التحميل من المتجر.
 */

const KEY = 'marketplat:catalog-downloads';

export interface CatalogDownloadRecord {
  id: string;
  storeId: string;
  storeName: string;
  productCount: number;
  fileName: string;
  downloadedAt: string;
}

function readList(): CatalogDownloadRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CatalogDownloadRecord[];
  } catch {
    return [];
  }
}

function writeList(list: CatalogDownloadRecord[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    /* quota */
  }
}

export function listCatalogDownloads(): CatalogDownloadRecord[] {
  return readList().sort(
    (a, b) => new Date(b.downloadedAt).getTime() - new Date(a.downloadedAt).getTime(),
  );
}

export function recordCatalogDownload(input: {
  storeId: string;
  storeName: string;
  productCount: number;
  fileName: string;
}): CatalogDownloadRecord {
  const list = readList().filter((r) => r.storeId !== input.storeId);
  const entry: CatalogDownloadRecord = {
    id: crypto.randomUUID(),
    storeId: input.storeId,
    storeName: input.storeName,
    productCount: input.productCount,
    fileName: input.fileName,
    downloadedAt: new Date().toISOString(),
  };
  writeList([entry, ...list]);
  return entry;
}

export function removeCatalogDownload(id: string) {
  writeList(readList().filter((r) => r.id !== id));
}

export function clearCatalogDownloads() {
  writeList([]);
}
