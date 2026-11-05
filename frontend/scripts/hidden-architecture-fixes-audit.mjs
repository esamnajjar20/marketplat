import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFile(resolve(root, path), 'utf8');
const checks = [];
function check(name, callback) {
  callback();
  checks.push(name);
}

const mediaStore = await read('lib/conversationMediaStore.ts');
const gallery = await read('components/messages/MessageMediaGallery.tsx');
const conversationQueries = await read('hooks/queries/useConversations.ts');
const messageInput = await read('components/messages/MessageInput.tsx');
const sw = await read('public/sw.js');
const service = await read('../apps/api/src/modules/conversations/conversations.service.ts');
const controller = await read('../apps/api/src/modules/conversations/conversations.controller.ts');
const cloudinaryGuard = await read('../apps/api/src/modules/conversations/cloudinaryMediaUrl.ts');
const uploads = await read('../apps/api/src/middlewares/upload.middleware.ts');
const mutations = await read('hooks/mutations/useConversationMutations.ts');
const objectUrlHook = await read('hooks/useObjectUrl.ts');

check('IndexedDB closes database handles in finally', () => {
  assert.match(mediaStore, /async function withDatabase[\s\S]*?finally\s*\{\s*db\.close\(\)/);
});
check('blocked IndexedDB upgrades close a connection that arrives late', () => {
  assert.match(mediaStore, /let wasBlocked = false/);
  assert.match(mediaStore, /if \(wasBlocked\) \{\s*db\.close\(\)/);
});
check('media cache budget never subtracts a record twice', () => {
  assert.match(mediaStore, /const removedKeys = new Set<string>\(\)/);
  assert.match(mediaStore, /if \(removedKeys\.has\(row\.key\)\) continue/);
});
check('media fetches are bounded by timeout and response bytes', () => {
  assert.match(mediaStore, /MEDIA_FETCH_TIMEOUT_MS/);
  assert.match(mediaStore, /MAX_CACHED_BLOB_BYTES/);
  assert.match(mediaStore, /reader\.cancel\(\)/);
});
check('direct Cloudinary media fetch omits unrelated site credentials', () => {
  assert.match(mediaStore, /fetchBounded\(parsed\.href, 'omit'\)/);
  assert.match(mediaStore, /credentials: RequestCredentials = 'include'/);
  assert.match(mediaStore, /credentials,\s*cache: 'no-store'/);
});
check('gallery calls all hooks before conditional returns', () => {
  const conditionalReturn = gallery.indexOf('if (loading && !allItems.length)');
  const finalHook = Math.max(gallery.lastIndexOf('useEffect('), gallery.lastIndexOf('useMemo('), gallery.lastIndexOf('useCallback('));
  assert.ok(conditionalReturn > finalHook, 'conditional render exits must follow all hooks');
});
check('gallery creates Blob URLs only in committed effects or callbacks', () => {
  assert.doesNotMatch(gallery, /useMemo\s*\([^)]*URL\.createObjectURL/s);
  assert.match(gallery, /useEffect\s*\(\s*\(\)\s*=>\s*\{[\s\S]*?URL\.createObjectURL/);
  assert.match(gallery, /URL\.revokeObjectURL/);
});
check('microphone permission resolution is guarded against unmount/navigation', () => {
  assert.match(messageInput, /getUserMedia\([\s\S]*?mountedRef\.current[\s\S]*?lifecycleRef\.current/);
  assert.match(messageInput, /recordingTimerRef/);
  assert.match(messageInput, /cancelRecordingRef\.current = false/);
  assert.match(messageInput, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
});
check('object URL hook revokes URLs when Blob changes or component unmounts', () => {
  assert.match(objectUrlHook, /useEffect/);
  assert.match(objectUrlHook, /URL\.createObjectURL\(blob\)/);
  assert.match(objectUrlHook, /URL\.revokeObjectURL\(nextUrl\)/);
});
check('object URL hook does not render a stale URL for a replacement Blob', () => {
  assert.match(objectUrlHook, /(?:ownedUrl\?\.blob|ownedUrl && ownedUrl\.blob) === blob \? ownedUrl\.url : null/);
});
check('gallery discards late Blob reads after unmount or conversation changes', () => {
  assert.match(gallery, /activeConversationRef/);
  assert.match(gallery, /if \(!mountedRef\.current \|\| activeConversationRef\.current !== conversationId\) return/);
  assert.match(gallery, /mountedRef\.current = false/);
});
check('opening the media gallery reads local cache instead of bulk-downloading every attachment', () => {
  assert.match(gallery, /getConversationMediaBlob/);
  const hydration = gallery.slice(gallery.indexOf('async function hydrate()'), gallery.indexOf('void hydrate()'));
  assert.match(hydration, /getConversationMediaBlob\(/);
  assert.doesNotMatch(hydration, /getOrCacheConversationMediaBlob\(/);
  assert.doesNotMatch(gallery, /cacheConversationMediaBlobs\(/);
  assert.match(conversationQueries, /void cacheConversationMediaBlobs\(userId, conversationId, items\)\.catch/);
  assert.doesNotMatch(hydration, /getOrCacheConversationMediaBlob\(/);
});
check('PDF preview revokes late URLs and cancels stale requests', async () => {
  const media = await read('components/messages/MessageMedia.tsx');
  assert.match(media, /previewRequestRef\.current !== requestId/);
  assert.match(media, /URL\.revokeObjectURL\(objectUrl\)/);
  assert.match(media, /setFilePreviewLoading\(false\)/);
});
check('offline queue enqueue deduplicates operation ids inside one write transaction', () => {
  assert.match(sw, /function queueRequestEntryOnDb[\s\S]*?store\.getAll\(\)[\s\S]*?existing\.find\([\s\S]*?operationId[\s\S]*?entryId = duplicate\.id/);
  assert.doesNotMatch(sw, /resolve\(duplicate\.id\)/);
});
check('offline queue lease uses one atomic IndexedDB readwrite transaction', () => {
  const claim = sw.slice(sw.indexOf('async function claimQueuedEntry'), sw.indexOf('async function releaseQueuedEntryLease'));
  assert.match(claim, /db\.transaction\(QUEUE_STORE_NAME, 'readwrite'\)/);
  assert.match(claim, /store\.get\(id\)/);
  assert.match(claim, /store\.put\(/);
});
check('message ordering is partitioned by conversation rather than globally', () => {
  assert.match(sw, /function getQueueOrderGroup[\s\S]*?`conversation:\$\{conversationId\}`/);
  assert.match(sw, /getQueueOrderGroup\(candidate\) !== orderGroup/);
  const orderMatcher = sw.slice(sw.indexOf('function isOrderSensitiveQueueEntry'), sw.indexOf('function getQueueOrderGroup'));
  assert.ok(orderMatcher.includes('messages|chat'));
  assert.ok(!orderMatcher.includes('messages|conversations|chat'));
});
check('Cloudinary media proxy enforces exact host and denies redirects', () => {
  assert.match(cloudinaryGuard, /url\.hostname\.toLowerCase\(\) !== CLOUDINARY_DELIVERY_HOST/);
  assert.match(controller, /redirect: 'error'/);
  assert.match(controller, /MAX_MESSAGE_MEDIA_BYTES/);
  assert.match(controller, /remote\.body\.getReader\(\)/);
  assert.doesNotMatch(controller, /remote\.arrayBuffer\(\)/);
  assert.match(controller, /encodeRfc5987FileName/);
  assert.match(controller, /replace\(\/\[\\u0000-\\u001f\\u007f/);
});
check('Redis pending-operation domain errors are thrown outside outage catch', () => {
  const throwIndex = service.indexOf('if (peerStillPending)');
  const catchIndex = service.indexOf('} catch (err) {', service.indexOf('let peerStillPending'));
  assert.ok(throwIndex > catchIndex);
  assert.match(service, /OFFLINE_OPERATION_IN_FLIGHT/);
});
check('message upload memory use is coordinated by one distributed lease through response completion', () => {
  assert.match(uploads, /acquireMediaUploadLease\(\)/);
  assert.match(uploads, /runWithDistributedMediaSlot/);
  assert.match(uploads, /res\.once\('finish', cleanup\)/);
  assert.match(uploads, /res\.once\('close', cleanup\)/);
  assert.match(uploads, /audioUpload\.single\('audio'\)/);
  assert.match(uploads, /messageFileUpload\.single\('file'\)/);
});
check('optimistic rollback removes only the failed local message', () => {
  assert.match(mutations, /Remove only this mutation's optimistic row/);
  assert.match(mutations, /message\.id !== optimisticId/);
  assert.doesNotMatch(mutations, /context\?\.previousMessages/);
});
check('concurrent optimistic rollback restores the latest stable server preview', () => {
  assert.match(mutations, /latestStableMessage/);
  assert.match(mutations, /fallbackMessage = latestStableMessage \?\? stablePreviousMessage/);
});
check('out-of-order message responses preserve newer previews and chronological rows', () => {
  assert.match(mutations, /currentPreview\.id !== optimisticId/);
  assert.match(mutations, /serverPreviewTime < currentPreviewTime/);
  assert.match(mutations, /\[\.\.\.withoutOptimistic, serverMessage\]\.sort/);
});

console.log(`Hidden architecture fixes audit: ${checks.length}/${checks.length} checks passed`);
for (const name of checks) console.log(`PASS ${name}`);
