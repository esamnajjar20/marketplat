/** Dependency-free guardrails for the unified offline mutation outbox. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const client = read('api/client.ts');
const queue = read('lib/offlineQueue.ts');
const sw = read('public/sw.js');
const cacheVersion = read('lib/cacheVersion.ts');
const warmingContract = read('lib/warmingQueryContract.ts');
const tests = read('__tests__/unit/api/client.test.ts');
const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });

check('API client does not fast-fail offline mutations before transport/SW interception', !client.includes('throw makeOfflineError()') && !/navigator\.onLine\s*===\s*false[\s\S]{0,220}throw makeOfflineError/.test(client));
check('202 queued responses are converted to OFFLINE_QUEUED rather than false success', client.includes("response.status === 202 && body?.queued === true") && client.includes("code:       'OFFLINE_QUEUED'"));
check('page-side fallback uses the SW queue database and requests schema', queue.includes("market-offline-queue") && queue.includes("const STORE_NAME = 'requests'") && queue.includes("status: 'pending'"));
check('page-side fallback binds every entry to the current account', queue.includes("getCurrentOfflineUserId() !== input.ownerUserId") && queue.includes('ownerUserId: input.ownerUserId'));
check('access and CSRF tokens are stripped before persistence', /'authorization', 'x-csrf-token'/.test(queue) && queue.includes('PAGE_QUEUE_STRIP_HEADERS'));
check('multipart fallback serializes body and matching boundary together', queue.includes('new Request(url, { method, headers, body: input.body })') && queue.includes('await request.blob()'));
check('large request bodies fail explicitly instead of being falsely reported queued', queue.includes('MAX_PAGE_QUEUE_BODY_BYTES = 6 * 1024 * 1024') && queue.includes("reason: 'body-too-large'"));
check('auth, CSRF, presence, analytics, and read-batch are not replayed as offline mutations', queue.includes("url.pathname.includes('/auth/')") && queue.includes("url.pathname.endsWith('/users/me/presence')") && queue.includes("url.pathname.endsWith('/analytics/events')") && queue.includes("url.pathname.endsWith('/batch')"));
check('SW handles unsafe same-origin API mutations through handleMutation', sw.includes('event.respondWith(handleMutation(request))') && sw.includes('request.method !== \'GET\' && request.method !== \'OPTIONS\''));
check('message image/file/audio POSTs retain stable operation IDs', /messages\(\?:\\\/\(\?:image\|file\|audio\)\)\?/.test(client));
check('Service Worker and TypeScript cache versions stay synchronized', cacheVersion.match(/SW_CACHE_VERSION = '([^']+)'/)?.[1] === sw.match(/const CACHE_VERSION = '([^']+)'/)?.[1]);
check('private warming endpoints remain explicitly user-scoped', warmingContract.includes("scope: 'user'") && warmingContract.includes("id: 'me', path: '/users/me'") && warmingContract.includes("path: '/sales?page=1&limit=12'") && warmingContract.includes("path: '/service-requests/incoming?page=1&limit=10'"));
check('personal business/sales snapshots use a bounded medium TTL', read('lib/offlineWarmingUserData.ts').includes('medium: 30 * 60 * 1000') && read('lib/offlineWarmingUserData.ts').includes('MEDIUM_TTL_ENDPOINT_IDS'));
check('regression test covers offline mutations reaching transport', tests.includes('does not reject a mutation before the Service Worker can queue it'));

for (const item of checks) console.log(`[offline-all-operations] ${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
console.log(`[offline-all-operations] ${checks.filter((item) => item.ok).length}/${checks.length} checks passed`);
if (checks.some((item) => !item.ok)) process.exitCode = 1;
