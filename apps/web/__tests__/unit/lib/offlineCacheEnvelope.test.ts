import { beforeEach, describe, expect, it, vi } from 'vitest';

const { records } = vi.hoisted(() => ({ records: new Map<string, unknown>() }));
vi.mock('@/lib/localStore', () => ({
  localGet: (key: string, fallback: unknown) => records.has(key) ? records.get(key) : fallback,
  localSet: (key: string, value: unknown) => { records.set(key, value); return true; },
  localRemove: (key: string) => { records.delete(key); },
}));

import {
  clearOfflineEnvelope,
  getOfflineEnvelope,
  saveOfflineEnvelope,
} from '@/lib/offlineCacheEnvelope';

describe('offlineCacheEnvelope', () => {
  beforeEach(() => records.clear());

  it('uses one envelope contract for JSON and list entries', () => {
    expect(saveOfflineEnvelope('json:key', 'data', { id: 1 }, 'user-a')).toBe(true);
    expect(getOfflineEnvelope('json:key', 'data', null, 'user-a')).toMatchObject({
      data: { id: 1 }, userId: 'user-a',
    });

    expect(saveOfflineEnvelope('list:key', 'items', [{ id: 2 }], null)).toBe(true);
    expect(getOfflineEnvelope('list:key', 'items', [], null)).toMatchObject({
      items: [{ id: 2 }], userId: null,
    });
  });

  it('refuses a different user and refuses legacy unscoped data for scoped reads', () => {
    saveOfflineEnvelope('private:key', 'data', { secret: true }, 'user-a');
    expect(getOfflineEnvelope('private:key', 'data', null, 'user-b')).toBeNull();
    expect(getOfflineEnvelope('private:key', 'data', null, null)).toBeNull();
  });

  it('rejects malformed records, invalid timestamps, and non-array list payloads', () => {
    records.set('malformed', { savedAt: new Date().toISOString() });
    expect(getOfflineEnvelope('malformed', 'data', null)).toBeNull();
    records.set('invalid-time', { data: 1, savedAt: 'not-a-date' });
    expect(getOfflineEnvelope('invalid-time', 'data', null)).toBeNull();
    records.set('bad-list', { items: {}, savedAt: new Date().toISOString() });
    expect(getOfflineEnvelope('bad-list', 'items', [])).toBeNull();
  });

  it('clears the shared envelope key', () => {
    saveOfflineEnvelope('clear:key', 'data', 3);
    clearOfflineEnvelope('clear:key');
    expect(getOfflineEnvelope('clear:key', 'data', null)).toBeNull();
  });
});
