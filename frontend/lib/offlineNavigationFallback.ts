/**
 * Offline navigation fallback for the Next.js App Router.
 *
 * A Flight/RSC payload is tied to the current router state and cannot safely
 * be replayed from a path-only cache. When an internal SPA navigation cannot
 * obtain its Flight response, convert that navigation into a normal document
 * navigation. The Service Worker can then serve the already-visited, verified
 * HTML shell and its cached chunks.
 */
import { isDeviceOffline } from '@/lib/offlineError';


const INTERNAL_NON_PAGE_PATHS = ['/api', '/_next', '/auth', '/csrf', '/login', '/register', '/forgot-password', '/reset-password'];

function isNonPagePath(pathname: string): boolean {
  return INTERNAL_NON_PAGE_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function resolveRequest(input: RequestInfo | URL, init?: RequestInit): {
  url: URL;
  method: string;
  headers: Headers;
} | null {
  try {
    const sourceUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(sourceUrl, window.location.href);
    const sourceHeaders = input instanceof Request ? input.headers : undefined;
    const headers = new Headers(sourceHeaders);
    if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    return { url, method, headers };
  } catch {
    return null;
  }
}

export function getOfflineDocumentUrl(input: URL, baseHref = window.location.href): URL | null {
  try {
    const target = new URL(input.href, baseHref);
    const current = new URL(baseHref);
    if (target.origin !== current.origin) return null;
    if (isNonPagePath(target.pathname)) return null;
    target.searchParams.delete('_rsc');
    return target;
  } catch {
    return null;
  }
}

export function isNextFlightRequest(input: RequestInfo | URL, init?: RequestInit): URL | null {
  const request = resolveRequest(input, init);
  if (!request || request.method !== 'GET') return null;
  const { url, headers } = request;
  if (url.origin !== window.location.origin) return null;
  const accept = (headers.get('accept') ?? '').toLowerCase();
  const isFlight = headers.get('rsc') === '1'
    || headers.has('next-router-state-tree')
    || headers.has('next-router-prefetch')
    || accept.includes('text/x-component')
    || url.searchParams.has('_rsc');
  if (!isFlight) return null;
  return getOfflineDocumentUrl(url);
}

/**
 * OFFLINE-PREFETCH-01: Link/router.prefetch requests are speculative (the user has
 * not asked to go anywhere). A failed prefetch must never turn into a document
 * navigation, otherwise cutting the connection while viewing a page can throw the
 * user onto some other page's shell or the SW's "page could not load" screen.
 */
export function isNextPrefetchRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  const request = resolveRequest(input, init);
  if (!request) return false;
  const { headers } = request;
  return headers.has('next-router-prefetch')
    || headers.has('next-router-segment-prefetch')
    || (headers.get('purpose') ?? '').toLowerCase() === 'prefetch';
}

function findAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest('a[href]');
  return anchor instanceof HTMLAnchorElement ? anchor : null;
}

/** Installs once per document and returns a complete cleanup callback. */
export function installOfflineNavigationFallback(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  const serviceWorker = navigator.serviceWorker;
  if (!serviceWorker || !window.fetch) return () => {};

  let redirecting = false;
  const originalFetch: typeof window.fetch = window.fetch.bind(window);

  const hardNavigate = (target: URL | null): boolean => {
    if (!target || redirecting || !serviceWorker.controller) return false;
    const current = new URL(window.location.href);
    const sameDocument = current.pathname === target.pathname && current.search === target.search;
    if (sameDocument && (!target.hash || current.hash === target.hash)) return false;
    redirecting = true;
    window.location.assign(target.href);
    return true;
  };

  const onClick = (event: MouseEvent) => {
    if (!isDeviceOffline() || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = findAnchor(event.target);
    if (!anchor || anchor.hasAttribute('download')) return;
    if (anchor.target && anchor.target.toLowerCase() !== '_self') return;
    if (anchor.rel.toLowerCase().split(/\s+/).includes('external')) return;

    let target: URL;
    try { target = new URL(anchor.href, window.location.href); } catch { return; }
    const current = new URL(window.location.href);
    if (target.origin !== current.origin) return;
    if (target.pathname === current.pathname && target.search === current.search && target.hash) return;

    const documentUrl = getOfflineDocumentUrl(target);
    if (!documentUrl) return;
    if (hardNavigate(documentUrl)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  };

  // Programmatic router.push/replace and Links whose RSC request fails are
  // covered here. AbortError is intentionally ignored because Next aborts
  // obsolete prefetches and superseded navigations during normal operation.
  const wrappedFetch: typeof window.fetch = function (input, init) {
    const isPrefetch = isNextPrefetchRequest(input, init);
    // Prefetches are passed through untouched: Next handles their failures itself.
    const documentUrl = isPrefetch ? null : isNextFlightRequest(input, init);
    let result: Promise<Response>;
    try {
      result = originalFetch(input, init);
    } catch (error) {
      if (documentUrl && (error as { name?: string })?.name !== 'AbortError') hardNavigate(documentUrl);
      throw error;
    }
    if (!documentUrl) return result;
    return result.catch((error: unknown) => {
      if ((error as { name?: string })?.name !== 'AbortError') hardNavigate(documentUrl);
      throw error;
    });
  };

  document.addEventListener('click', onClick, true);
  window.fetch = wrappedFetch;

  return () => {
    document.removeEventListener('click', onClick, true);
    if (window.fetch === wrappedFetch) window.fetch = originalFetch;
  };
}
