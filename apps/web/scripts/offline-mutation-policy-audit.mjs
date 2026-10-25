import fs from 'node:fs';
const policy = fs.readFileSync(new URL('../lib/offlineMutationPolicy.ts', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const queue = fs.readFileSync(new URL('../lib/offlineQueue.ts', import.meta.url), 'utf8');
const favorite = fs.readFileSync(new URL('../lib/offlineFavoriteIntents.ts', import.meta.url), 'utf8');
const publisher = fs.readFileSync(new URL('../lib/offlineDraftPublisher.ts', import.meta.url), 'utf8');
const appointment = fs.readFileSync(new URL('../lib/offlineAppointmentDrafts.ts', import.meta.url), 'utf8');
const syncCenter = fs.readFileSync(new URL('../components/settings/SyncCenterClient.tsx', import.meta.url), 'utf8');
const bootstrap = fs.readFileSync(new URL('../components/pwa/OfflineBootstrap.tsx', import.meta.url), 'utf8');
const adHook = fs.readFileSync(new URL('../hooks/mutations/useAdMutations.ts', import.meta.url), 'utf8');
const productHook = fs.readFileSync(new URL('../hooks/mutations/useProductMutations.ts', import.meta.url), 'utf8');
const serviceHook = fs.readFileSync(new URL('../hooks/mutations/useServiceListingMutations.ts', import.meta.url), 'utf8');
const requestHook = fs.readFileSync(new URL('../hooks/mutations/useRequestMutations.ts', import.meta.url), 'utf8');
const checks = [
 ['policy fails closed', /return false;/.test(policy)],
 ['payments excluded', /payments\|checkout/.test(policy)],
 ['appointments excluded', /appointments/.test(policy)],
 ['favorites toggle excluded from blind queue', /favorites/.test(policy)],
 ['content creation replay requires operation id', /method === 'POST' && Boolean\(input\.operationId\)/.test(policy)],
 ['SW checks explicit policy before fetch', /if \(!isOfflineMutationQueueAllowed\(request\)\) return fetch\(request\)/.test(sw)],
 ['page fallback uses policy', /isOfflineMutationQueueAllowed/.test(queue)],
 ['favorite sync checks desired state before toggle', /actual !== intent\.desired/.test(favorite)],
 ['favorite intents persist per user', /userId.*desired/.test(favorite)],
 ['products/services can publish without images', /Image-free products\/services remain valid/.test(publisher)],
 ['incomplete attachments stop auto-publish', /publishFilesIncomplete/.test(publisher)],
 ['appointments are persisted locally', /pending_confirmation/.test(appointment)],
 ['appointments are visible in sync center', /طلبات مواعيد غير مؤكدة/.test(syncCenter)],
 ['appointments require user-confirmed retry', /handleRetryAppointmentDraft/.test(syncCenter)],
 ['favorite intents are visible and discardable in sync center', /تغييرات المفضلة المعلّقة/.test(syncCenter) && /handleDiscardFavoriteIntent/.test(syncCenter)],
 ['manual sync includes favorite intents', /syncOfflineFavoriteIntents\(userId\)/.test(syncCenter)],
 ['ads create become pending_sync offline', /kind: 'ad'[\s\S]*?status: \(offline \|\| parsed\.queued\) \? 'pending_sync'/.test(adHook)],
 ['products create become pending_sync offline', /kind: 'product'[\s\S]*?status: \(offline \|\| parsed\.queued\) \? 'pending_sync'/.test(productHook)],
 ['services create become pending_sync offline', /kind: 'service'[\s\S]*?status: \(offline \|\| parsed\.queued\) \? 'pending_sync'/.test(serviceHook)],
 ['requests create become pending_sync offline', /kind: 'open-request'[\s\S]*?status: \(offline \|\| parsed\.queued\) \? 'pending_sync'/.test(requestHook)],
 ['online lifecycle replays queue then auto-publishes drafts', /replayThenPublishDrafts\(\)/.test(bootstrap) && /syncPendingOfflineDrafts/.test(bootstrap)],
];
let failures=0;
for (const [name, ok] of checks) { console.log(`${ok?'PASS':'FAIL'} ${name}`); if(!ok) failures++; }
if(failures) process.exit(1);
console.log(`Offline mutation policy audit: ${checks.length}/${checks.length} passed`);
