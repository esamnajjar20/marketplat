/**
 * __tests__/unit/lib/downloadStorage.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map<string, string>();

vi.mock('@/lib/localStore', () => ({
  localGet: <T,>(key: string, fallback: T): T => {
    const raw = store.get(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  localSet: (key: string, value: unknown) => {
    store.set(key, JSON.stringify(value));
  },
}));

vi.mock('@/lib/catalogIdb', () => ({
  idbPutCatalog: vi.fn().mockResolvedValue(undefined),
  idbDeleteCatalog: vi.fn().mockResolvedValue(undefined),
  idbGetCatalog: vi.fn().mockResolvedValue(null),
}));

describe('downloadStorage', () => {
  beforeEach(() => {
    store.clear();
    vi.resetModules();
  });

  it('formatCatalogSize formats bytes', async () => {
    const { formatCatalogSize } = await import('@/lib/downloadStorage');
    expect(formatCatalogSize(undefined)).toBeTruthy();
    expect(formatCatalogSize(0)).toBeTruthy();
    expect(formatCatalogSize(2048)).toMatch(/2|KB|ك/);
  });

  it('listCatalogDownloads starts empty', async () => {
    const { listCatalogDownloads } = await import('@/lib/downloadStorage');
    expect(listCatalogDownloads()).toEqual([]);
  });

  it('recordCatalogDownload then list contains entry', async () => {
    const { recordCatalogDownload, listCatalogDownloads, removeCatalogDownload } =
      await import('@/lib/downloadStorage');

    const entry = await recordCatalogDownload({
      storeId: 's1',
      storeName: 'متجر',
      productCount: 3,
      fileName: 'c.html',
      html: '<html></html>',
    });

    expect(entry.storeId).toBe('s1');
    expect(listCatalogDownloads().some((r) => r.storeId === 's1')).toBe(true);

    await removeCatalogDownload(entry.id);
    expect(listCatalogDownloads().every((r) => r.id !== entry.id)).toBe(true);
  });

  it('clearCatalogDownloads empties the list', async () => {
    const { recordCatalogDownload, clearCatalogDownloads, listCatalogDownloads } =
      await import('@/lib/downloadStorage');

    await recordCatalogDownload({
      storeId: 's2',
      storeName: 'ب',
      productCount: 1,
      fileName: 'x.html',
    });
    await clearCatalogDownloads();
    expect(listCatalogDownloads()).toEqual([]);
  });
});
