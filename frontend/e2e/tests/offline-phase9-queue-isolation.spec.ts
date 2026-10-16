import { expect, test } from '@playwright/test';

const OP_ID = 'e2e-phase9-operation-0001';
const OWNER_ID = 'e2e-owner-isolation-user';

test('offline create request queues stable operation identity and owner without credentials', async ({ page, context }) => {
  await page.goto('/offline');
  const ready = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    await navigator.serviceWorker.ready;
    return Boolean(navigator.serviceWorker.controller);
  });
  test.skip(!ready, 'An active controlling service worker is required for this integration test');

  let queuedId: number | null = null;
  try {
    await context.setOffline(true);
    const response = await page.evaluate(async ({ operationId, ownerId }) => {
      const result = await fetch('/api/v1/ads', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-offline-op-id': operationId,
          authorization: `Bearer e30.${btoa(JSON.stringify({ userId: ownerId, exp: Math.floor(Date.now() / 1000) + 3600 }))}.e2e-signature`,
        },
        body: JSON.stringify({ title: 'E2E offline queued listing', description: 'Offline queue integration check' }),
      });
      let body: Record<string, unknown> = {};
      try { body = await result.json(); } catch { /* response body may be empty */ }
      return { status: result.status, body };
    }, { operationId: OP_ID, ownerId: OWNER_ID });
    expect(response.status).toBe(202);
    expect(response.body.queued).toBe(true);

    const queued = await page.evaluate(async (operationId) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('market-offline-queue', 2);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const names = Array.from(db.objectStoreNames);
        const queueName = names.includes('requests') ? 'requests' : names.find((name) => /queue|mutation|operation/i.test(name));
        if (!queueName) return [];
        return await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
          const tx = db.transaction(queueName, 'readonly');
          const request = tx.objectStore(queueName).getAll();
          request.onsuccess = () => resolve((request.result as Array<Record<string, unknown>>).filter((row) => row.operationId === operationId));
          request.onerror = () => reject(request.error);
        });
      } finally { db.close(); }
    }, OP_ID);
    const operationId = queued[0]?.operationId;
    expect(queued[0].operationId).toBe(OP_ID);
    expect(queued[0].ownerUserId).toBe(OWNER_ID);
    expect(queued[0].needsAuth).toBe(true);
    expect(JSON.stringify(queued[0]?.headers ?? {}).toLowerCase()).not.toContain('authorization');

    const id = queued[0]?.id;
    if (typeof id === 'number') queuedId = id;
  } finally {
    await context.setOffline(false);
    if (queuedId !== null) {
      await page.evaluate(async (id) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('market-offline-queue', 2);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          const queueName = db.objectStoreNames.contains('requests') ? 'requests' : Array.from(db.objectStoreNames).find((name) => /queue|mutation|operation/i.test(name));
          if (!queueName) return;
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(queueName, 'readwrite');
            tx.objectStore('requests').delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
        } finally { db.close(); }
      }, queuedId);
    }
  }
});
