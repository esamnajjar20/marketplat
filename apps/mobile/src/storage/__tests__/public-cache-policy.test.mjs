import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPublicCacheEntryUsable,
  maxCacheAgeForKey,
  planPublicCacheEviction,
  PUBLIC_CACHE_MAX_STALE_MS,
  PRIVATE_CACHE_MAX_STALE_MS,
} from '../public-cache-policy.mjs';

test('public and private snapshots have separate maximum stale windows', () => {
  const now = 1_000_000_000;
  assert.equal(maxCacheAgeForKey('api-private:user-1:/api/v1/orders'), PRIVATE_CACHE_MAX_STALE_MS);
  assert.equal(maxCacheAgeForKey('api-public:/api/v1/ads'), PUBLIC_CACHE_MAX_STALE_MS);
  assert.equal(isPublicCacheEntryUsable('api-private:user-1:/orders', now - PRIVATE_CACHE_MAX_STALE_MS, now), true);
  assert.equal(isPublicCacheEntryUsable('api-private:user-1:/orders', now - PRIVATE_CACHE_MAX_STALE_MS - 1, now), false);
  assert.equal(isPublicCacheEntryUsable('api-public:/ads', now - PUBLIC_CACHE_MAX_STALE_MS, now), true);
  assert.equal(isPublicCacheEntryUsable('api-public:/ads', now - PUBLIC_CACHE_MAX_STALE_MS - 1, now), false);
});

test('cache records with invalid or implausibly future timestamps are rejected', () => {
  const now = 1_000_000;
  assert.equal(isPublicCacheEntryUsable('api-public:ads', Number.NaN, now), false);
  assert.equal(isPublicCacheEntryUsable('api-public:ads', 0, now), false);
  assert.equal(isPublicCacheEntryUsable('api-public:ads', now + 6 * 60 * 1_000, now), false);
  assert.equal(isPublicCacheEntryUsable('api-public:ads', now + 60 * 1_000, now), true);
});

test('eviction enforces byte budget when entries have uneven sizes', () => {
  const entries = [
    { cacheKey: 'new-large', savedAt: 10, sizeBytes: 5_500 },
    { cacheKey: 'old-tiny-1', savedAt: 9, sizeBytes: 100 },
    { cacheKey: 'old-tiny-2', savedAt: 8, sizeBytes: 100 },
    { cacheKey: 'old-medium', savedAt: 7, sizeBytes: 1_000 },
  ];
  assert.deepEqual(planPublicCacheEviction(entries, { maxEntries: 100, maxBytes: 6_000 }), ['old-medium']);
});

test('eviction enforces both count and byte budgets in one pass', () => {
  const entries = Array.from({ length: 6 }, (_, index) => ({
    cacheKey: `item-${index}`,
    savedAt: 100 - index,
    sizeBytes: 300,
  }));
  assert.deepEqual(planPublicCacheEviction(entries, { maxEntries: 4, maxBytes: 1_000 }), [
    'item-3', 'item-4', 'item-5',
  ]);
});
