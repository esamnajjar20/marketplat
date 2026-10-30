const DEFAULT_WEB_ORIGIN = 'https://marketplat.esamnajjar6.workers.dev';

/** Resolve public legal pages against an environment-specific web origin. */
export function getConfiguredWebUrl(path: string): string {
  const candidate = process.env.EXPO_PUBLIC_WEB_URL?.trim() || DEFAULT_WEB_ORIGIN;
  let origin = DEFAULT_WEB_ORIGIN;
  try {
    const parsed = new URL(candidate);
    if (['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password && !parsed.search && !parsed.hash && (parsed.pathname === '/' || parsed.pathname === '')) origin = parsed.origin;
  } catch { /* fall back to the production origin rather than opening an unsafe URL */ }
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}
