import { revalidatePath, revalidateTag } from 'next/cache';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MAX_BODY_BYTES = 8_192;
const MAX_TAGS = 30;
const MAX_CLOCK_SKEW_SECONDS = 300;
const NO_STORE_HEADERS = { 'cache-control': 'no-store, max-age=0' };

const ROUTE_TAG_PATHS: Record<string, ReadonlyArray<{ path: string; type?: 'page' }>> = {
  'route:home': [{ path: '/' }],
  'route:ads': [{ path: '/ads' }, { path: '/ads/[id]', type: 'page' }],
  'route:search': [{ path: '/search' }, { path: '/ads' }],
  'route:products': [{ path: '/products' }, { path: '/products/[id]', type: 'page' }],
  'route:stores': [{ path: '/stores' }, { path: '/stores/[id]', type: 'page' }],
  'route:service-listings': [{ path: '/services' }, { path: '/services/[id]', type: 'page' }],
  'route:service-providers': [
    { path: '/service-providers' },
    { path: '/service-providers/[id]', type: 'page' },
  ],
  'route:categories': [{ path: '/categories' }, { path: '/categories/[slug]', type: 'page' }],
  'route:product-categories': [{ path: '/products' }, { path: '/ads' }],
  'route:service-categories': [{ path: '/services' }],
  'route:service-types': [{ path: '/services' }],
  'route:store-types': [{ path: '/stores' }],
};

const KNOWN_ROUTE_TAGS = new Set(Object.keys(ROUTE_TAG_PATHS));
const ENTITY_TAG_PATTERN = /^(?:ad|product|store|service|provider|category):[A-Za-z0-9_-]{1,128}$/;
const CITY_TAG_PATTERN = /^city:[A-Za-z0-9%._~-]{1,180}$/;

type RevalidationBindings = { NEXT_CACHE_REVALIDATION_SECRET?: string };

function getRevalidationSecret(): string | null {
  const processSecret = process.env.NEXT_CACHE_REVALIDATION_SECRET?.trim();
  if (processSecret) return processSecret;

  try {
    const bindings = getCloudflareContext().env as unknown as RevalidationBindings;
    return bindings.NEXT_CACHE_REVALIDATION_SECRET?.trim() || null;
  } catch {
    return null;
  }
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function signBody(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  return `sha256=${toHex(signature)}`;
}

function isAllowedTag(tag: string): boolean {
  return tag === 'api' || KNOWN_ROUTE_TAGS.has(tag) || ENTITY_TAG_PATTERN.test(tag) || CITY_TAG_PATTERN.test(tag);
}

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: NO_STORE_HEADERS });
}

async function readBoundedBody(request: Request): Promise<{ body: string; tooLarge: boolean }> {
  if (!request.body) return { body: '', tooLarge: false };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        await reader.cancel();
        return { body: '', tooLarge: true };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { body: new TextDecoder('utf-8', { fatal: true }).decode(combined), tooLarge: false };
  } catch {
    return { body: '', tooLarge: false };
  }
}

export async function POST(request: Request): Promise<Response> {
  const secret = getRevalidationSecret();
  if (!secret || secret.length < 32) {
    return json(503, { ok: false, error: 'cache revalidation is not configured' });
  }

  const timestamp = request.headers.get('x-marketplat-timestamp') ?? '';
  const suppliedSignature = request.headers.get('x-marketplat-signature') ?? '';
  if (!/^\d{10}$/.test(timestamp)) {
    return json(401, { ok: false, error: 'unauthorized' });
  }

  const timestampSeconds = Number(timestamp);
  if (
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS
  ) {
    return json(401, { ok: false, error: 'expired signature' });
  }

  const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    return json(415, { ok: false, error: 'unsupported media type' });
  }

  const contentLength = request.headers.get('content-length');
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_BODY_BYTES)) {
    return json(413, { ok: false, error: 'payload too large' });
  }

  let body: string;
  try {
    const bounded = await readBoundedBody(request);
    if (bounded.tooLarge) return json(413, { ok: false, error: 'payload too large' });
    body = bounded.body;
  } catch {
    return json(400, { ok: false, error: 'invalid body' });
  }

  let expectedSignature: string;
  try {
    expectedSignature = await signBody(secret, timestamp, body);
  } catch {
    return json(500, { ok: false, error: 'signature verification failed' });
  }
  if (!constantTimeEqual(expectedSignature, suppliedSignature)) {
    return json(401, { ok: false, error: 'unauthorized' });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return json(400, { ok: false, error: 'invalid JSON' });
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    Object.keys(payload).length !== 1 ||
    !Array.isArray((payload as { tags?: unknown }).tags)
  ) {
    return json(400, { ok: false, error: 'invalid payload' });
  }

  const rawTags = (payload as { tags: unknown[] }).tags;
  if (
    rawTags.length === 0 ||
    rawTags.length > MAX_TAGS ||
    rawTags.some((tag) => typeof tag !== 'string' || !isAllowedTag(tag))
  ) {
    return json(400, { ok: false, error: 'invalid cache tags' });
  }

  const tags = [...new Set(rawTags as string[])];
  const effectiveTags = new Set(tags);
  // The existing ads edge cache intentionally uses city-scoped tags so a
  // change in one city does not evict every Worker cache entry. Next's Stage 2
  // browse cache is only the canonical unfiltered listing, not city-partitioned;
  // translate any city purge into invalidation of the shared ads/home entries.
  if (tags.some((tag) => tag.startsWith('city:'))) {
    effectiveTags.add('route:ads');
    effectiveTags.add('route:home');
  }

  const paths = new Map<string, 'page' | undefined>();

  try {
    for (const tag of effectiveTags) {
      revalidateTag(tag);
      for (const entry of ROUTE_TAG_PATHS[tag] ?? []) {
        paths.set(entry.path, entry.type);
      }
    }

    for (const [path, type] of paths) {
      if (type) revalidatePath(path, type);
      else revalidatePath(path);
    }
  } catch {
    return json(500, { ok: false, error: 'cache revalidation failed' });
  }

  return json(200, { ok: true, revalidatedTags: effectiveTags.size, revalidatedPaths: paths.size });
}

export async function GET(): Promise<Response> {
  return json(405, { ok: false, error: 'method not allowed' });
}
