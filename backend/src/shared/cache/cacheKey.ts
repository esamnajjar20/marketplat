/** Canonical cache identity algorithm. Keep frontend/backend copies byte-for-byte equivalent. */
export const CACHE_KEY_ALGORITHM_VERSION = 1 as const;
export type CanonicalScope = 'public' | 'personal' | 'private';
export function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
export function canonicalCacheKey(namespace: string, scope: CanonicalScope, input: unknown): string {
  const serialized = stableSerialize(input);
  const identity = serialized.length <= 180 ? serialized : `hash:${fnv1a(serialized)}:${serialized.length}`;
  return `ck:v${CACHE_KEY_ALGORITHM_VERSION}:${scope}:${namespace}:${identity}`;
}
export function canonicalPathname(pathname: string): string {
  const withoutApiVersion = pathname.replace(/^\/api\/v\d+/, '');
  const normalized = withoutApiVersion.replace(/\/+/g, '/');
  if (!normalized || normalized === '/') return '/';
  return `/${normalized.replace(/^\/+|\/+$/g, '')}`;
}
export function canonicalUrlIdentity(input: string): string {
  const withoutOrigin = input.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, '');
  const [rawPath, rawQuery = ''] = withoutOrigin.split('?', 2);
  const pairs = rawQuery
    .split('&')
    .filter(Boolean)
    .map((part) => {
      const [rawKey = '', rawValue = ''] = part.split('=', 2);
      const decode = (value: string) => {
        try { return decodeURIComponent(value.replace(/\+/g, ' ')); } catch { return value; }
      };
      return [decode(rawKey), decode(rawValue)] as const;
    })
    .sort(([ak, av], [bk, bv]) => ak === bk ? av.localeCompare(bv) : ak.localeCompare(bk));
  const query = pairs.length
    ? `?${pairs.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')}`
    : '';
  return `${canonicalPathname(rawPath || '/')}${query}`;
}


export function canonicalGenerationKey(namespace: string, scope: 'public' | 'personal' | 'private', strength: 'hard' | 'soft'): string {
  return canonicalCacheKey(namespace, scope, { kind: 'generation', strength });
}
