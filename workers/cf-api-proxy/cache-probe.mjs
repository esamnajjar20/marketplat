#!/usr/bin/env node
/**
 * Measures the REAL edge hit ratio from the outside (no dashboard needed).
 *
 *   node workers/cf-api-proxy/cache-probe.mjs https://api.example.com [rounds=3]
 *
 * Requests a fixed set of public URLs several times — each once with a different
 * query-param order/encoding to prove key normalisation — then prints the
 * x-proxy-cache distribution and median latency per status. A healthy edge shows
 * HIT/STALE/KV-HIT dominating from round 2 on; mostly MISS/BYPASS-* means the
 * Cache API is not storing (e.g. running on *.workers.dev) or TTLs are too short.
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
      add(res.headers.get('x-proxy-cache') || `NO-HEADER(${res.status})`, performance.now() - t0);
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
const good = ['HIT', 'HIT-304', 'STALE', 'KV-HIT', 'KV-STALE', 'SHARED'];
const served = [...stats].filter(([k]) => good.includes(k)).reduce((a, [, e]) => a + e.n, 0);
// Round 1 is cold by definition: report the steady-state ratio too.
console.log(`\nhit ratio (all rounds): ${((served / total) * 100).toFixed(0)}%`);
if (!stats.size || [...stats.keys()].every((k) => k.startsWith('NO-HEADER')))
  console.log('No x-proxy-cache header: this URL is not going through the API Worker.');
