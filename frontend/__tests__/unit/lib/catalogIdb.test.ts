/**
 * __tests__/unit/lib/catalogIdb.test.ts
 */
import { describe, it, expect } from 'vitest';
import { idbPutCatalog } from '@/lib/catalogIdb';

describe('catalogIdb', () => {
  it('rejects or returns null when indexedDB is unavailable', async () => {
    const original = globalThis.indexedDB;
    // @ts-expect-error indexedDB is intentionally removed for this test
    delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;

    await expect(
      idbPutCatalog({
        id: 'c1',
        storeId: 's1',
        storeName: 'متجر',
        fileName: 'x.html',
        productCount: 1,
        html: '<html></html>',
        savedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow();

    // restore for other tests
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: original,
    });
  });
});
