import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const messaging = read('../src/features/messaging/messaging.api.ts');
const commerce = read('../src/features/commerce/commerce.api.ts');
const stories = read('../src/features/stories/stories.api.ts');
const messageScreen = read('../app/messages/[id].tsx');
const messageSync = read('../src/features/messaging/chat-message-outbox-sync.ts');
const notifications = read('../app/notifications.tsx');
const adDetail = read('../app/ads/[id].tsx');
const productDetail = read('../app/products/[id].tsx');
const productEditor = read('../app/product-editor.tsx');
const myProducts = read('../app/my-products.tsx');
const storyViewer = read('../app/stories/[id].tsx');
for (const name of ['sendMessage','startConversationFromAd','startConversationWithUser','markNotificationRead','markAllNotificationsRead']) {
  const start = messaging.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `${name} exists`);
  const end = messaging.indexOf('\n', start);
  assert.match(messaging.slice(start, end), /X-CSRF-Token/, `${name} sends CSRF header`);
}
for (const name of ['createProduct','updateProduct','deleteProduct']) {
  const start = commerce.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `${name} exists`);
  const end = commerce.indexOf('\n}', start);
  assert.match(commerce.slice(start, end), /X-CSRF-Token/, `${name} sends CSRF header`);
}
assert.match(stories, /markStoryViewed\(storyId: string, token: string, csrfToken\?/);
const storyView = stories.slice(stories.indexOf('export async function markStoryViewed('), stories.indexOf('export async function deleteStory('));
assert.match(storyView, /X-CSRF-Token/);
assert.match(messageScreen, /syncChatMessageOutbox\(\{ isOnline, token: accessToken, csrfToken, ownerId: user\.id, signal: sessionAbort\.current\.signal \}\)/, 'chat screen passes CSRF token into durable message sync');
assert.match(messageSync, /sendMessage\(item\.conversationId, item\.body, snapshot\.token, snapshot\.csrfToken, item\.operationId, snapshot\.signal\)/, 'queued message sync forwards CSRF token to the mutation API');
assert.match(notifications, /markAllNotificationsRead\(accessToken, csrfToken\)/);
assert.match(notifications, /markNotificationRead\(item.id, accessToken, csrfToken\)/);
assert.match(adDetail, /startConversationFromAd\(id, accessToken, csrfToken\)/);
assert.match(productDetail, /startConversationWithUser\([^\n]+csrfToken\)/);
assert.match(productEditor, /createProduct\(payload,accessToken,csrfToken/);
assert.match(productEditor, /updateProduct\(id,payload,accessToken,csrfToken\)/);
assert.match(myProducts, /deleteProduct\(item.id,accessToken,csrfToken\)/);
assert.match(storyViewer, /markStoryViewed\(story.id, accessToken, csrfToken\)/);
console.log('Mutation CSRF audit passed (messaging, notifications, products, and story views).');
