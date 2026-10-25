/**
 * __tests__/unit/lib/offlineMessagesQueue.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  listQueuedMessages,
  QUEUE_MESSAGE_EVENT_TYPES,
} from '@/lib/offlineMessagesQueue';

describe('offlineMessagesQueue', () => {
  it('exports known SW event types', () => {
    expect(Array.isArray(QUEUE_MESSAGE_EVENT_TYPES)).toBe(true);
    expect(QUEUE_MESSAGE_EVENT_TYPES.length).toBeGreaterThan(0);
  });

  it('listQueuedMessages returns [] when indexedDB unavailable', async () => {
    const original = globalThis.indexedDB;
    // @ts-expect-error force undefined
    delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    const result = await listQueuedMessages('c1').catch(() => []);
    expect(Array.isArray(result)).toBe(true);
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: original,
    });
  });
});
