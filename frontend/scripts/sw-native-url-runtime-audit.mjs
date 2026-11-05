#!/usr/bin/env node
/**
 * Runtime regression for the Service Worker URL contract.
 * Browser Request/Response/Cache/WindowClient objects expose `.url`, not `._url`.
 * This executes the actual public/sw.js in a Node VM with minimal Web API fakes.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const listeners = new Map();
const cacheStores = new Map();
const origin = 'https://marketplat.test';

const keyOf = (key) => typeof key === 'string'
  ? new URL(key, origin).href
  : key?.url;

const caches = {
  async open(name) {
    if (!cacheStores.has(name)) cacheStores.set(name, new Map());
    const entries = cacheStores.get(name);
    return {
      match: async (key) => {
        const hit = entries.get(keyOf(key));
        return hit?.clone ? hit.clone() : hit;
      },
      put: async (key, response) => {
        entries.set(keyOf(key), response?.clone ? response.clone() : response);
      },
      delete: async (key) => entries.delete(keyOf(key)),
      keys: async () => [...entries.keys()].map((url) => ({ url })),
    };
  },
  async delete(name) { return cacheStores.delete(name); },
  async keys() { return [...cacheStores.keys()]; },
  async match() { return undefined; },
};

const sandbox = {
  self: {
    location: { origin },
    navigator: { onLine: true },
    registration: {},
    clients: { claim: async () => {}, matchAll: async () => [] },
    addEventListener(type, handler) {
      const entries = listeners.get(type) ?? [];
      entries.push(handler);
      listeners.set(type, entries);
    },
    skipWaiting() {},
  },
  caches,
  importScripts() {},
  fetch: async (input) => {
    const url = new URL(typeof input === 'string' ? input : input.url, origin);
    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ items: [{ id: 'category-1' }] }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'public, max-age=60',
        },
      });
    }
    return new Response('<!doctype html><html><body><main>runtime smoke</main></body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  },
  indexedDB: {},
  console,
  atob,
  btoa,
  URL,
  URLSearchParams,
  Headers,
  TextEncoder,
  Blob,
  Response,
  Request,
  AbortController,
  DOMException,
  queueMicrotask,
  setTimeout,
  clearTimeout,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const bridge = `
  self.__cacheVersion = CACHE_VERSION;
  self.__networkFirstApi = networkFirstApi;
  self.__networkFirstPage = networkFirstPage;
  self.__isSameOriginResponse = isSameOriginResponse;
  self.__isApiRequest = isApiRequest;
  self.__isTrustedApiOrigin = isTrustedApiOrigin;
  self.__queuedEntryUrl = queuedEntryUrl;
  self.__cacheVisitedDocumentShell = cacheVisitedDocumentShell;
`;
vm.runInContext(`${source}\n${bridge}`, sandbox, { filename: 'public/sw.js', timeout: 10_000 });

let passed = 0;
function check(label, actual, expected = true) {
  assert.equal(actual, expected, label);
  passed += 1;
  console.log(`[sw-native-url] PASS ${label}`);
}

const responseUrl = { redirected: true, url: `${origin}/products/1` };
const crossOriginResponseUrl = { redirected: true, url: 'https://outside.invalid/products/1' };
check('redirect validation reads the native Response.url property', sandbox.self.__isSameOriginResponse(responseUrl));
check('cross-origin redirect is rejected using Response.url', sandbox.self.__isSameOriginResponse(crossOriginResponseUrl), false);
check('API URL classification accepts a native URL object', sandbox.self.__isApiRequest(new URL(`${origin}/api/v1/categories`)));
check('trusted API origin uses the URL origin', sandbox.self.__isTrustedApiOrigin(new URL(`${origin}/api/v1/categories`)));
check('untrusted API origin is rejected', sandbox.self.__isTrustedApiOrigin(new URL('https://outside.invalid/api/v1/categories')), false);
check('new offline queue rows read the standard url field', sandbox.self.__queuedEntryUrl({ url: `${origin}/api/v1/products` }) === `${origin}/api/v1/products`);
check('legacy offline queue rows retain _url compatibility', sandbox.self.__queuedEntryUrl({ _url: `${origin}/api/v1/products` }) === `${origin}/api/v1/products`);
check('canonical url wins when both old and new queue fields are present', sandbox.self.__queuedEntryUrl({ url: `${origin}/api/v1/products`, _url: 'https://outside.invalid/api' }) === `${origin}/api/v1/products`);
check('queue rows with no URL are rejected as empty', sandbox.self.__queuedEntryUrl({}) === '');

const apiRequest = {
  url: `${origin}/api/v1/categories`,
  method: 'GET',
  mode: 'cors',
  headers: new Headers(),
  destination: '',
  cache: 'default',
};
const apiResponse = await sandbox.self.__networkFirstApi(
  { waitUntil() {} },
  apiRequest,
  new URL(apiRequest.url),
);
check('network-first API accepts Request.url without a nonstandard _url alias', apiResponse.status === 200);
check('network-first API returns the parsed JSON response body', (await apiResponse.json()).items[0].id === 'category-1');

// Make shell persistence deterministic: this test is about routing and Request.url,
// not the separate HTML + chunk persistence algorithm covered by offline-cache tests.
sandbox.self.__cacheVisitedDocumentShell = async () => 'saved';
const waits = [];
const pageRequest = {
  url: `${origin}/products`,
  method: 'GET',
  mode: 'navigate',
  headers: new Headers(),
  destination: 'document',
  cache: 'default',
};
const pageResponse = await sandbox.self.__networkFirstPage(
  { waitUntil(promise) { waits.push(Promise.resolve(promise)); } },
  pageRequest,
);
check('network-first document accepts Request.url without a nonstandard _url alias', pageResponse.status === 200);
check('document route returns HTML for a normal navigation', (pageResponse.headers.get('content-type') || '').includes('text/html'));
await Promise.allSettled(waits);

check('service worker cache version is v96 after URL-contract migration', sandbox.self.__cacheVersion === 'v96');
console.log(`[sw-native-url] ${passed}/${passed} runtime checks passed`);
