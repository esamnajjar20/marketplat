import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const client = read('src/api/client.ts');
const cache = read('src/storage/public-cache.ts');
for (const endpoint of ['appointments', 'orders', 'requests', 'sales', 'sellers']) {
  assert.ok(client.includes(`\\/${endpoint}`), `missing private cache allowlist family: ${endpoint}`);
}
assert.ok(client.includes('api-private:${encodeURIComponent(ownerId)}:${path}'), 'private cache key must be owner-scoped');
assert.ok(client.includes("method.toUpperCase() !== 'GET'"), 'only GET requests may be read from the cache');
assert.ok(client.includes('await clearPrivateCache()'), 'successful mutations must invalidate private cached views');
assert.ok(cache.includes("DELETE FROM public_cache WHERE cache_key LIKE 'api-private:%'"), 'private cache invalidation must not clear public cache');
for (const [file, signature] of [
  ['src/features/appointments/appointments.api.ts', 'cacheOwnerId:ownerId??undefined'],
  ['src/features/requests/requests.api.ts', 'cacheOwnerId:ownerId??undefined'],
  ['src/features/commerce/orders.api.ts', 'cacheOwnerId: ownerId ?? undefined'],
  ['src/features/sales/sales.api.ts', 'cacheOwnerId: ownerId ?? undefined'],
  ['src/features/sales/sales-extra.api.ts', 'cacheOwnerId: ownerId ?? undefined'],
]) assert.ok(read(file).includes(signature), `${file} must pass account owner to private cache`);
console.log('Offline-first private feature cache checks passed');
