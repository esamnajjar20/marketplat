#!/usr/bin/env node
/**
 * Measures the REAL edge hit ratio from the outside (no dashboard needed).
 *
 *   node workers/cf-api-proxy/cache-probe.mjs https://api.example.com [rounds=3]
 *
 * Requests a fixed set of public URLs several times — each once with a different
 * query-param order/encoding to prove the inner cache-key normalisation — then prints
 * Workers Cache Cf-Cache-Status (outer cache) and x-proxy-cache (inner fallback).
 * A healthy deployment should show Workers-HIT/UPDATING or inner HIT/STALE/KV-HIT
 * from round 2. Missing Cf-Cache-Status usually means cache.enabled is not deployed.
 */
const base = (process.argv[2] || '').replace(/\/$/, '');
const rounds = Number(process.argv[3] || 3);
if (!/^https?:\/\//.test(base)) {
  console.error('usage: cache-probe.mjs <https://api-base> [rounds]');
  process.exit(2);
}

const paths = [
  '/api/v1/categories',
  '/api/v1/home/static',
  '/api/v1/ads?limit=10',
  '/api/v1/ads?sort=latest&city=%D8%BA%D8%B2%D8%A9',
  '/api/v1/ads?city=غزة&sort=latest', // same key as the line above
  '/api/v1/products?limit=10',
  '/api/v1/stores?limit=10',
];

const stats = new Map();
const add = (status, ms) => {
  const e = stats.get(status) || { n: 0, ms: [] };
  e.n += 1;
  e.ms.push(ms);
  stats.set(status, e);
};

for (let r = 1; r <= rounds; r += 1) {
  for (const p of paths) {
    const t0 = performance.now();
    try {
      const res = await fetch(base + encodeURI(decodeURI(p)), { headers: { accept: 'application/json' } });
      await res.arrayBuffer();
      const nativeStatus = res.headers.get('cf-cache-status');
      const innerStatus = res.headers.get('x-proxy-cache');
      add(nativeStatus ? `WORKERS-${nativeStatus.toUpperCase()}` : (innerStatus || `NO-HEADER(${res.status})`), performance.now() - t0);
    } catch (e) {
      add(`ERROR(${e.cause?.code || e.message})`, performance.now() - t0);
    }
  }
}

const total = [...stats.values()].reduce((a, b) => a + b.n, 0);
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log(`\n${total} requests, ${rounds} rounds\n`);
for (const [status, e] of [...stats].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`${status.padEnd(18)} ${String(e.n).padStart(4)}  ${((e.n / total) * 100).toFixed(0).padStart(3)}%  median ${median(e.ms).toFixed(0)}ms`);
}
const good = new Set(['HIT', 'HIT-304', 'STALE', 'KV-HIT', 'KV-STALE', 'SHARED', 'WORKERS-HIT', 'WORKERS-UPDATING', 'WORKERS-STALE', 'WORKERS-REVALIDATED']);
const served = [...stats].filter(([k]) => good.has(k)).reduce((a, [, e]) => a + e.n, 0);
// Round 1 is cold by definition: report the steady-state ratio too.
console.log(`\nhit ratio (all rounds): ${((served / total) * 100).toFixed(0)}%`);
if (!stats.size || [...stats.keys()].every((k) => k.startsWith('NO-HEADER')))
  console.log('No cache diagnostics: verify this URL is attached to the API Worker.');
if (![...stats.keys()].some((k) => k.startsWith('WORKERS-')))
  console.log('No Cf-Cache-Status observed: check Wrangler >= 4.69.0 and [cache].enabled = true.');
