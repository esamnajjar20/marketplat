#!/usr/bin/env node
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(join(root, path), 'utf8');
const pager = await read('src/hooks/usePaginatedList.ts');
const asyncResource = await read('src/hooks/useAsyncResource.ts');
const pagination = await read('src/lib/pagination.ts');
const commerceApi = await read('src/features/commerce/commerce.api.ts');
const socialApi = await read('src/features/account/social.api.ts');
const requestsApi = await read('src/features/requests/requests.api.ts');

for (const [pattern, message] of [
  [/new AbortController\(\)/, 'shared pager must create cancellable requests'],
  [/generationRef/, 'shared pager must reject stale responses'],
  [/mergeUniquePageItems/, 'shared pager must de-duplicate items across pages'],
  [/loadMoreError/, 'append failures must be isolated from initial-load failures'],
  [/updateItems/, 'mutations must be able to update the canonical list state and its ref'],
  [/refreshControllerRef\.current\?\.abort\(\)/, 'refresh must cancel an older refresh'],
  [/refreshInFlightRef/, 'append requests must not race a page-one refresh'],
  [/stateKey === key/, 'rows from a previous entity or account must be hidden before the new effect runs'],
]) assert.match(pager, pattern, message);

assert.match(asyncResource, /new AbortController\(\)/, 'shared resource loader must cancel superseded requests');
assert.match(asyncResource, /controllerRef\.current\?\.abort\(\)/, 'shared resource loader must abort on key changes and unmount');
assert.match(asyncResource, /seq\.current \+= 1/, 'shared resource loader must ignore completions after cleanup');
assert.match(pagination, /export function mergeUniquePageItems/, 'pagination helpers must expose shared de-duplication');

for (const [source, name] of [[commerceApi, 'commerce'], [socialApi, 'social'], [requestsApi, 'request']]) {
  assert.match(source, /signal\??\s*:\s*AbortSignal/, `${name} list APIs must accept AbortSignal`);
  assert.match(source, /signal\s*\}/, `${name} list APIs must forward AbortSignal to apiRequest`);
}

for (const file of [
  'app/products.tsx',
  'app/my-products.tsx',
  'app/followed-stores.tsx',
  'app/following-feed.tsx',
  'app/profile/[id]/followers.tsx',
  'app/profile/[id]/following.tsx',
  'app/my-reports.tsx',
  'app/my-requests.tsx',
  'app/my-offers.tsx',
]) {
  const source = await read(file);
  assert.match(source, /usePaginatedList/, `${file} must use the shared paginated-list lifecycle`);
}

for (const [file, expected] of [
  ['app/categories.tsx', 'fetchPublicCategories'],
  ['app/store-collections-public.tsx', 'fetchPublicCollections'],
  ['app/sellers-ranking.tsx', 'fetchSellerRanking'],
]) {
  const source = await read(file);
  assert.match(source, /useAsyncResource/, `${file} must use the shared async-resource lifecycle`);
  assert.ok(source.includes(expected), `${file} must retain its feature API`);
}

const packageJson = JSON.parse(await read('package.json'));
assert.ok(!packageJson.dependencies?.['@tanstack/react-query'], 'do not claim Query is active without installing and wiring it');
await assert.rejects(access(join(root, 'src/providers/QueryProvider.tsx')));
await assert.rejects(access(join(root, 'src/features/discovery/useHomeAdsQuery.ts')));
await assert.rejects(access(join(root, 'app/_layout.QUERY-SNIPPET.tsx')));

const chatScreen = await read('app/messages/[id].tsx');
assert.doesNotMatch(chatScreen, /usePaginatedList/, 'cursor-based conversation history must not be forced into page-number pagination');

const layout = await read('app/_layout.tsx');
assert.match(layout, /I18nManager\.allowRTL\(false\)/, 'do not enable native RTL before removing the existing manual mirroring');
assert.match(layout, /I18nManager\.forceRTL\(false\)/, 'manual RTL layout must not be double-mirrored');

console.log('✅ Shared data lifecycle checks passed: cancellable resources, numbered lists, API signal forwarding, cursor-chat exception, honest Query wiring, and RTL safety.');
