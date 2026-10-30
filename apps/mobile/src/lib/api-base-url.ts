/**
 * Single source of truth for the native API origin.
 * EXPO_PUBLIC_API_URL must be an origin (for example https://api.example.com),
 * not an endpoint or a path-prefixed API URL. Invalid values fail closed.
 */
export function normalizeApiBaseUrl(
  value: unknown,
  options: { allowInsecureLoopback?: boolean } = {}
): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (parsed.protocol === 'http:') {
      const host = parsed.hostname.toLowerCase();
      const isDevelopmentLoopback = new Set([
        'localhost',
        '127.0.0.1',
        '::1',
        '[::1]',
        '10.0.2.2', // Android emulator host bridge
        '10.0.3.2', // Genymotion host bridge
      ]).has(host);
      if (!options.allowInsecureLoopback || !isDevelopmentLoopback) return null;
    }
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    if (parsed.pathname !== '/' && parsed.pathname !== '') return null;
    return parsed.origin.replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function getConfiguredApiBaseUrl(): string | null {
  return normalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_URL, {
    allowInsecureLoopback: typeof __DEV__ !== 'undefined' && __DEV__,
  });
}

export function getApiReachabilityUrl(): string | null {
  const baseUrl = getConfiguredApiBaseUrl();
  return baseUrl ? `${baseUrl}/api/v1/categories` : null;
}

export const API_BASE_URL_ERROR =
  'عنوان API غير مضبوط أو غير صالح. أضف EXPO_PUBLIC_API_URL كعنوان أصل صحيح دون /api/v1.';
