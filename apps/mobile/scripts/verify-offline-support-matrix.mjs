import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

const matrix = read('src/lib/offline-support.ts');
const productEditor = read('app/product-editor.tsx');
const serviceEditor = read('app/service-editor.tsx');
const myProducts = read('app/my-products.tsx');
const myServices = read('app/my-services.tsx');
const appointmentCreate = read('app/appointment-create.tsx');
const bridge = read('src/storage/ChatMessageOutboxLifecycleBridge.tsx');
const mediaSync = read('src/features/messaging/chat-media-outbox-sync.ts');
const chatScreen = read('app/messages/[id].tsx');
const queueScreen = read('app/offline-queue.tsx');
const backupRules = read('android/app/src/main/res/xml/secure_store_backup_rules.xml');
const extractionRules = read('android/app/src/main/res/xml/secure_store_data_extraction_rules.xml');
const publicCache = read('src/storage/public-cache.ts');

// 1) Support matrix declares the online-only operations and the guards use it before any network call.
for (const op of ['edit-product', 'delete-product', 'edit-service', 'delete-service', 'create-appointment']) {
  assert.match(matrix, new RegExp(`'${op}': 'online-only'`), `${op} must be declared online-only`);
}
for (const op of ['create-product', 'create-service', 'send-chat-message', 'send-chat-attachment']) {
  assert.match(matrix, new RegExp(`'${op}': 'offline'`), `${op} must be declared offline-capable`);
}
assert.match(productEditor, /onlineOnlyBlockReason\('edit-product'\)/);
assert.match(serviceEditor, /onlineOnlyBlockReason\('edit-service'\)/);
assert.match(myProducts, /onlineOnlyBlockReason\('delete-product'\)/);
assert.match(myServices, /onlineOnlyBlockReason\('delete-service'\)/);
// The guard must run BEFORE the mutating API call, not after it fails.
assert.ok(productEditor.indexOf("onlineOnlyBlockReason('edit-product')") < productEditor.indexOf('await updateProduct('), 'edit-product guard must precede updateProduct');
assert.ok(serviceEditor.indexOf("onlineOnlyBlockReason('edit-service')") < serviceEditor.indexOf('await updateMyServiceListing('), 'edit-service guard must precede updateMyServiceListing');
assert.ok(myProducts.indexOf("onlineOnlyBlockReason('delete-product')") < myProducts.indexOf('deleteProduct(item.id'), 'delete-product guard must precede deleteProduct');
assert.ok(myServices.indexOf("onlineOnlyBlockReason('delete-service')") < myServices.indexOf('deleteMyServiceListing(id'), 'delete-service guard must precede deleteMyServiceListing');

// The delete guard must ALSO run inside the confirmation callback: connectivity can drop while the dialog is open.
const afterOnPress = (src, from) => src.slice(src.indexOf('onPress', src.indexOf(from)));
assert.match(afterOnPress(myProducts, "confirmAlert('حذف المنتج'"), /onlineOnlyBlockReason\('delete-product'\)[\s\S]*await deleteProduct\(/, 'delete-product must be re-checked inside the confirm onPress, before deleteProduct');
assert.match(afterOnPress(myServices, "confirmAlert('حذف الخدمة'"), /onlineOnlyBlockReason\('delete-service'\)[\s\S]*deleteMyServiceListing\(/, 'delete-service must be re-checked inside the confirm onPress, before deleteMyServiceListing');

// Booking: the guard must exist and precede the API call.
assert.match(appointmentCreate, /onlineOnlyBlockReason\('create-appointment'\)/, 'appointment-create must call the online-only guard');
assert.ok(appointmentCreate.indexOf("onlineOnlyBlockReason('create-appointment')") < appointmentCreate.indexOf('await createAppointment('), 'create-appointment guard must precede createAppointment');

// Every operation the matrix declares online-only must be enforced by at least one screen (no declared-but-unguarded entries).
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = resolve(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.(tsx?|jsx?)$/.test(name) ? [full] : [];
  });
}
const appSources = walk(resolve(root, 'app')).map((f) => readFileSync(f, 'utf8'));
for (const [, op] of matrix.matchAll(/'([a-z-]+)': 'online-only'/g)) {
  assert.ok(appSources.some((src) => src.includes(`onlineOnlyBlockReason('${op}')`)), `${op} is declared online-only but no screen calls onlineOnlyBlockReason('${op}')`);
}

// 2) Chat attachments sync from the app-level bridge, and an open conversation still receives the result.
assert.match(bridge, /syncChatMediaOutbox\(/);
assert.match(bridge, /import \{ syncChatMediaOutbox \}/);
assert.match(mediaSync, /export function subscribeChatMediaOutboxSent/);
assert.match(mediaSync, /persistCachedChatMessages\(snapshot\.ownerId/);
// Must use the result-reporting writer: saveCachedChatMessages swallows SQLite errors, so retry-on-failure would be dead code.
assert.doesNotMatch(mediaSync, /\bsaveCachedChatMessages\b/, 'media sync must use persistCachedChatMessages (reports failure), not the error-swallowing saveCachedChatMessages');
assert.match(read('src/storage/chat-message-cache.ts'), /Promise<CachePersistResult>/);
// The local cache write must complete BEFORE the queue row/file is removed (no fire-and-forget).
assert.doesNotMatch(mediaSync, /void persistCachedChatMessages/, 'cache write must be awaited, not fire-and-forget');
assert.ok(mediaSync.indexOf('await persistCachedChatMessages(') < mediaSync.indexOf('await acknowledgeChatMedia('), 'cache write must precede acknowledgeChatMedia');
assert.match(chatScreen, /subscribeChatMediaOutboxSent\(/);
assert.doesNotMatch(chatScreen, /for \(const item of result\.sent\)/, 'screen must not merge results itself (would duplicate with the subscription)');

// 3) The queue screen tells the truth about background sync limits.
assert.match(queueScreen, /ولا تُرسل بعد إغلاق التطبيق بالكامل/);

// 4) Attachment files never leave the device through backup/transfer, and are wiped on sign-out.
for (const [name, xml] of [['full backup', backupRules], ['data extraction', extractionRules]]) {
  assert.match(xml, /<exclude domain="file" path="\."\s*\/>/, `${name} rules must exclude the app files domain (chat media outbox lives there)`);
}
assert.match(publicCache, /marketplat-chat-media-outbox\//);
assert.match(publicCache, /isOwnedChatMediaUri/);

console.log('Offline support matrix audit passed.');
