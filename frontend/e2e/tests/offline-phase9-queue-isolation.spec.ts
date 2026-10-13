import { expect, test } from '@playwright/test';

const QUEUE_DB = 'market-offline-queue';
const OP_ID = 'phase9-e2e-stable-operation-0001';
const OWNER_ID = 'phase9-owner-user-001';

/**
 * Phase 9: exercise the real service worker + IndexedDB queue in Chromium.
 * The request is deliberately synthetic and never reaches the backend because
 * the browser context is offline. This verifies persisted queue metadata, not
 * the complete publish form or a live backend idempotency transaction.
 */
test.describe('offline phase 9 queue identity', () => {
  test('persists a stable operation id and owner without storing the bearer token', async ({ page, context }) => {
    await page.goto('/offline');
    await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) throw new Error('Service workers are unsupported');
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    let queuedId: number | null = null;
    try {
      await context.setOffline(true);
      const response = await page.evaluate(async ({ operationId, ownerId }) => {
        const payload = btoa(JSON.stringify({ userId: ownerId })).replace(/=/g, '');
        const token = `header.${payload}.signature`;
        const result = await fetch('/api/v1/ads', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
            'x-offline-op-id': operationId,
          },
          body: JSON.stringify({ title: 'Phase 9 offline queue test' }),
        });
        return { status: result.status, body: await result.json() };
      }, { operationId: OP_ID, ownerId: OWNER_ID });

      expect(response.status).toBe(202);
      expect(response.body.queued).toBe(true);

      const queued = await page.evaluate(async ({ operationId }) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('market-offline-queue', 2);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          const rows = await new Promise<any[]>((resolve, reject) => {
            const request = db.transaction('requests', 'readonly').objectStore('requests').getAll();
            request.onsuccess = () => resolve(request.result ?? []);
            request.onerror = () => reject(request.error);
          });
          return rows.filter((row) => row.operationId === operationId).map((row) => ({
            id: row.id,
            operationId: row.operationId,
            ownerUserId: row.ownerUserId,
            headers: row.headers,
            needsAuth: row.needsAuth,
          }));
        } finally {
          db.close();
        }
      }, { operationId: OP_ID });

      expect(queued).toHaveLength(1);
      queuedId = queued[0].id;
      expect(queued[0].operationId).toBe(OP_ID);
      expect(queued[0].ownerUserId).toBe(OWNER_ID);
      expect(queued[0].needsAuth).toBe(true);
      expect(JSON.stringify(queued[0].headers).toLowerCase()).not.toContain('authorization');
    } finally {
      await context.setOffline(false);
      // Remove only this test's row, never clear unrelated queue entries.
      if (queuedId !== null) {
        await page.evaluate(async (id) => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('market-offline-queue', 2);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          try {
            await new Promise<void>((resolve, reject) => {
              const tx = db.transaction('requests', 'readwrite');
              tx.objectStore('requests').delete(id);
              tx.oncomplete = () => resolve();
              tx.onerror = () => reject(tx.error);
              tx.onabort = () => reject(tx.error);
            });
          } finally {
            db.close();
          }
        }, queuedId);
      }
    }
  });
});
