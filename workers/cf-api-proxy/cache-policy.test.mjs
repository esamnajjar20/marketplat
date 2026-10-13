import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./worker.js', import.meta.url), 'utf8')
  .replace('export default {', 'globalThis.__worker = {');
const cacheCalls = [];
const cache = {
  match: async (key) => { cacheCalls.push(['match', key.url]); return undefined; },
  put: async (key) => { cacheCalls.push(['put', key.url]); },
};
let upstreamCalls = 0;
const context = {
  URL, Request, Response, Headers, Map, Date, Math, String, Number, JSON, Promise, RegExp,
  console: { log() {}, error() {} },
  caches: { default: cache },
  fetch: async () => {
    upstreamCalls += 1;
    return new Response('{"ok":true}', {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'private, no-cache' },
    });
  },
};
vm.runInNewContext(`${source}\nglobalThis.__policy = { isUpstreamCacheable, makeCacheKey };`, context);
const { isUpstreamCacheable, makeCacheKey } = context.__policy;

assert.equal(isUpstreamCacheable(new Response('{}', { headers: { 'cache-control': 'public, max-age=60' } })), true);
assert.equal(isUpstreamCacheable(new Response('{}', { headers: { 'cache-control': 'private, no-cache' } })), false);
assert.equal(isUpstreamCacheable(new Response('{}', { headers: { 'cache-control': 'no-store' } })), false);
assert.equal(isUpstreamCacheable(new Response('{}', { headers: { 'cache-control': 'public, max-age=60', vary: 'Authorization' } })), false);
assert.equal(isUpstreamCacheable(new Response('{}', { headers: { 'cache-control': 'public, max-age=60', 'set-cookie': 'session=secret' } })), false);
assert.equal(isUpstreamCacheable(new Response('{}', { status: 503, headers: { 'cache-control': 'public, max-age=60' } })), false);
assert.equal(new URL(makeCacheKey(new URL('https://example.test/api/v1/ads?q=chair')).url).searchParams.get('__mp_cache_policy'), 'v2');

const response = await context.__worker.fetch(
  new Request('https://marketplat-api.esamnajjar6.workers.dev/api/v1/home/feed'),
  {},
  { waitUntil() {} },
);
assert.equal(response.status, 200);
assert.equal(response.headers.get('cache-control'), 'private, no-cache');
assert.equal(response.headers.get('x-proxy-cache'), 'BYPASS');
assert.equal(upstreamCalls, 1);
assert.equal(cacheCalls.some(([kind]) => kind === 'match' || kind === 'put'), false);

console.log('PASS API Worker cache policy: public-only storage, private route bypass, and cache-key versioning');
