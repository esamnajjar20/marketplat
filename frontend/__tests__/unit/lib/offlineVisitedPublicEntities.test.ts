import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  json: new Map<string, unknown>(),
  local: new Map<string, unknown>(),
}));

vi.mock('@/lib/offlineJsonCache', () => ({
  saveOfflineJson: (key: string, data: unknown) => { state.json.set(key, data); return true; },
  getOfflineJson: (key: string) => state.json.has(key) ? { data: state.json.get(key) } : null,
  clearOfflineJson: (key: string) => { state.json.delete(key); },
}));
vi.mock('@/lib/localStore', () => ({
  localGet: (key: string, fallback: unknown) => state.local.has(key) ? state.local.get(key) : fallback,
  localSet: (key: string, value: unknown) => { state.local.set(key, value); return true; },
}));

import {
  clearVisitedPublicServiceListing,
  clearVisitedPublicServiceListings,
  clearVisitedPublicStore,
  clearVisitedPublicStores,
  getVisitedPublicServiceListing,
  getVisitedPublicStore,
  saveVisitedPublicServiceListing,
  saveVisitedPublicStore,
} from '@/lib/offlineVisitedPublicEntities';

const store = (overrides: Record<string, unknown> = {}) => ({
  id: 'store-1', slug: 'store-one', status: 'ACTIVE', ...overrides,
}) as never;
const listing = (overrides: Record<string, unknown> = {}) => ({
  id: 'service-1', status: 'ACTIVE', ...overrides,
}) as never;

describe('visited public detail snapshots', () => {
  beforeEach(() => {
    state.json.clear();
    state.local.clear();
    vi.useRealTimers();
  });

  it('saves and restores active public stores by ID or slug', () => {
    saveVisitedPublicStore('store-one', store());
    expect(getVisitedPublicStore('store-one')?.id).toBe('store-1');
  });

  it('does not save non-public or mismatched store records', () => {
    saveVisitedPublicStore('store-1', store({ status: 'BLOCKED' }));
    saveVisitedPublicStore('another-store', store());
    expect(getVisitedPublicStore('store-1')).toBeNull();
    expect(getVisitedPublicStore('another-store')).toBeNull();
  });

  it('saves and restores only active public service listings', () => {
    saveVisitedPublicServiceListing('service-1', listing());
    expect(getVisitedPublicServiceListing('service-1')?.id).toBe('service-1');
    saveVisitedPublicServiceListing('paused', listing({ id: 'paused', status: 'PAUSED' }));
    expect(getVisitedPublicServiceListing('paused')).toBeNull();
  });

  it('clears one stale detail without deleting unrelated visited entities', () => {
    saveVisitedPublicStore('store-one', store());
    saveVisitedPublicStore('store-two', store({ id: 'store-2', slug: 'store-two' }));
    saveVisitedPublicServiceListing('service-1', listing());
    saveVisitedPublicServiceListing('service-2', listing({ id: 'service-2' }));

    clearVisitedPublicStore('store-one');
    clearVisitedPublicServiceListing('service-1');

    expect(getVisitedPublicStore('store-one')).toBeNull();
    expect(getVisitedPublicStore('store-two')?.id).toBe('store-2');
    expect(getVisitedPublicServiceListing('service-1')).toBeNull();
    expect(getVisitedPublicServiceListing('service-2')?.id).toBe('service-2');
  });

  it('expires snapshots and clears indexed records', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-02T12:00:00Z'));
    saveVisitedPublicStore('store-one', store());
    vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000 + 1);
    expect(getVisitedPublicStore('store-one')).toBeNull();

    saveVisitedPublicServiceListing('service-1', listing());
    clearVisitedPublicServiceListings();
    expect(getVisitedPublicServiceListing('service-1')).toBeNull();
    saveVisitedPublicStore('store-one', store());
    clearVisitedPublicStores();
    expect(getVisitedPublicStore('store-one')).toBeNull();
  });
});
